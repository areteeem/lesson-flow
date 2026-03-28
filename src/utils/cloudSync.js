import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
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

export async function syncLessonToCloud(lesson, meta = {}) {
  const now = Date.now();
  const availability = getCloudSyncAvailability();

  if (!availability.available) {
    const status = {
      state: availability.reason === 'disabled' ? 'disabled' : 'unavailable',
      message: availability.reason,
      updatedAt: now,
      source: meta.source || 'unknown',
      lessonId: lesson?.id || null,
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
    const failed = {
      state: 'error',
      message: error?.message || 'Cloud sync failed.',
      updatedAt: now,
      source: meta.source || 'unknown',
      lessonId: lesson?.id || null,
    };
    safeWriteStatus(failed);
    return failed;
  }
}
