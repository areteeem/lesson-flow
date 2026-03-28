import { getSupabaseClient, getSupabaseConfig, isSupabaseConfigured } from './supabaseClient';
import { loadAppSettings } from './appSettings';

const CLOUD_STATUS_KEY = 'lesson-flow-cloud-status';
const DEV_PROXY_BASE = '/__supabase';
const CAN_USE_DEV_PROXY = Boolean(import.meta.env.DEV);

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
        path: 'direct',
      },
    };
  } catch (error) {
    if (!CAN_USE_DEV_PROXY) {
      return {
        ok: false,
        message: error?.message || 'Failed to reach Supabase from browser',
        diagnostics: {
          host,
          thrown: error?.message || String(error),
          online: typeof navigator !== 'undefined' ? navigator?.onLine !== false : null,
          path: 'direct',
        },
      };
    }

    try {
      const proxyResponse = await fetch(`${DEV_PROXY_BASE}/rest/v1/lesson_drafts?select=lesson_id&limit=1`, {
        method: 'GET',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
      });

      if (proxyResponse.ok) {
        return {
          ok: true,
          message: 'Direct fetch blocked, but dev proxy connection works.',
          diagnostics: {
            host,
            status: proxyResponse.status,
            path: 'proxy',
            directError: error?.message || String(error),
          },
        };
      }

      const proxyText = await proxyResponse.text();
      const hasTableHint = proxyText.includes('PGRST205') || proxyText.includes('lesson_drafts');
      const likelyCause = proxyResponse.status === 404
        ? (hasTableHint ? 'missing_table' : 'proxy_inactive')
        : 'other';
      const detailedMessage = likelyCause === 'missing_table'
        ? 'Direct fetch failed and lesson_drafts is missing in Supabase.'
        : likelyCause === 'proxy_inactive'
          ? 'Direct fetch failed and dev proxy returned 404. Restart npm run dev to reload Vite proxy.'
          : `Direct fetch failed and proxy returned HTTP ${proxyResponse.status}`;

      return {
        ok: false,
        message: detailedMessage,
        diagnostics: {
          host,
          status: proxyResponse.status,
          path: 'proxy',
          likelyCause,
          response: proxyText || null,
          directError: error?.message || String(error),
        },
      };
    } catch (proxyError) {
      return {
        ok: false,
        message: error?.message || 'Failed to reach Supabase from browser',
        diagnostics: {
          host,
          thrown: error?.message || String(error),
          proxyThrown: proxyError?.message || String(proxyError),
          online: typeof navigator !== 'undefined' ? navigator?.onLine !== false : null,
          path: 'none',
        },
      };
    }
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

async function tryProxyUpsert({ payload, now, lesson, source, host, directError }) {
  if (!CAN_USE_DEV_PROXY) {
    return {
      state: 'error',
      message: directError || 'Cloud sync failed.',
      updatedAt: now,
      source: source || 'unknown',
      lessonId: lesson?.id || null,
      diagnostics: {
        host,
        path: 'direct',
        directError,
      },
    };
  }

  const { anonKey } = getSupabaseConfig();
  const proxyResponse = await fetch(`${DEV_PROXY_BASE}/rest/v1/lesson_drafts?on_conflict=lesson_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  });

  if (proxyResponse.ok) {
    const okViaProxy = {
      state: 'synced',
      message: 'Saved to cloud via dev proxy',
      updatedAt: now,
      source: source || 'unknown',
      lessonId: lesson?.id || null,
      diagnostics: {
        host,
        path: 'proxy',
        directError,
      },
    };
    safeWriteStatus(okViaProxy);
    return okViaProxy;
  }

  const proxyErrorText = await proxyResponse.text();
  const hasTableHint = proxyErrorText.includes('PGRST205') || proxyErrorText.includes('lesson_drafts');
  const likelyCause = proxyResponse.status === 404
    ? (hasTableHint ? 'missing_table' : 'proxy_inactive')
    : 'other';
  const failedViaProxy = {
    state: 'error',
    message: likelyCause === 'missing_table'
      ? 'Cloud sync failed: lesson_drafts table is missing in Supabase.'
      : likelyCause === 'proxy_inactive'
        ? 'Cloud sync failed via proxy (HTTP 404). Restart npm run dev to reload proxy config.'
        : `Cloud sync failed via proxy (HTTP ${proxyResponse.status})`,
    updatedAt: now,
    source: source || 'unknown',
    lessonId: lesson?.id || null,
    diagnostics: {
      host,
      path: 'proxy',
      status: proxyResponse.status,
      likelyCause,
      response: proxyErrorText || null,
      directError,
    },
  };
  safeWriteStatus(failedViaProxy);
  return failedViaProxy;
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
      if ((error.message || '').toLowerCase().includes('failed to fetch')) {
        try {
          return await tryProxyUpsert({
            payload,
            now,
            lesson,
            source: meta.source,
            host,
            directError: error.message,
          });
        } catch {
          // Fall through to detailed failed status below.
        }
      }

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
    try {
      return await tryProxyUpsert({
        payload,
        now,
        lesson,
        source: meta.source,
        host,
        directError: error?.message || String(error),
      });
    } catch (proxyError) {
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
          proxyThrown: proxyError?.message || String(proxyError),
          probe,
          online: typeof navigator !== 'undefined' ? navigator?.onLine !== false : null,
        },
      };
      safeWriteStatus(failed);
      return failed;
    }
  }
}
