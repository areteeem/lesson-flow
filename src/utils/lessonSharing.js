import { ensureSession, getSessionUser } from './accountAuth';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

const SHARING_STATUS_KEY = 'lesson-flow-sharing-status';

function safeWriteStatus(status) {
  try {
    localStorage.setItem(SHARING_STATUS_KEY, JSON.stringify(status));
  } catch {
    // Ignore storage write failures.
  }
}

export function readLessonSharingStatus() {
  try {
    const raw = localStorage.getItem(SHARING_STATUS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getLessonSharingAvailability() {
  const user = getSessionUser();
  if (!isSupabaseConfigured()) return { available: false, reason: 'unconfigured' };
  if (!user?.id) return { available: false, reason: 'no_session' };
  if (user.isAnonymous) return { available: false, reason: 'auth_required' };
  return { available: true, reason: 'ready' };
}

function sanitizeSharedLesson(lesson) {
  if (!lesson || typeof lesson !== 'object') return null;
  return {
    ...lesson,
    id: lesson.id || crypto.randomUUID(),
    title: lesson.title || 'Untitled lesson',
    blocks: Array.isArray(lesson.blocks) ? lesson.blocks : [],
    settings: lesson.settings && typeof lesson.settings === 'object' ? lesson.settings : {},
  };
}

export async function createLessonShareLink(lesson) {
  const now = Date.now();
  const availability = getLessonSharingAvailability();

  if (!availability.available) {
    const status = {
      state: 'unavailable',
      reason: availability.reason,
      updatedAt: now,
    };
    safeWriteStatus(status);
    return {
      ok: false,
      ...status,
    };
  }

  const user = await ensureSession();
  if (!user?.id || user.isAnonymous) {
    const status = {
      state: 'unavailable',
      reason: 'auth_required',
      updatedAt: now,
    };
    safeWriteStatus(status);
    return {
      ok: false,
      ...status,
    };
  }

  const client = getSupabaseClient();
  const shareId = crypto.randomUUID();
  const payloadLesson = sanitizeSharedLesson(lesson);

  try {
    const row = {
      share_id: shareId,
      owner_user_id: user.id,
      lesson_id: String(lesson?.id || payloadLesson?.id || ''),
      lesson_title: String(lesson?.title || payloadLesson?.title || 'Untitled lesson'),
      lesson_payload: payloadLesson,
      is_active: true,
      updated_at: new Date(now).toISOString(),
    };

    const { data, error } = await client
      .from('lesson_shares')
      .upsert(row, { onConflict: 'owner_user_id,lesson_id' })
      .select('share_id')
      .single();

    if (error || !data?.share_id) {
      const status = {
        state: 'error',
        reason: error?.message || 'Failed to create share link',
        updatedAt: now,
      };
      safeWriteStatus(status);
      return {
        ok: false,
        ...status,
      };
    }

    const resolvedShareId = data.share_id;
    const shareUrl = `${window.location.origin}/share/${encodeURIComponent(resolvedShareId)}`;
    const status = {
      state: 'ready',
      updatedAt: now,
      shareId: resolvedShareId,
      lessonId: row.lesson_id,
    };
    safeWriteStatus(status);

    return {
      ok: true,
      shareId: resolvedShareId,
      shareUrl,
      updatedAt: now,
    };
  } catch (error) {
    const status = {
      state: 'error',
      reason: error?.message || 'Failed to create share link',
      updatedAt: now,
    };
    safeWriteStatus(status);
    return {
      ok: false,
      ...status,
    };
  }
}

export async function fetchSharedLessonById(shareId) {
  const now = Date.now();
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      reason: 'unconfigured',
      updatedAt: now,
    };
  }

  const cleanedShareId = String(shareId || '').trim();
  if (!cleanedShareId) {
    return {
      ok: false,
      reason: 'invalid_share_id',
      updatedAt: now,
    };
  }

  const client = getSupabaseClient();

  try {
    const { data, error } = await client
      .from('lesson_shares')
      .select('share_id,lesson_id,lesson_title,lesson_payload,created_at,updated_at')
      .eq('share_id', cleanedShareId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      return {
        ok: false,
        reason: error.message || 'Failed to load shared lesson',
        updatedAt: now,
      };
    }

    if (!data?.lesson_payload) {
      return {
        ok: false,
        reason: 'not_found',
        updatedAt: now,
      };
    }

    const lesson = sanitizeSharedLesson({
      ...data.lesson_payload,
      id: data.lesson_payload.id || data.lesson_id || crypto.randomUUID(),
      title: data.lesson_payload.title || data.lesson_title || 'Untitled lesson',
    });

    return {
      ok: true,
      shareId: data.share_id,
      lesson,
      meta: {
        title: data.lesson_title || lesson.title || 'Untitled lesson',
        createdAt: data.created_at || null,
        updatedAt: data.updated_at || null,
      },
      updatedAt: now,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || 'Failed to load shared lesson',
      updatedAt: now,
    };
  }
}
