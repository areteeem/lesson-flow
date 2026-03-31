import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';
import { ensureSession, getSessionUser } from './accountAuth';

const ASSIGNMENT_STATUS_KEY = 'lesson-flow-assignment-status';
const ASSIGNMENT_DEVICE_KEY = 'lesson-flow-assignment-device-id';

function safeWriteStatus(status) {
  try {
    localStorage.setItem(ASSIGNMENT_STATUS_KEY, JSON.stringify(status));
  } catch {
    // Ignore storage write failures.
  }
}

function getDeviceId() {
  try {
    const existing = localStorage.getItem(ASSIGNMENT_DEVICE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(ASSIGNMENT_DEVICE_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function toAssignmentAttemptKey(assignmentId, studentName) {
  return `lf-assignment-attempt-${String(assignmentId || '').trim()}-${String(studentName || '').trim().toLowerCase()}`;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeVisibilityPolicy(policy, fallback = 'student_answers_only') {
  const value = String(policy || '').trim();
  if (!value) return fallback;
  if (value === 'full_answers') return 'full_feedback';
  return value;
}

function summarizeResponseText(result) {
  const response = result?.response;
  if (response === null || response === undefined) return 'No answer submitted';
  if (typeof response === 'string') return response;
  if (typeof response === 'number' || typeof response === 'boolean') return String(response);
  if (Array.isArray(response)) return response.join(' | ');
  if (typeof response === 'object') {
    try {
      return JSON.stringify(response);
    } catch {
      return 'Structured response';
    }
  }
  return 'Unsupported response';
}

function normalizeBreakdownEntry(entry, index) {
  const safeResult = entry?.result && typeof entry.result === 'object'
    ? entry.result
    : {
      response: entry?.response ?? entry?.raw_response ?? null,
      feedback: entry?.feedback || null,
    };

  return {
    id: entry?.id || entry?.block_id || entry?.blockId || `assignment-entry-${index}`,
    blockId: entry?.block_id || entry?.blockId || null,
    label: entry?.label || entry?.question || entry?.title || `Task ${index + 1}`,
    taskType: entry?.taskType || entry?.block_type || entry?.type || 'unknown',
    correct: typeof entry?.correct === 'boolean' ? entry.correct : (typeof entry?.is_correct === 'boolean' ? entry.is_correct : null),
    score: toNumber(entry?.score, 0),
    points: Math.max(1, toNumber(entry?.points ?? entry?.max_score ?? entry?.maxScore, 1)),
    result: {
      ...safeResult,
      studentAnswerText: entry?.student_answer_text || safeResult?.studentAnswerText || summarizeResponseText(safeResult),
    },
  };
}

function normalizeAssignmentSubmission(row) {
  const payload = row?.result_payload && typeof row.result_payload === 'object' ? row.result_payload : {};
  const rawBreakdown = Array.isArray(payload.breakdown) ? payload.breakdown : [];
  const breakdown = rawBreakdown.map((entry, index) => normalizeBreakdownEntry(entry, index));
  const lessonMeta = row?.lesson_assignments || null;
  const timestamp = row?.submitted_at ? new Date(row.submitted_at).getTime() : Date.now();
  const submissionState = row?.submission_state || payload?.submissionState || (breakdown.some((entry) => entry.correct === null) ? 'awaiting_review' : 'graded');

  return {
    id: `assignment:${row?.submission_id || crypto.randomUUID()}`,
    submissionId: row?.submission_id || null,
    assignmentId: row?.assignment_id || null,
    lessonId: payload?.lessonId || lessonMeta?.lesson_id || null,
    lessonTitle: payload?.lessonTitle || lessonMeta?.lesson_title || 'Untitled Lesson',
    lessonPreview: payload?.lessonPreview || '',
    studentName: row?.student_name || payload?.studentName || 'Student',
    score: toNumber(payload?.score, toNumber(row?.score, 0)),
    earned: toNumber(payload?.earned, 0),
    total: toNumber(payload?.total, 0),
    completedCount: toNumber(payload?.completedCount, 0),
    correctCount: toNumber(payload?.correctCount, 0),
    timestamp,
    mode: payload?.mode || 'assignment',
    origin: row?.origin || payload?.origin || 'homework',
    sourceType: row?.origin || payload?.origin || 'homework',
    interaction: payload?.interaction || row?.interaction_payload || null,
    submissionState,
    breakdown,
  };
}

export function hasLocalAssignmentAttempt(assignmentId, studentName) {
  if (!assignmentId || !studentName) return false;
  try {
    return Boolean(localStorage.getItem(toAssignmentAttemptKey(assignmentId, studentName)));
  } catch {
    return false;
  }
}

export function markLocalAssignmentAttempt(assignmentId, studentName, payload = {}) {
  if (!assignmentId || !studentName) return;
  try {
    localStorage.setItem(toAssignmentAttemptKey(assignmentId, studentName), JSON.stringify({ at: Date.now(), ...payload }));
  } catch {
    // Ignore storage write failures.
  }
}

export async function createAssignmentLink(lesson, options = {}) {
  const now = Date.now();
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'unconfigured', updatedAt: now };
  }

  const user = await ensureSession();
  if (!user?.id || user.isAnonymous) {
    return { ok: false, reason: 'auth_required', updatedAt: now };
  }

  const client = getSupabaseClient();
  const assignmentId = crypto.randomUUID();
  const oneAttempt = options.oneAttempt !== false;
  const allowRetry = options.allowRetry === true ? true : false;
  const visibilityPolicy = normalizeVisibilityPolicy(options.visibilityPolicy || lesson?.settings?.visibilityPolicy || 'student_answers_only');
  const showCheckButton = options.showCheckButton === undefined
    ? Boolean(lesson?.settings?.showCheckButton)
    : options.showCheckButton === true;
  const enableGrading = options.enableGrading === undefined
    ? lesson?.settings?.enableGrading !== false
    : options.enableGrading !== false;
  const showTotalGrade = options.showTotalGrade === undefined
    ? lesson?.settings?.showTotalGrade !== false
    : options.showTotalGrade !== false;
  const showPerQuestionGrade = options.showPerQuestionGrade === undefined
    ? lesson?.settings?.showPerQuestionGrade !== false
    : options.showPerQuestionGrade !== false;
  const lessonPayload = {
    ...(lesson || {}),
    settings: {
      ...(lesson?.settings || {}),
      visibilityPolicy,
      showCheckButton,
      enableGrading,
      showTotalGrade,
      showPerQuestionGrade,
      allowRetryHomework: allowRetry,
    },
  };

  const row = {
    assignment_id: assignmentId,
    owner_user_id: user.id,
    lesson_id: String(lesson?.id || ''),
    lesson_title: String(lesson?.title || 'Untitled lesson'),
    lesson_payload: lessonPayload,
    one_attempt_only: oneAttempt,
    allow_retry: allowRetry,
    visibility_policy: visibilityPolicy,
    is_active: true,
    updated_at: new Date(now).toISOString(),
  };

  try {
    const { data, error } = await client
      .from('lesson_assignments')
      .upsert(row, { onConflict: 'owner_user_id,lesson_id' })
      .select('assignment_id')
      .single();

    if (error || !data?.assignment_id) {
      return { ok: false, reason: error?.message || 'Failed to create assignment link', updatedAt: now };
    }

    const resolved = data.assignment_id;
    const assignmentUrl = `${window.location.origin}/assignment/${encodeURIComponent(resolved)}`;
    const status = {
      state: 'ready',
      updatedAt: now,
      assignmentId: resolved,
      lessonId: row.lesson_id,
    };
    safeWriteStatus(status);

    return {
      ok: true,
      assignmentId: resolved,
      assignmentUrl,
      updatedAt: now,
    };
  } catch (error) {
    const status = {
      state: 'error',
      reason: error?.message || 'Failed to create assignment link',
      updatedAt: now,
    };
    safeWriteStatus(status);
    return { ok: false, ...status };
  }
}

export async function fetchAssignmentById(assignmentId) {
  const now = Date.now();
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'unconfigured', updatedAt: now };
  }

  const cleanId = String(assignmentId || '').trim();
  if (!cleanId) {
    return { ok: false, reason: 'invalid_assignment_id', updatedAt: now };
  }

  const client = getSupabaseClient();

  try {
    const { data, error } = await client
      .from('lesson_assignments')
      .select('assignment_id,lesson_id,lesson_title,lesson_payload,one_attempt_only,allow_retry,visibility_policy,is_active,expires_at')
      .eq('assignment_id', cleanId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) return { ok: false, reason: error.message || 'Failed to load assignment', updatedAt: now };
    if (!data?.lesson_payload) return { ok: false, reason: 'not_found', updatedAt: now };

    if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
      return { ok: false, reason: 'expired', updatedAt: now };
    }

    const lesson = {
      ...data.lesson_payload,
      id: data.lesson_payload.id || data.lesson_id || crypto.randomUUID(),
      title: data.lesson_payload.title || data.lesson_title || 'Untitled lesson',
      settings: {
        ...(data.lesson_payload.settings || {}),
        visibilityPolicy: normalizeVisibilityPolicy(data.visibility_policy || data.lesson_payload?.settings?.visibilityPolicy || 'student_answers_only'),
        showCheckButton: Boolean(data.lesson_payload?.settings?.showCheckButton),
        enableGrading: data.lesson_payload?.settings?.enableGrading !== false,
        showTotalGrade: data.lesson_payload?.settings?.showTotalGrade !== false,
        showPerQuestionGrade: data.lesson_payload?.settings?.showPerQuestionGrade !== false,
        allowRetryHomework: Boolean(data.allow_retry),
        showExplanations: false,
      },
    };

    return {
      ok: true,
      assignment: {
        assignmentId: data.assignment_id,
        lesson,
        oneAttemptOnly: data.one_attempt_only !== false,
        allowRetry: Boolean(data.allow_retry),
        visibilityPolicy: normalizeVisibilityPolicy(data.visibility_policy || lesson.settings.visibilityPolicy),
        showCheckButton: Boolean(lesson.settings.showCheckButton),
        enableGrading: lesson.settings.enableGrading !== false,
        showTotalGrade: lesson.settings.showTotalGrade !== false,
        showPerQuestionGrade: lesson.settings.showPerQuestionGrade !== false,
      },
      updatedAt: now,
    };
  } catch (error) {
    return { ok: false, reason: error?.message || 'Failed to load assignment', updatedAt: now };
  }
}

export async function submitAssignmentResult({ assignmentId, studentName, sessionPayload }) {
  const now = Date.now();
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'unconfigured', updatedAt: now };
  }

  const cleanAssignmentId = String(assignmentId || '').trim();
  const cleanStudentName = String(studentName || '').trim() || 'Student';
  if (!cleanAssignmentId) return { ok: false, reason: 'invalid_assignment_id', updatedAt: now };

  const client = getSupabaseClient();
  const sessionUser = getSessionUser();
  const actorUserId = sessionUser?.id || null;
  const fingerprint = `${getDeviceId()}::${cleanStudentName.toLowerCase()}`;

  try {
    const row = {
      assignment_id: cleanAssignmentId,
      actor_user_id: actorUserId,
      student_name: cleanStudentName,
      attempt_fingerprint: fingerprint,
      result_payload: sessionPayload,
      origin: String(sessionPayload?.origin || 'homework'),
      submission_state: String(sessionPayload?.submissionState || 'awaiting_review'),
      interaction_payload: sessionPayload?.interaction || {},
      score: Number(sessionPayload?.score || 0),
      submitted_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };

    const { data, error } = await client
      .from('assignment_submissions')
      .insert(row)
      .select('submission_id')
      .single();

    if (error || !data?.submission_id) {
      if ((error?.message || '').toLowerCase().includes('duplicate') || error?.code === '23505') {
        return { ok: false, reason: 'attempt_exists', updatedAt: now };
      }
      return { ok: false, reason: error?.message || 'Failed to submit assignment', updatedAt: now };
    }

    markLocalAssignmentAttempt(cleanAssignmentId, cleanStudentName, { submissionId: data.submission_id });
    return {
      ok: true,
      submissionId: data.submission_id,
      updatedAt: now,
    };
  } catch (error) {
    return { ok: false, reason: error?.message || 'Failed to submit assignment', updatedAt: now };
  }
}

export async function fetchAssignmentSubmissionsForOwner(options = {}) {
  const now = Date.now();
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'unconfigured', sessions: [], updatedAt: now };
  }

  const user = await ensureSession();
  if (!user?.id || user.isAnonymous) {
    return { ok: false, reason: 'auth_required', sessions: [], updatedAt: now };
  }

  const client = getSupabaseClient();
  const limit = Math.max(1, Math.min(500, Number(options.limit || 300)));

  try {
    const { data, error } = await client
      .from('assignment_submissions')
      .select('submission_id,assignment_id,student_name,result_payload,interaction_payload,origin,submission_state,score,submitted_at,updated_at,lesson_assignments:lesson_assignments(lesson_title,lesson_id)')
      .order('submitted_at', { ascending: false })
      .limit(limit);

    if (error) {
      return { ok: false, reason: error.message || 'Failed to load assignment submissions', sessions: [], updatedAt: now };
    }

    const sessions = (data || []).map((row) => normalizeAssignmentSubmission(row));
    return { ok: true, sessions, updatedAt: now };
  } catch (error) {
    return { ok: false, reason: error?.message || 'Failed to load assignment submissions', sessions: [], updatedAt: now };
  }
}

export async function updateAssignmentSubmissionGrade(submissionId, reviewedSession) {
  const now = Date.now();
  if (!isSupabaseConfigured()) {
    return { ok: false, reason: 'unconfigured', updatedAt: now };
  }

  const user = await ensureSession();
  if (!user?.id || user.isAnonymous) {
    return { ok: false, reason: 'auth_required', updatedAt: now };
  }

  const cleanSubmissionId = String(submissionId || '').trim();
  if (!cleanSubmissionId) {
    return { ok: false, reason: 'invalid_submission_id', updatedAt: now };
  }

  const breakdown = Array.isArray(reviewedSession?.breakdown) ? reviewedSession.breakdown : [];
  const submissionState = breakdown.some((entry) => entry?.correct === null) ? 'awaiting_review' : 'graded';
  const payload = {
    ...(reviewedSession || {}),
    submissionState,
  };

  const client = getSupabaseClient();
  try {
    const { data, error } = await client
      .from('assignment_submissions')
      .update({
        result_payload: payload,
        score: toNumber(reviewedSession?.score, 0),
        submission_state: submissionState,
        updated_at: new Date(now).toISOString(),
      })
      .eq('submission_id', cleanSubmissionId)
      .select('submission_id')
      .single();

    if (error || !data?.submission_id) {
      return { ok: false, reason: error?.message || 'Failed to update assignment submission', updatedAt: now };
    }

    return { ok: true, submissionId: data.submission_id, submissionState, updatedAt: now };
  } catch (error) {
    return { ok: false, reason: error?.message || 'Failed to update assignment submission', updatedAt: now };
  }
}
