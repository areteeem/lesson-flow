import { ensureSession, getSessionUser } from './accountAuth';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

const GRADING_CLOUD_STATUS_KEY = 'lesson-flow-grading-cloud-status';

function safeWriteStatus(status) {
  try {
    localStorage.setItem(GRADING_CLOUD_STATUS_KEY, JSON.stringify(status));
  } catch {
    // Ignore storage write failures.
  }
}

export function readGradingCloudStatus() {
  try {
    const raw = localStorage.getItem(GRADING_CLOUD_STATUS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getGradingCloudAvailability() {
  const user = getSessionUser();
  if (!isSupabaseConfigured()) return { available: false, reason: 'unconfigured' };
  if (!user?.id) return { available: false, reason: 'no_session' };
  return { available: true, reason: 'ready' };
}

function toGradeEntryRow(sessionId, userId, entry, entryIndex, occurredAtIso) {
  return {
    user_id: userId,
    grade_session_id: sessionId,
    entry_index: entryIndex,
    block_id: entry.id || null,
    label: entry.label || 'Untitled task',
    task_type: entry.taskType || 'unknown',
    correct: typeof entry.correct === 'boolean' ? entry.correct : null,
    score: Number(entry.score || 0),
    feedback: entry?.result?.feedback || null,
    result_payload: entry.result || null,
    occurred_at: occurredAtIso,
  };
}

function toSessionResultPayload(session) {
  return {
    lessonPreview: session.lessonPreview || '',
    mode: session.mode || 'default',
    origin: session.origin || 'local',
    interaction: session.interaction || null,
    submissionState: session.submissionState || null,
  };
}

function normalizeCloudSession(base, entries) {
  return {
    id: base.local_session_id || base.id,
    localSessionId: base.local_session_id || null,
    cloudSessionId: base.id,
    lessonId: base.lesson_id || null,
    lessonTitle: base.lesson_title || 'Untitled Lesson',
    studentName: base.student_name || 'Anonymous',
    score: Number(base.score || 0),
    earned: Number(base.earned || 0),
    total: Number(base.total || 0),
    completedCount: Number(base.completed_count || 0),
    correctCount: Number(base.correct_count || 0),
    lessonPreview: base?.result_payload?.lessonPreview || '',
    mode: base?.result_payload?.mode || 'default',
    origin: base?.result_payload?.origin || 'local',
    interaction: base?.result_payload?.interaction || null,
    submissionState: base?.result_payload?.submissionState || null,
    timestamp: base.occurred_at ? new Date(base.occurred_at).getTime() : Date.now(),
    breakdown: entries.map((entry) => ({
      id: entry.block_id || `${entry.grade_session_id}-${entry.entry_index}`,
      label: entry.label || 'Untitled task',
      taskType: entry.task_type || 'unknown',
      correct: typeof entry.correct === 'boolean' ? entry.correct : null,
      score: Number(entry.score || 0),
      result: entry.result_payload || (entry.feedback ? { feedback: entry.feedback } : null),
    })),
  };
}

function dedupeSessions(sessions) {
  const byId = new Map();
  sessions.forEach((session) => {
    const key = String(session.id || '');
    if (!key) return;
    const existing = byId.get(key);
    if (!existing || Number(session.timestamp || 0) > Number(existing.timestamp || 0)) {
      byId.set(key, session);
    }
  });
  return [...byId.values()].sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0));
}

export async function syncSessionGradeToCloud(session) {
  const now = Date.now();
  const availability = getGradingCloudAvailability();

  if (!availability.available) {
    const status = {
      state: 'unavailable',
      reason: availability.reason,
      updatedAt: now,
    };
    safeWriteStatus(status);
    return status;
  }

  const user = await ensureSession();
  if (!user?.id) {
    const status = {
      state: 'unavailable',
      reason: 'no_session',
      updatedAt: now,
    };
    safeWriteStatus(status);
    return status;
  }

  const client = getSupabaseClient();
  const occurredAtIso = new Date(session.timestamp || now).toISOString();

  const baseRow = {
    user_id: user.id,
    local_session_id: session.id || null,
    lesson_id: session.lessonId || null,
    lesson_title: session.lessonTitle || 'Untitled Lesson',
    student_name: session.studentName || 'Anonymous',
    score: Number(session.score || 0),
    earned: Number(session.earned || 0),
    total: Number(session.total || 0),
    completed_count: Number(session.completedCount || 0),
    correct_count: Number(session.correctCount || 0),
    occurred_at: occurredAtIso,
    result_payload: {
      ...toSessionResultPayload(session),
    },
    updated_at: new Date(now).toISOString(),
  };

  try {
    let data = null;
    let error = null;

    // Try upsert first (preferred for idempotent saves)
    const upsertResult = await client
      .from('grade_sessions')
      .upsert(baseRow, { onConflict: 'user_id,local_session_id' })
      .select('id')
      .single();

    data = upsertResult.data;
    error = upsertResult.error;

    // If upsert fails due to missing constraint, fall back to plain insert
    if (error && (
      (error.message || '').toLowerCase().includes('on conflict')
      || (error.message || '').toLowerCase().includes('constraint')
      || error.code === '42P10'
    )) {
      const insertResult = await client
        .from('grade_sessions')
        .insert(baseRow)
        .select('id')
        .single();
      data = insertResult.data;
      error = insertResult.error;

      // If duplicate, try to fetch existing
      if (error && (error.code === '23505' || (error.message || '').toLowerCase().includes('duplicate'))) {
        const fetchResult = await client
          .from('grade_sessions')
          .select('id')
          .eq('user_id', user.id)
          .eq('local_session_id', baseRow.local_session_id)
          .maybeSingle();
        if (fetchResult.data?.id) {
          data = fetchResult.data;
          error = null;
        }
      }
    }

    if (error || !data?.id) {
      const failed = {
        state: 'error',
        reason: error?.message || 'Failed to upsert grade session',
        updatedAt: now,
      };
      safeWriteStatus(failed);
      return failed;
    }

    const gradeSessionId = data.id;

    await client
      .from('grade_entries')
      .delete()
      .eq('user_id', user.id)
      .eq('grade_session_id', gradeSessionId);

    const rows = (Array.isArray(session.breakdown) ? session.breakdown : []).map((entry, index) => toGradeEntryRow(
      gradeSessionId,
      user.id,
      entry,
      index,
      occurredAtIso,
    ));

    if (rows.length > 0) {
      const { error: insertError } = await client.from('grade_entries').insert(rows);
      if (insertError) {
        const failed = {
          state: 'error',
          reason: insertError.message || 'Failed to upsert grade entries',
          updatedAt: now,
        };
        safeWriteStatus(failed);
        return failed;
      }
    }

    const ok = {
      state: 'synced',
      updatedAt: now,
      sessionId: session.id || null,
      cloudSessionId: gradeSessionId,
    };
    safeWriteStatus(ok);
    return ok;
  } catch (error) {
    const failed = {
      state: 'error',
      reason: error?.message || 'Cloud grading sync failed',
      updatedAt: now,
    };
    safeWriteStatus(failed);
    return failed;
  }
}

export async function updateCloudSessionGrade(session) {
  const cloudSessionId = String(session?.cloudSessionId || '').trim();
  if (!cloudSessionId) {
    return syncSessionGradeToCloud(session);
  }

  const now = Date.now();
  const availability = getGradingCloudAvailability();

  if (!availability.available) {
    const status = {
      state: 'unavailable',
      reason: availability.reason,
      updatedAt: now,
    };
    safeWriteStatus(status);
    return status;
  }

  const user = await ensureSession();
  if (!user?.id) {
    const status = {
      state: 'unavailable',
      reason: 'no_session',
      updatedAt: now,
    };
    safeWriteStatus(status);
    return status;
  }

  const client = getSupabaseClient();
  const occurredAtIso = new Date(session.timestamp || now).toISOString();

  try {
    const { data, error } = await client
      .from('grade_sessions')
      .update({
        lesson_id: session.lessonId || null,
        lesson_title: session.lessonTitle || 'Untitled Lesson',
        student_name: session.studentName || 'Anonymous',
        score: Number(session.score || 0),
        earned: Number(session.earned || 0),
        total: Number(session.total || 0),
        completed_count: Number(session.completedCount || 0),
        correct_count: Number(session.correctCount || 0),
        occurred_at: occurredAtIso,
        result_payload: {
          ...toSessionResultPayload(session),
        },
        updated_at: new Date(now).toISOString(),
      })
      .eq('id', cloudSessionId)
      .eq('user_id', user.id)
      .select('id')
      .single();

    if (error || !data?.id) {
      const failed = {
        state: 'error',
        reason: error?.message || 'Failed to update cloud grade session',
        updatedAt: now,
      };
      safeWriteStatus(failed);
      return failed;
    }

    await client
      .from('grade_entries')
      .delete()
      .eq('user_id', user.id)
      .eq('grade_session_id', cloudSessionId);

    const rows = (Array.isArray(session.breakdown) ? session.breakdown : []).map((entry, index) => toGradeEntryRow(
      cloudSessionId,
      user.id,
      entry,
      index,
      occurredAtIso,
    ));

    if (rows.length > 0) {
      const { error: insertError } = await client.from('grade_entries').insert(rows);
      if (insertError) {
        const failed = {
          state: 'error',
          reason: insertError.message || 'Failed to update cloud grade entries',
          updatedAt: now,
        };
        safeWriteStatus(failed);
        return failed;
      }
    }

    const ok = {
      state: 'synced',
      updatedAt: now,
      sessionId: session.id || null,
      cloudSessionId,
    };
    safeWriteStatus(ok);
    return ok;
  } catch (error) {
    const failed = {
      state: 'error',
      reason: error?.message || 'Cloud grading update failed',
      updatedAt: now,
    };
    safeWriteStatus(failed);
    return failed;
  }
}

export async function fetchSessionsFromCloud(options = {}) {
  const now = Date.now();
  const availability = getGradingCloudAvailability();

  if (!availability.available) {
    return {
      ok: false,
      sessions: [],
      reason: availability.reason,
      updatedAt: now,
    };
  }

  const user = await ensureSession();
  if (!user?.id) {
    return {
      ok: false,
      sessions: [],
      reason: 'no_session',
      updatedAt: now,
    };
  }

  const limit = Number(options.limit || 300);
  const client = getSupabaseClient();

  try {
    const { data: sessionRows, error: sessionError } = await client
      .from('grade_sessions')
      .select('id,local_session_id,lesson_id,lesson_title,student_name,score,earned,total,completed_count,correct_count,occurred_at,result_payload')
      .eq('user_id', user.id)
      .order('occurred_at', { ascending: false })
      .limit(limit);

    if (sessionError) {
      return {
        ok: false,
        sessions: [],
        reason: sessionError.message || 'Failed to load grade sessions',
        updatedAt: now,
      };
    }

    const ids = (sessionRows || []).map((row) => row.id).filter(Boolean);
    if (ids.length === 0) {
      return {
        ok: true,
        sessions: [],
        updatedAt: now,
      };
    }

    const { data: entryRows, error: entryError } = await client
      .from('grade_entries')
      .select('grade_session_id,entry_index,block_id,label,task_type,correct,score,feedback,result_payload')
      .eq('user_id', user.id)
      .in('grade_session_id', ids)
      .order('entry_index', { ascending: true });

    if (entryError) {
      return {
        ok: false,
        sessions: [],
        reason: entryError.message || 'Failed to load grade entries',
        updatedAt: now,
      };
    }

    const entryMap = new Map();
    (entryRows || []).forEach((row) => {
      const key = String(row.grade_session_id || '');
      if (!entryMap.has(key)) entryMap.set(key, []);
      entryMap.get(key).push(row);
    });

    const sessions = dedupeSessions((sessionRows || []).map((row) => normalizeCloudSession(row, entryMap.get(String(row.id || '')) || [])));

    return {
      ok: true,
      sessions,
      updatedAt: now,
    };
  } catch (error) {
    return {
      ok: false,
      sessions: [],
      reason: error?.message || 'Failed to fetch cloud sessions',
      updatedAt: now,
    };
  }
}
