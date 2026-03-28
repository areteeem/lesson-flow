import { getSupabaseClient, getSupabaseConfig, isSupabaseConfigured } from './supabaseClient';
import { loadAppSettings } from './appSettings';

const CLOUD_STATUS_KEY = 'lesson-flow-cloud-status';

function safeWriteStatus(status) {
  try {
    localStorage.setItem(CLOUD_STATUS_KEY, JSON.stringify(status));
  } catch {
    // Ignore storage write failures.
  }
}

export function readCloudSyncStatus() {
  try {
    const raw = localStorage.getItem(CLOUD_STATUS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function testCloudSyncConnection() {
  const availability = getCloudSyncAvailability();
  const { url, anonKey, host } = getSupabaseConfig();

  if (!availability.available) {
    return {
      ok: false,
      message: `Cloud unavailable: ${availability.reason}`,
      diagnostics: { reason: availability.reason, host },
    };
  }

  try {
    const response = await fetch(`${url}/rest/v1/lesson_drafts?select=lesson_id&limit=1`, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `Endpoint responded with HTTP ${response.status}`,
        diagnostics: {
          host,
          status: response.status,
          statusText: response.statusText,
        },
      };
    }

    return {
      ok: true,
      message: 'Browser can reach Supabase REST endpoint.',
      diagnostics: {
        host,
        status: response.status,
      },
    };
  } catch (error) {
    return {
      ok: false,
      message: error?.message || 'Failed to reach Supabase from browser',
      diagnostics: {
        host,
        thrown: error?.message || String(error),
        online: typeof navigator !== 'undefined' ? navigator?.onLine !== false : null,
      },
    };
  }
}

export function isCloudSyncEnabledInSettings() {
  const settings = loadAppSettings();
  return settings.cloudSyncEnabled !== false;
}

export function getCloudSyncAvailability() {
  if (!isCloudSyncEnabledInSettings()) {
    return { available: false, reason: 'disabled' };
  }
  if (!isSupabaseConfigured()) {
    return { available: false, reason: 'unconfigured' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { available: false, reason: 'client_unavailable' };
  }
  return { available: true, reason: 'ready' };
}

async function probeSupabaseEndpoint() {
  const { url, anonKey, host } = getSupabaseConfig();
  if (!url) {
    return { ok: false, reason: 'missing_url', host };
  }

  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey: anonKey,
      },
    });
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      host,
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'network',
      message: error?.message || 'Failed to reach Supabase endpoint',
      host,
    };
  }
}

function buildNetworkMessage(probe) {
  if (typeof navigator !== 'undefined' && navigator?.onLine === false) {
    return 'Browser appears offline. Saved locally only.';
  }

  if (!probe?.ok && probe?.reason === 'network') {
    return `Cannot reach Supabase (${probe.host || 'unknown host'}) from this browser. Check ad blocker, VPN/firewall, DNS, or corporate network policy.`;
  }

  if (!probe?.ok && typeof probe?.status === 'number') {
    return `Supabase endpoint responded with HTTP ${probe.status}. Verify project status and API access.`;
  }

  return 'Saved locally, but cloud sync request could not be completed.';
}

export async function syncLessonToCloud(lesson, meta = {}) {
  const now = Date.now();
  const availability = getCloudSyncAvailability();
  const { host } = getSupabaseConfig();

  if (!availability.available) {
    const status = {
      state: availability.reason === 'disabled' ? 'disabled' : 'unavailable',
      message: availability.reason,
      updatedAt: now,
      source: meta.source || 'unknown',
      lessonId: lesson?.id || null,
      diagnostics: {
        host,
        reason: availability.reason,
      },
    };
    safeWriteStatus(status);
    return status;
  }

  const client = getSupabaseClient();
  const payload = {
    lesson_id: lesson.id,
    title: lesson.title || 'Untitled Lesson',
    payload: lesson,
    client_updated_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  };

  try {
    const { error } = await client.from('lesson_drafts').upsert(payload, { onConflict: 'lesson_id' });
    if (error) {
      const failed = {
        state: 'error',
        message: error.message || 'Cloud sync failed.',
        updatedAt: now,
        source: meta.source || 'unknown',
        lessonId: lesson?.id || null,
        diagnostics: {
          host,
          code: error.code || null,
          hint: error.hint || null,
          details: error.details || null,
        },
      };
      safeWriteStatus(failed);
      return failed;
    }

    const ok = {
      state: 'synced',
      message: 'Saved to cloud',
      updatedAt: now,
      source: meta.source || 'unknown',
      lessonId: lesson?.id || null,
    };
    safeWriteStatus(ok);
    return ok;
  } catch (error) {
    const probe = await probeSupabaseEndpoint();
    const failed = {
      state: 'error',
      message: buildNetworkMessage(probe),
      updatedAt: now,
      source: meta.source || 'unknown',
      lessonId: lesson?.id || null,
      diagnostics: {
        host,
        thrown: error?.message || String(error),
        probe,
        online: typeof navigator !== 'undefined' ? navigator?.onLine !== false : null,
      },
    };
    safeWriteStatus(failed);
    return failed;
  }
}
