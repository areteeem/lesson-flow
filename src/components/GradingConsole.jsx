import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSessionsFromCloud, getGradingCloudAvailability, updateCloudSessionGrade } from '../utils/gradingCloud';
import { fetchAssignmentSubmissionsForOwner, updateAssignmentSubmissionGrade } from '../utils/lessonAssignments';
import { createResultShareLink } from '../utils/resultSharing';
import { saveSession } from '../storage';
import { BackIcon, CheckIcon, ChevronDownIcon, CopyIcon, EditIcon, ExportIcon, RefreshIcon } from './Icons';

function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, toNumber(value, 0)));
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(toNumber(value, 0))));
}

function formatElapsedMinutes(totalMinutes) {
  const safeMinutes = Math.max(0, Math.floor(toNumber(totalMinutes, 0)));
  if (safeMinutes < 60) return `${safeMinutes}m`;
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  if (hours < 24) return `${hours}h ${minutes}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

function ageMinutesFromTimestamp(timestamp) {
  return Math.max(0, Math.round((Date.now() - toNumber(timestamp, Date.now())) / 60000));
}

function safePercent(value, total) {
  const denominator = Number(total);
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  return Math.round((toNumber(value, 0) / denominator) * 100);
}

function mean(values = []) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sum = values.reduce((acc, value) => acc + toNumber(value, 0), 0);
  return sum / values.length;
}

function formatDayKey(timestamp) {
  const date = new Date(toNumber(timestamp, Date.now()));
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toISOString().slice(0, 10);
}

function toPearsonCorrelation(pairs = []) {
  const valid = pairs.filter((entry) => Number.isFinite(entry?.x) && Number.isFinite(entry?.y));
  if (valid.length < 2) return null;

  const avgX = mean(valid.map((entry) => entry.x));
  const avgY = mean(valid.map((entry) => entry.y));
  let numerator = 0;
  let leftDenominator = 0;
  let rightDenominator = 0;

  valid.forEach((entry) => {
    const dx = entry.x - avgX;
    const dy = entry.y - avgY;
    numerator += dx * dy;
    leftDenominator += dx * dx;
    rightDenominator += dy * dy;
  });

  const denominator = Math.sqrt(leftDenominator * rightDenominator);
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  const coefficient = numerator / denominator;
  if (!Number.isFinite(coefficient)) return null;
  return Math.max(-1, Math.min(1, coefficient));
}

const RUBRIC_TEMPLATE_LIBRARY = {
  writing: [
    'Content accuracy: Key ideas are present and relevant to the prompt.',
    'Language quality: Grammar and sentence control support readability.',
    'Evidence/detail: Add one concrete example to strengthen the response.',
  ],
  objective: [
    'Accuracy: The selected answer matches the expected response.',
    'Precision: Re-check key words in the prompt before final selection.',
    'Consistency: Use elimination for distractors before submitting.',
  ],
  matching: [
    'Association quality: Most links are correct and logically paired.',
    'Recall strategy: Revisit anchor terms, then map remaining pairs.',
    'Verification: Double-check each pair against category/definition cues.',
  ],
  general: [
    'Task completion: Response addresses the core instruction.',
    'Clarity: Keep wording concise and focused on the asked concept.',
    'Next step: Review one misconception and retry with corrections.',
  ],
};

const RUBRIC_BUCKET_BY_TASK = {
  long_answer: 'writing',
  open: 'writing',
  short_answer: 'writing',
  error_correction: 'writing',
  choose_and_explain: 'writing',
  scenario_decision: 'writing',
  multiple_choice: 'objective',
  multi_select: 'objective',
  true_false: 'objective',
  yes_no: 'objective',
  either_or: 'objective',
  match: 'matching',
  drag_drop: 'matching',
  drag_match: 'matching',
  categorize: 'matching',
  matching_pairs_categories: 'matching',
  reading_highlight: 'matching',
  highlight_glossary: 'matching',
};

function getRubricTemplatesForTask(taskType) {
  const normalized = String(taskType || '').trim().toLowerCase();
  const bucket = RUBRIC_BUCKET_BY_TASK[normalized] || 'general';
  return RUBRIC_TEMPLATE_LIBRARY[bucket] || RUBRIC_TEMPLATE_LIBRARY.general;
}

function buildAssistedFeedbackDraft(entry, draft) {
  const verdict = draft?.verdict || verdictFromEntry(entry);
  const scorePercent = clampPercent(draft?.scorePercent ?? (entry?.score || 0) * 100);
  const expectedAnswer = formatCorrectAnswer(entry?.result);
  const answerText = formatAnswer(entry?.result);
  const answerLength = String(answerText || '').trim().length;

  const outcomeLine = verdict === 'correct'
    ? 'You demonstrated strong understanding on this item.'
    : verdict === 'partial'
      ? 'You captured part of the expected answer and are close.'
      : verdict === 'incorrect'
        ? 'Your current answer is not yet aligned with the expected result.'
        : 'This response needs manual review before final grading.';

  const scoreLine = `Current score: ${scorePercent}%.`;
  const expectedLine = expectedAnswer
    ? `Expected focus: ${expectedAnswer}.`
    : null;
  const detailLine = answerLength > 80
    ? 'Strength: your response includes useful detail.'
    : 'Suggestion: add one concrete supporting detail.';
  const nextStepLine = verdict === 'correct'
    ? 'Next step: keep this accuracy and clarity in the next question.'
    : 'Next step: revisit the prompt keywords and correct the key mismatch.';

  return [outcomeLine, scoreLine, expectedLine, detailLine, nextStepLine]
    .filter(Boolean)
    .join('\n');
}

function summarizeRegradeDiff(previousSession, reviewedSession) {
  const previousEntries = new Map((previousSession?.breakdown || []).map((entry) => [entry.id, entry]));
  const changes = [];

  (reviewedSession?.breakdown || []).forEach((entry) => {
    const previous = previousEntries.get(entry.id);
    if (!previous) return;

    const beforeVerdict = verdictFromEntry(previous);
    const afterVerdict = verdictFromEntry(entry);
    const beforeScore = clampPercent((previous?.score || 0) * 100);
    const afterScore = clampPercent((entry?.score || 0) * 100);
    const beforeFeedback = String(previous?.result?.feedback || '').trim();
    const afterFeedback = String(entry?.result?.feedback || '').trim();

    if (beforeVerdict === afterVerdict && beforeScore === afterScore && beforeFeedback === afterFeedback) return;

    changes.push({
      entryId: entry.id,
      label: entry.label,
      taskType: entry.taskType,
      before: {
        verdict: beforeVerdict,
        scorePercent: beforeScore,
        feedback: beforeFeedback || null,
      },
      after: {
        verdict: afterVerdict,
        scorePercent: afterScore,
        feedback: afterFeedback || null,
      },
    });
  });

  return changes;
}

function extractAntiCheatTimeline(session) {
  const events = Array.isArray(session?.interaction?.events) ? session.interaction.events : [];
  return events
    .filter((entry) => {
      const type = String(entry?.type || '').toLowerCase();
      return type.includes('tab')
        || type.includes('blur')
        || type.includes('focus')
        || type.includes('anti_cheat')
        || type.includes('copy')
        || type.includes('paste')
        || type.includes('cut')
        || type.includes('contextmenu');
    })
    .map((entry, index) => ({
      id: entry?.id || `${entry?.type || 'event'}-${entry?.at || index}`,
      type: String(entry?.type || 'event'),
      at: toNumber(entry?.at, session?.timestamp || Date.now()),
      blockId: entry?.blockId || null,
      details: entry,
    }))
    .sort((left, right) => right.at - left.at);
}

function normalizeBreakdownEntry(entry, index = 0) {
  const result = entry?.result && typeof entry.result === 'object'
    ? entry.result
    : {
      response: entry?.response ?? null,
      feedback: entry?.feedback || null,
    };

  return {
    id: String(entry?.id || entry?.blockId || entry?.block_id || `entry-${index}`),
    label: String(entry?.label || `Question ${index + 1}`),
    taskType: String(entry?.taskType || entry?.task_type || 'unknown'),
    correct: typeof entry?.correct === 'boolean' ? entry.correct : null,
    score: clamp01(entry?.score),
    points: Math.max(1, toNumber(entry?.points ?? entry?.max_score ?? 1, 1)),
    result,
  };
}

function normalizeSession(session) {
  const breakdown = Array.isArray(session?.breakdown)
    ? session.breakdown.map((entry, index) => normalizeBreakdownEntry(entry, index))
    : [];

  const total = breakdown.reduce((sum, entry) => sum + entry.points, 0);
  const earned = breakdown.reduce((sum, entry) => sum + (entry.score * entry.points), 0);
  const score = total > 0 ? Math.round((earned / total) * 100) : Math.round(toNumber(session?.score, 0));
  const dueAt = session?.dueAt || session?.expiresAt || session?.interaction?.assignmentExpiresAt || null;
  const dueAtTimestamp = dueAt ? new Date(dueAt).getTime() : NaN;
  const sessionTimestamp = toNumber(session?.timestamp, Date.now());
  const isLateSubmission = session?.isLateSubmission === true || (Number.isFinite(dueAtTimestamp) ? sessionTimestamp > dueAtTimestamp : false);

  return {
    id: String(session?.id || session?.cloudSessionId || `session-${crypto.randomUUID()}`),
    localSessionId: session?.localSessionId ? String(session.localSessionId) : null,
    cloudSessionId: session?.cloudSessionId ? String(session.cloudSessionId) : null,
    assignmentId: session?.assignmentId ? String(session.assignmentId) : null,
    submissionId: session?.submissionId ? String(session.submissionId) : null,
    lessonId: session?.lessonId ? String(session.lessonId) : null,
    lessonTitle: String(session?.lessonTitle || 'Untitled Lesson'),
    lessonPreview: String(session?.lessonPreview || ''),
    studentName: String(session?.studentName || 'Anonymous').trim() || 'Anonymous',
    timestamp: toNumber(session?.timestamp, Date.now()),
    origin: String(session?.origin || session?.sourceType || 'local'),
    mode: String(session?.mode || 'default'),
    sourceType: String(session?.sourceType || session?.origin || 'local'),
    interaction: session?.interaction || null,
    submissionState: session?.submissionState || null,
    dueAt,
    isLateSubmission,
    completedCount: toNumber(session?.completedCount, 0),
    correctCount: toNumber(session?.correctCount, 0),
    score,
    total,
    earned,
    breakdown,
  };
}

function verdictFromEntry(entry) {
  if (entry.correct === true || entry.score >= 0.999) return 'correct';
  if (entry.correct === false && entry.score <= 0.001) return 'incorrect';
  if (entry.correct === null) return 'pending';
  return 'partial';
}

function toVerdictDraft(session) {
  const next = {};
  (session?.breakdown || []).forEach((entry) => {
    next[entry.id] = {
      verdict: verdictFromEntry(entry),
      scorePercent: clampPercent(entry.score * 100),
      feedback: typeof entry?.result?.feedback === 'string' ? entry.result.feedback : '',
    };
  });
  return next;
}

function toCorrectFromVerdict(verdict, fallback = null) {
  if (verdict === 'correct') return true;
  if (verdict === 'incorrect' || verdict === 'partial') return false;
  if (verdict === 'pending') return null;
  return typeof fallback === 'boolean' ? fallback : null;
}

function scoreFromVerdict(verdict, currentScorePercent) {
  if (verdict === 'correct') return 100;
  if (verdict === 'incorrect') return 0;
  if (verdict === 'partial') {
    if (currentScorePercent > 0 && currentScorePercent < 100) return currentScorePercent;
    return 50;
  }
  return currentScorePercent;
}

const NEXT_VERDICT = {
  pending: 'incorrect',
  incorrect: 'partial',
  partial: 'correct',
  correct: 'pending',
};

const QUICK_FEEDBACK_CHIPS = [
  'Strong answer. Keep this clarity.',
  'Good attempt. Add one more supporting detail.',
  'Check grammar and sentence structure.',
  'Re-read the prompt and match key words.',
  'Nice progress from your previous attempt.',
];

function cycleVerdict(verdict) {
  return NEXT_VERDICT[verdict] || 'pending';
}

function appendFeedbackChip(currentValue, chip) {
  const normalizedCurrent = String(currentValue || '').trim();
  if (!normalizedCurrent) return chip;
  const lowered = normalizedCurrent.toLowerCase();
  if (lowered.includes(chip.toLowerCase())) return normalizedCurrent;
  return `${normalizedCurrent}\n${chip}`;
}

function buildReviewedSession(session, draftMap) {
  const breakdown = session.breakdown.map((entry) => {
    const draft = draftMap?.[entry.id];
    if (!draft) return entry;
    const normalizedScore = clamp01(clampPercent(draft.scorePercent) / 100);
    const trimmedFeedback = typeof draft.feedback === 'string' ? draft.feedback.trim() : '';
    return {
      ...entry,
      score: normalizedScore,
      correct: toCorrectFromVerdict(draft.verdict, entry.correct),
      result: {
        ...(entry.result || {}),
        feedback: trimmedFeedback || null,
      },
    };
  });

  const total = breakdown.reduce((sum, entry) => sum + Math.max(1, toNumber(entry.points, 1)), 0);
  const earned = breakdown.reduce((sum, entry) => sum + (clamp01(entry.score) * Math.max(1, toNumber(entry.points, 1))), 0);
  const score = total > 0 ? Math.round((earned / total) * 100) : 0;

  return {
    ...session,
    breakdown,
    total,
    earned,
    score,
    timestamp: Date.now(),
    completedCount: breakdown.filter((entry) => entry.result).length,
    correctCount: breakdown.filter((entry) => entry.correct === true).length,
    submissionState: breakdown.some((entry) => entry.correct === null) ? 'awaiting_review' : 'graded',
  };
}

function formatAnswer(result) {
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

function formatCorrectAnswer(result) {
  const response = result?.correctAnswer ?? result?.correct_answer ?? result?.expected ?? null;
  if (response === null || response === undefined || response === '') return '';
  if (typeof response === 'string') return response;
  if (typeof response === 'number' || typeof response === 'boolean') return String(response);
  if (Array.isArray(response)) return response.join(' | ');
  if (typeof response === 'object') {
    try {
      return JSON.stringify(response);
    } catch {
      return 'Structured expected answer';
    }
  }
  return '';
}

function getLessonKey(session) {
  if (session.lessonId) return `id:${session.lessonId}`;
  return `title:${session.lessonTitle}`;
}

function keyFromInitialLesson(initialLessonId, initialLessonTitle) {
  if (initialLessonId) return `id:${String(initialLessonId)}`;
  if (initialLessonTitle) return `title:${String(initialLessonTitle)}`;
  return null;
}

function buildBoardFromSessions(sessions) {
  const columnMap = new Map();
  sessions.forEach((session) => {
    session.breakdown.forEach((entry) => {
      const key = `${entry.taskType}::${entry.label}`;
      if (!columnMap.has(key)) {
        columnMap.set(key, {
          id: key,
          label: entry.label,
          taskType: entry.taskType,
        });
      }
    });
  });

  const columns = [...columnMap.values()].map((entry, index) => ({
    ...entry,
    shortLabel: `T${index + 1}`,
  }));
  const rows = sessions
    .slice()
    .sort((left, right) => right.score - left.score || right.timestamp - left.timestamp)
    .map((session, index) => {
      const cellMap = new Map();
      session.breakdown.forEach((entry) => {
        const key = `${entry.taskType}::${entry.label}`;
        cellMap.set(key, {
          score: Math.round(entry.score * 100),
          correct: entry.correct,
        });
      });
      return {
        rank: index + 1,
        sessionId: session.id,
        studentName: session.studentName,
        score: session.score,
        origin: session.origin,
        timestamp: session.timestamp,
        isLateSubmission: session.isLateSubmission === true,
        cellMap,
      };
    });

  return { columns, rows };
}

function StudentAnswerCard({ entry, draft = null }) {
  const verdict = draft?.verdict || verdictFromEntry(entry);
  const tone = verdict === 'correct'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : verdict === 'incorrect'
      ? 'border-red-200 bg-red-50 text-red-900'
      : verdict === 'partial'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-zinc-200 bg-zinc-50 text-zinc-700';

  const studentAnswer = formatAnswer(entry.result);
  const correctAnswer = formatCorrectAnswer(entry.result);
  const feedback = typeof draft?.feedback === 'string'
    ? draft.feedback
    : (entry?.result?.feedback || '');

  return (
    <div className={`border px-3 py-2 text-xs ${tone}`}>
      <div className="font-medium">{entry.label}</div>
      <div className="mt-1 text-[11px] opacity-80">{entry.taskType}</div>
      <div className="mt-2">
        <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Student answer</div>
        <div className="mt-1 whitespace-pre-wrap">{studentAnswer}</div>
      </div>
      {correctAnswer && (
        <div className="mt-2 border border-current/20 bg-white/60 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Expected answer</div>
          <div className="mt-1 whitespace-pre-wrap">{correctAnswer}</div>
        </div>
      )}
      {feedback.trim() && (
        <div className="mt-2 border border-current/20 bg-white/60 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.14em] opacity-70">Teacher feedback</div>
          <div className="mt-1 whitespace-pre-wrap">{feedback}</div>
        </div>
      )}
    </div>
  );
}

function IconActionButton({ onClick, title, children, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="inline-flex h-9 w-9 items-center justify-center border border-zinc-200 text-zinc-700 transition hover:border-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export default function GradingConsole({
  sessions = [],
  onBack,
  onSessionsChanged = null,
  initialLessonId = null,
  initialLessonTitle = null,
  requireLessonSelection = true,
}) {
  const [view, setView] = useState('students');
  const [selectedLessonKey, setSelectedLessonKey] = useState(() => keyFromInitialLesson(initialLessonId, initialLessonTitle));
  const [selectedStudent, setSelectedStudent] = useState('all');
  const [selectedQuestion, setSelectedQuestion] = useState('all');
  const [anonymizedMode, setAnonymizedMode] = useState(false);
  const [slaTargetMinutes, setSlaTargetMinutes] = useState(120);
  const [expandedStudent, setExpandedStudent] = useState('');
  const [compareLeftId, setCompareLeftId] = useState('');
  const [compareRightId, setCompareRightId] = useState('');
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudMessage, setCloudMessage] = useState('');
  const [cloudSessions, setCloudSessions] = useState([]);
  const [assignmentSessions, setAssignmentSessions] = useState([]);
  const [sessionOverrides, setSessionOverrides] = useState({});
  const [verdictDrafts, setVerdictDrafts] = useState({});
  const [verdictMessages, setVerdictMessages] = useState({});
  const [verdictSavingId, setVerdictSavingId] = useState('');
  const [sessionShareLinks, setSessionShareLinks] = useState({});
  const [sessionShareLoadingId, setSessionShareLoadingId] = useState('');
  const [sessionAdjustmentReasons, setSessionAdjustmentReasons] = useState({});
  const [boardShareState, setBoardShareState] = useState('idle');
  const [boardShareLink, setBoardShareLink] = useState('');
  const [analyticsExportMessage, setAnalyticsExportMessage] = useState('');

  const refreshCloudSessions = useCallback(async () => {
    const availability = getGradingCloudAvailability();
    if (!availability.available) {
      setCloudMessage(`Cloud unavailable: ${availability.reason}`);
      setCloudSessions([]);
      setAssignmentSessions([]);
      return;
    }

    setCloudLoading(true);
    setCloudMessage('Refreshing cloud sessions...');

    const [gradeResult, assignmentResult] = await Promise.all([
      fetchSessionsFromCloud(),
      fetchAssignmentSubmissionsForOwner(),
    ]);

    setCloudLoading(false);

    if (gradeResult.ok) setCloudSessions(gradeResult.sessions || []);
    else setCloudSessions([]);

    if (assignmentResult.ok) setAssignmentSessions(assignmentResult.sessions || []);
    else setAssignmentSessions([]);

    if (!gradeResult.ok && !assignmentResult.ok) {
      setCloudMessage(`Cloud refresh failed: ${gradeResult.reason || assignmentResult.reason || 'unknown error'}`);
      return;
    }

    const gradeCount = gradeResult.ok ? (gradeResult.sessions || []).length : 0;
    const assignmentCount = assignmentResult.ok ? (assignmentResult.sessions || []).length : 0;
    setCloudMessage(`Loaded ${gradeCount} cloud sessions and ${assignmentCount} homework submissions.`);
  }, []);

  useEffect(() => {
    void refreshCloudSessions();
  }, [refreshCloudSessions]);

  const mergedSessions = useMemo(() => {
    const byId = new Map();
    [...sessions, ...cloudSessions, ...assignmentSessions]
      .map(normalizeSession)
      .forEach((entry) => {
        const existing = byId.get(entry.id);
        if (!existing || entry.timestamp > existing.timestamp) {
          byId.set(entry.id, entry);
        }
      });

    return [...byId.values()]
      .map((entry) => sessionOverrides[entry.id] || entry)
      .sort((left, right) => right.timestamp - left.timestamp);
  }, [sessions, cloudSessions, assignmentSessions, sessionOverrides]);

  const localSessionIds = useMemo(() => {
    return new Set(
      sessions
        .map((entry) => String(entry?.id || '').trim())
        .filter(Boolean),
    );
  }, [sessions]);

  const lessons = useMemo(() => {
    const byLesson = new Map();
    mergedSessions.forEach((session) => {
      const key = getLessonKey(session);
      const current = byLesson.get(key) || {
        key,
        lessonId: session.lessonId,
        lessonTitle: session.lessonTitle,
        count: 0,
        avgScoreSum: 0,
      };
      current.count += 1;
      current.avgScoreSum += session.score;
      byLesson.set(key, current);
    });

    return [...byLesson.values()]
      .map((entry) => ({
        ...entry,
        avgScore: entry.count > 0 ? Math.round(entry.avgScoreSum / entry.count) : 0,
      }))
      .sort((left, right) => right.count - left.count || left.lessonTitle.localeCompare(right.lessonTitle));
  }, [mergedSessions]);

  useEffect(() => {
    if (selectedLessonKey) return;
    if (lessons.length === 0) return;
    if (requireLessonSelection) return;
    setSelectedLessonKey(lessons[0].key);
  }, [lessons, requireLessonSelection, selectedLessonKey]);

  const activeLesson = useMemo(() => lessons.find((entry) => entry.key === selectedLessonKey) || null, [lessons, selectedLessonKey]);

  const lessonSessions = useMemo(() => {
    if (!selectedLessonKey) return [];
    return mergedSessions.filter((session) => getLessonKey(session) === selectedLessonKey);
  }, [mergedSessions, selectedLessonKey]);

  const studentOptions = useMemo(() => {
    const set = new Set(lessonSessions.map((session) => session.studentName));
    return ['all', ...[...set].sort((left, right) => left.localeCompare(right))];
  }, [lessonSessions]);

  const questionOptions = useMemo(() => {
    const map = new Map();
    lessonSessions.forEach((session) => {
      session.breakdown.forEach((entry) => {
        const key = `${entry.taskType}::${entry.label}`;
        if (!map.has(key)) map.set(key, { key, label: entry.label, taskType: entry.taskType });
      });
    });
    return ['all', ...[...map.values()].sort((left, right) => left.label.localeCompare(right.label)).map((entry) => entry.key)];
  }, [lessonSessions]);

  useEffect(() => {
    setSelectedStudent('all');
    setSelectedQuestion('all');
    setExpandedStudent('');
    setCompareLeftId('');
    setCompareRightId('');
    setVerdictDrafts({});
    setVerdictMessages({});
    setSessionShareLinks({});
    setSessionShareLoadingId('');
    setSessionAdjustmentReasons({});
    setView('students');
    setBoardShareState('idle');
    setBoardShareLink('');
    setAnalyticsExportMessage('');
  }, [selectedLessonKey]);

  const filteredSessions = useMemo(() => {
    return lessonSessions.filter((session) => selectedStudent === 'all' || session.studentName === selectedStudent);
  }, [lessonSessions, selectedStudent]);

  const anonymizedNameMap = useMemo(() => {
    const next = new Map();
    const names = [];
    filteredSessions.forEach((session) => {
      const value = String(session.studentName || '').trim();
      if (!value || names.includes(value)) return;
      names.push(value);
    });
    names.forEach((name, index) => {
      next.set(name, `Student ${String(index + 1).padStart(2, '0')}`);
    });
    return next;
  }, [filteredSessions]);

  const displayStudentName = useCallback((studentName) => {
    if (!anonymizedMode) return studentName;
    return anonymizedNameMap.get(studentName) || 'Student';
  }, [anonymizedMode, anonymizedNameMap]);

  const studentRows = useMemo(() => {
    const byStudent = new Map();
    filteredSessions.forEach((session) => {
      const current = byStudent.get(session.studentName);
      if (!current || session.timestamp > current.timestamp) {
        byStudent.set(session.studentName, session);
      }
    });

    return [...byStudent.values()].sort((left, right) => right.score - left.score || right.timestamp - left.timestamp);
  }, [filteredSessions]);

  const questionRows = useMemo(() => {
    const [selectedTaskType, selectedLabel] = selectedQuestion === 'all' ? ['', ''] : selectedQuestion.split('::');

    return filteredSessions.flatMap((session) => {
      return session.breakdown
        .filter((entry) => selectedQuestion === 'all' || (entry.taskType === selectedTaskType && entry.label === selectedLabel))
        .map((entry, index) => ({
          compareId: `${session.id}:${entry.id}:${index}`,
          sessionId: session.id,
          studentName: session.studentName,
          timestamp: session.timestamp,
          questionKey: `${entry.taskType}::${entry.label}`,
          questionLabel: entry.label,
          taskType: entry.taskType,
          correct: entry.correct,
          score: Math.round(entry.score * 100),
          answer: formatAnswer(entry.result),
          expectedAnswer: formatCorrectAnswer(entry.result),
          isLateSubmission: session.isLateSubmission === true,
          dueAt: session.dueAt || null,
        }));
    }).sort((left, right) => right.timestamp - left.timestamp);
  }, [filteredSessions, selectedQuestion]);

  const moderationQueueRows = useMemo(() => {
    const [selectedTaskType, selectedLabel] = selectedQuestion === 'all' ? ['', ''] : selectedQuestion.split('::');

    return filteredSessions.flatMap((session) => {
      return session.breakdown
        .filter((entry) => {
          const questionMatches = selectedQuestion === 'all' || (entry.taskType === selectedTaskType && entry.label === selectedLabel);
          if (!questionMatches) return false;
          return entry.correct === null;
        })
        .map((entry) => ({
          sessionId: session.id,
          studentName: session.studentName,
          timestamp: session.timestamp,
          questionKey: `${entry.taskType}::${entry.label}`,
          questionLabel: entry.label,
          taskType: entry.taskType,
          entryId: entry.id,
          score: Math.round(entry.score * 100),
          answer: formatAnswer(entry.result),
          expectedAnswer: formatCorrectAnswer(entry.result),
          feedback: typeof entry?.result?.feedback === 'string' ? entry.result.feedback : '',
          isLateSubmission: session.isLateSubmission === true,
          dueAt: session.dueAt || null,
        }));
    }).sort((left, right) => right.timestamp - left.timestamp);
  }, [filteredSessions, selectedQuestion]);

  const questionCompareOptions = useMemo(() => {
    return questionRows.map((row) => ({
      ...row,
      label: `${displayStudentName(row.studentName)} · ${new Date(row.timestamp).toLocaleTimeString()}`,
    }));
  }, [displayStudentName, questionRows]);

  useEffect(() => {
    if (questionCompareOptions.length === 0) {
      setCompareLeftId('');
      setCompareRightId('');
      return;
    }

    if (!questionCompareOptions.some((row) => row.compareId === compareLeftId)) {
      setCompareLeftId(questionCompareOptions[0].compareId);
    }
    if (!questionCompareOptions.some((row) => row.compareId === compareRightId)) {
      setCompareRightId(questionCompareOptions[1]?.compareId || questionCompareOptions[0].compareId);
    }
  }, [compareLeftId, compareRightId, questionCompareOptions]);

  const compareLeftRow = useMemo(() => {
    return questionCompareOptions.find((row) => row.compareId === compareLeftId) || null;
  }, [compareLeftId, questionCompareOptions]);

  const compareRightRow = useMemo(() => {
    return questionCompareOptions.find((row) => row.compareId === compareRightId) || null;
  }, [compareRightId, questionCompareOptions]);

  const moderationSlaSummary = useMemo(() => {
    const threshold = Math.max(1, toNumber(slaTargetMinutes, 120));
    let overdueCount = 0;
    let dueSoonCount = 0;

    moderationQueueRows.forEach((row) => {
      const ageMinutes = ageMinutesFromTimestamp(row.timestamp);
      if (ageMinutes > threshold) overdueCount += 1;
      else if (ageMinutes >= Math.round(threshold * 0.75)) dueSoonCount += 1;
    });

    return {
      threshold,
      overdueCount,
      dueSoonCount,
      pendingCount: moderationQueueRows.length,
    };
  }, [moderationQueueRows, slaTargetMinutes]);

  const filteredSessionMap = useMemo(() => {
    const next = new Map();
    filteredSessions.forEach((session) => {
      next.set(session.id, session);
    });
    return next;
  }, [filteredSessions]);

  const board = useMemo(() => buildBoardFromSessions(filteredSessions), [filteredSessions]);

  const questionAnalyticsRows = useMemo(() => {
    if (filteredSessions.length === 0) return [];

    const scoreSorted = filteredSessions.map((session) => session.score).sort((left, right) => left - right);
    const lowIndex = Math.floor((scoreSorted.length - 1) * 0.25);
    const highIndex = Math.floor((scoreSorted.length - 1) * 0.75);
    const lowCutoff = scoreSorted[Math.max(0, lowIndex)] || 0;
    const highCutoff = scoreSorted[Math.max(0, highIndex)] || 0;

    const map = new Map();
    filteredSessions.forEach((session) => {
      session.breakdown.forEach((entry) => {
        const key = `${entry.taskType}::${entry.label}`;
        if (!map.has(key)) {
          map.set(key, {
            questionKey: key,
            label: entry.label,
            taskType: entry.taskType,
            attempts: 0,
            correctCount: 0,
            scoreValues: [],
            highGroupScores: [],
            lowGroupScores: [],
            wrongAnswerCounts: new Map(),
            expectedAnswer: '',
          });
        }

        const bucket = map.get(key);
        const scorePercent = clampPercent(entry.score * 100);
        bucket.attempts += 1;
        bucket.scoreValues.push(scorePercent);
        if (entry.correct === true) bucket.correctCount += 1;
        if (!bucket.expectedAnswer) bucket.expectedAnswer = formatCorrectAnswer(entry.result);
        if (session.score >= highCutoff) bucket.highGroupScores.push(scorePercent);
        if (session.score <= lowCutoff) bucket.lowGroupScores.push(scorePercent);

        if (entry.correct === false) {
          const wrongAnswer = formatAnswer(entry.result);
          if (wrongAnswer && wrongAnswer !== 'No answer submitted') {
            const currentCount = bucket.wrongAnswerCounts.get(wrongAnswer) || 0;
            bucket.wrongAnswerCounts.set(wrongAnswer, currentCount + 1);
          }
        }
      });
    });

    return [...map.values()]
      .map((bucket) => {
        const avgScore = Math.round(mean(bucket.scoreValues));
        const difficulty = 100 - avgScore;
        const discrimination = Math.round(mean(bucket.highGroupScores) - mean(bucket.lowGroupScores));
        const distractors = [...bucket.wrongAnswerCounts.entries()]
          .sort((left, right) => right[1] - left[1])
          .slice(0, 3)
          .map(([answer, count]) => ({
            answer,
            count,
            rate: safePercent(count, bucket.attempts),
          }));
        return {
          questionKey: bucket.questionKey,
          label: bucket.label,
          taskType: bucket.taskType,
          attempts: bucket.attempts,
          avgScore,
          correctRate: safePercent(bucket.correctCount, bucket.attempts),
          difficulty,
          discrimination,
          expectedAnswer: bucket.expectedAnswer,
          distractors,
        };
      })
      .sort((left, right) => right.difficulty - left.difficulty || right.attempts - left.attempts);
  }, [filteredSessions]);

  const masteryBySkillRows = useMemo(() => {
    const bySkill = new Map();
    filteredSessions.forEach((session) => {
      session.breakdown.forEach((entry) => {
        const key = entry.taskType || 'unknown';
        if (!bySkill.has(key)) {
          bySkill.set(key, {
            skill: key,
            attempts: 0,
            scoreValues: [],
            studentSet: new Set(),
          });
        }
        const bucket = bySkill.get(key);
        bucket.attempts += 1;
        bucket.scoreValues.push(clampPercent(entry.score * 100));
        bucket.studentSet.add(session.studentName);
      });
    });

    return [...bySkill.values()]
      .map((bucket) => {
        const mastery = Math.round(mean(bucket.scoreValues));
        return {
          skill: bucket.skill,
          attempts: bucket.attempts,
          studentCount: bucket.studentSet.size,
          mastery,
        };
      })
      .sort((left, right) => right.mastery - left.mastery || right.attempts - left.attempts);
  }, [filteredSessions]);

  const cohortRows = useMemo(() => {
    const byCohort = new Map();
    filteredSessions.forEach((session) => {
      const key = session.origin || session.sourceType || 'local';
      if (!byCohort.has(key)) {
        byCohort.set(key, {
          cohort: key,
          count: 0,
          scoreValues: [],
          lateCount: 0,
        });
      }
      const bucket = byCohort.get(key);
      bucket.count += 1;
      bucket.scoreValues.push(session.score);
      if (session.isLateSubmission) bucket.lateCount += 1;
    });

    return [...byCohort.values()]
      .map((bucket) => ({
        cohort: bucket.cohort,
        count: bucket.count,
        avgScore: Math.round(mean(bucket.scoreValues)),
        lateRate: safePercent(bucket.lateCount, bucket.count),
      }))
      .sort((left, right) => right.count - left.count || right.avgScore - left.avgScore);
  }, [filteredSessions]);

  const trendRows = useMemo(() => {
    const byDay = new Map();
    filteredSessions.forEach((session) => {
      const day = formatDayKey(session.timestamp);
      if (!byDay.has(day)) {
        byDay.set(day, {
          day,
          scores: [],
          count: 0,
        });
      }
      const bucket = byDay.get(day);
      bucket.scores.push(session.score);
      bucket.count += 1;
    });

    return [...byDay.values()]
      .map((bucket) => ({
        day: bucket.day,
        count: bucket.count,
        avgScore: Math.round(mean(bucket.scores)),
      }))
      .sort((left, right) => left.day.localeCompare(right.day));
  }, [filteredSessions]);

  const confidenceStats = useMemo(() => {
    const pairs = [];
    const studentBuckets = new Map();

    filteredSessions.forEach((session) => {
      const scoreByBlockId = new Map(session.breakdown.map((entry) => [String(entry.id), clampPercent(entry.score * 100)]));
      const timeline = Array.isArray(session.interaction?.answerTimeline) ? session.interaction.answerTimeline : [];

      timeline.forEach((entry) => {
        const confidence = Number(entry?.confidence);
        const blockId = String(entry?.blockId || '');
        const score = scoreByBlockId.get(blockId);
        if (!Number.isFinite(confidence) || !Number.isFinite(score)) return;

        pairs.push({ x: confidence, y: score });

        if (!studentBuckets.has(session.studentName)) {
          studentBuckets.set(session.studentName, []);
        }
        studentBuckets.get(session.studentName).push({ x: confidence, y: score });
      });
    });

    const correlation = toPearsonCorrelation(pairs);
    const byStudent = [...studentBuckets.entries()]
      .map(([studentName, values]) => ({
        studentName,
        correlation: toPearsonCorrelation(values),
        sampleSize: values.length,
      }))
      .filter((entry) => entry.correlation !== null)
      .sort((left, right) => left.correlation - right.correlation);

    return {
      sampleSize: pairs.length,
      correlation,
      byStudent,
    };
  }, [filteredSessions]);

  const percentileRows = useMemo(() => {
    const sorted = [...studentRows].sort((left, right) => right.score - left.score || right.timestamp - left.timestamp);
    const maxIndex = Math.max(1, sorted.length - 1);
    return sorted.map((session, index) => {
      const percentile = sorted.length === 1 ? 100 : Math.round(((maxIndex - index) / maxIndex) * 100);
      let band = 'Median';
      if (percentile >= 90) band = 'Top 10%';
      else if (percentile >= 75) band = 'Top 25%';
      else if (percentile <= 25) band = 'Bottom 25%';
      return {
        session,
        percentile,
        band,
      };
    });
  }, [studentRows]);

  const watchlistRows = useMemo(() => {
    return percentileRows
      .map((entry) => {
        const session = entry.session;
        const reasons = [];
        let riskScore = 0;

        if (session.score < 60) {
          riskScore += 2;
          reasons.push('Low overall score');
        }
        if (session.isLateSubmission) {
          riskScore += 1;
          reasons.push('Late submission');
        }
        if (session.submissionState === 'awaiting_review') {
          riskScore += 1;
          reasons.push('Pending manual review');
        }
        if (entry.percentile <= 25) {
          riskScore += 1;
          reasons.push('Bottom percentile band');
        }

        return {
          session,
          percentile: entry.percentile,
          riskScore,
          reasons,
        };
      })
      .filter((entry) => entry.riskScore >= 2)
      .sort((left, right) => right.riskScore - left.riskScore || left.session.score - right.session.score);
  }, [percentileRows]);

  const exportAnalyticsPreset = useCallback((preset) => {
    const rows = [];
    if (preset === 'teacher') {
      rows.push(['Student', 'Score', 'Correct', 'Questions', 'Late', 'Submitted At']);
      studentRows.forEach((session) => {
        rows.push([
          session.studentName,
          `${session.score}%`,
          String(session.correctCount),
          String(session.breakdown.length),
          session.isLateSubmission ? 'Yes' : 'No',
          new Date(session.timestamp).toLocaleString(),
        ]);
      });
    } else if (preset === 'parent') {
      rows.push(['Student', 'Score', 'Percentile', 'Band', 'Mastery Snapshot']);
      percentileRows.forEach((entry) => {
        rows.push([
          entry.session.studentName,
          `${entry.session.score}%`,
          `${entry.percentile}`,
          entry.band,
          masteryBySkillRows.slice(0, 2).map((skill) => `${skill.skill}:${skill.mastery}%`).join(' | '),
        ]);
      });
    } else {
      rows.push(['Student', 'Score', 'Origin', 'Submission State', 'Late', 'Timestamp']);
      filteredSessions.forEach((session) => {
        rows.push([
          session.studentName,
          `${session.score}%`,
          session.origin,
          session.submissionState || 'graded',
          session.isLateSubmission ? 'Yes' : 'No',
          new Date(session.timestamp).toISOString(),
        ]);
      });
    }

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lesson-analytics-${preset}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setAnalyticsExportMessage(`Exported ${preset} preset.`);
  }, [filteredSessions, masteryBySkillRows, percentileRows, studentRows]);

  const printReportCards = useCallback(() => {
    const cards = percentileRows.slice(0, 60);
    if (cards.length === 0) {
      setAnalyticsExportMessage('No report cards to print for current filters.');
      return;
    }

    const html = `
      <html>
        <head>
          <title>Student Report Cards</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
            h1 { font-size: 20px; margin-bottom: 12px; }
            .card { border: 1px solid #d4d4d8; padding: 12px; margin-bottom: 10px; }
            .meta { font-size: 12px; color: #52525b; }
          </style>
        </head>
        <body>
          <h1>${activeLesson?.lessonTitle || 'Lesson'} - Student Report Cards</h1>
          ${cards.map((entry) => `
            <div class="card">
              <div><strong>${entry.session.studentName}</strong></div>
              <div class="meta">Score: ${entry.session.score}% | Percentile: ${entry.percentile} | Band: ${entry.band}</div>
              <div class="meta">Submitted: ${new Date(entry.session.timestamp).toLocaleString()}</div>
            </div>
          `).join('')}
        </body>
      </html>
    `;

    const popup = window.open('', '_blank', 'noopener,noreferrer,width=980,height=760');
    if (!popup) {
      setAnalyticsExportMessage('Popup blocked. Enable popups to print report cards.');
      return;
    }

    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
    setAnalyticsExportMessage('Opened printable report cards.');
  }, [activeLesson?.lessonTitle, percentileRows]);

  const handleCreateBoardShare = async () => {
    if (!activeLesson || board.rows.length === 0 || board.columns.length === 0) {
      setBoardShareState('empty');
      return;
    }

    setBoardShareState('creating');
    const payload = {
      shareType: 'published_board',
      lessonTitle: activeLesson.lessonTitle,
      createdAt: Date.now(),
      columns: board.columns,
      rows: board.rows.map((row) => ({
        rank: row.rank,
        sessionId: row.sessionId,
        studentName: displayStudentName(row.studentName),
        origin: row.origin,
        overallScore: row.score,
        timestamp: row.timestamp,
        isLateSubmission: row.isLateSubmission === true,
        cells: board.columns.map((column) => {
          const cell = row.cellMap.get(column.id);
          return {
            columnId: column.id,
            correct: cell?.correct ?? null,
            score: typeof cell?.score === 'number' ? cell.score : null,
          };
        }),
      })),
    };

    const result = await createResultShareLink(payload, null);
    if (!result.ok) {
      setBoardShareState('error');
      return;
    }

    setBoardShareLink(result.shareUrl || '');
    setBoardShareState('ready');
  };

  const handleCopyBoardShareLink = async () => {
    if (!boardShareLink) return;
    try {
      await navigator.clipboard.writeText(boardShareLink);
      setBoardShareState('copied');
      window.setTimeout(() => setBoardShareState('ready'), 1500);
    } catch {
      setBoardShareState('copy-error');
    }
  };

  const handleCreateSessionShare = useCallback(async (session) => {
    const currentDraft = verdictDrafts[session.id] || toVerdictDraft(session);
    const reviewedSession = buildReviewedSession(session, currentDraft);

    setSessionShareLoadingId(session.id);
    const result = await createResultShareLink(reviewedSession, reviewedSession.submissionId || null);
    setSessionShareLoadingId('');

    if (!result.ok || !result.shareUrl) {
      setVerdictMessages((current) => ({
        ...current,
        [session.id]: 'Could not create result share link from current review state.',
      }));
      return;
    }

    setSessionShareLinks((current) => ({
      ...current,
      [session.id]: result.shareUrl,
    }));
    setVerdictMessages((current) => ({
      ...current,
      [session.id]: 'Result share link created from current reviewed answers.',
    }));
  }, [verdictDrafts]);

  const handleCopySessionShare = useCallback(async (sessionId) => {
    const value = sessionShareLinks[sessionId];
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setVerdictMessages((current) => ({
        ...current,
        [sessionId]: 'Result share link copied to clipboard.',
      }));
    } catch {
      setVerdictMessages((current) => ({
        ...current,
        [sessionId]: 'Clipboard is unavailable. Copy the share link manually.',
      }));
    }
  }, [sessionShareLinks]);

  const ensureSessionDraft = useCallback((session) => {
    setVerdictDrafts((current) => {
      if (current[session.id]) return current;
      return {
        ...current,
        [session.id]: toVerdictDraft(session),
      };
    });
  }, []);

  const handleDraftVerdictChange = useCallback((session, entryId, verdict) => {
    ensureSessionDraft(session);
    setVerdictDrafts((current) => {
      const sessionDraft = current[session.id] || toVerdictDraft(session);
      const entryDraft = sessionDraft[entryId] || { verdict: 'pending', scorePercent: 0, feedback: '' };
      const nextScore = scoreFromVerdict(verdict, clampPercent(entryDraft.scorePercent));
      return {
        ...current,
        [session.id]: {
          ...sessionDraft,
          [entryId]: {
            ...entryDraft,
            verdict,
            scorePercent: nextScore,
          },
        },
      };
    });
  }, [ensureSessionDraft]);

  const handleDraftScoreChange = useCallback((session, entryId, nextValue) => {
    ensureSessionDraft(session);
    setVerdictDrafts((current) => {
      const sessionDraft = current[session.id] || toVerdictDraft(session);
      const entryDraft = sessionDraft[entryId] || { verdict: 'pending', scorePercent: 0, feedback: '' };
      const scorePercent = clampPercent(nextValue);
      const verdict = scorePercent >= 100
        ? 'correct'
        : scorePercent <= 0
          ? (entryDraft.verdict === 'pending' ? 'pending' : 'incorrect')
          : 'partial';
      return {
        ...current,
        [session.id]: {
          ...sessionDraft,
          [entryId]: {
            ...entryDraft,
            verdict,
            scorePercent,
          },
        },
      };
    });
  }, [ensureSessionDraft]);

  const handleDraftFeedbackChange = useCallback((session, entryId, nextValue) => {
    ensureSessionDraft(session);
    setVerdictDrafts((current) => {
      const sessionDraft = current[session.id] || toVerdictDraft(session);
      const entryDraft = sessionDraft[entryId] || { verdict: 'pending', scorePercent: 0, feedback: '' };
      return {
        ...current,
        [session.id]: {
          ...sessionDraft,
          [entryId]: {
            ...entryDraft,
            feedback: String(nextValue || '').slice(0, 1500),
          },
        },
      };
    });
  }, [ensureSessionDraft]);

  const handleApplyFeedbackChip = useCallback((session, entryId, chip) => {
    ensureSessionDraft(session);
    setVerdictDrafts((current) => {
      const sessionDraft = current[session.id] || toVerdictDraft(session);
      const entryDraft = sessionDraft[entryId] || { verdict: 'pending', scorePercent: 0, feedback: '' };
      return {
        ...current,
        [session.id]: {
          ...sessionDraft,
          [entryId]: {
            ...entryDraft,
            feedback: appendFeedbackChip(entryDraft.feedback, chip).slice(0, 1500),
          },
        },
      };
    });
  }, [ensureSessionDraft]);

  const handleApplyRubricTemplate = useCallback((session, entryId, templateLine) => {
    ensureSessionDraft(session);
    setVerdictDrafts((current) => {
      const sessionDraft = current[session.id] || toVerdictDraft(session);
      const entryDraft = sessionDraft[entryId] || { verdict: 'pending', scorePercent: 0, feedback: '' };
      const feedback = appendFeedbackChip(entryDraft.feedback, templateLine).slice(0, 1500);
      return {
        ...current,
        [session.id]: {
          ...sessionDraft,
          [entryId]: {
            ...entryDraft,
            feedback,
          },
        },
      };
    });
  }, [ensureSessionDraft]);

  const handleGenerateAssistedFeedback = useCallback((session, entry, draft) => {
    ensureSessionDraft(session);
    setVerdictDrafts((current) => {
      const sessionDraft = current[session.id] || toVerdictDraft(session);
      const entryDraft = sessionDraft[entry.id] || { verdict: 'pending', scorePercent: 0, feedback: '' };
      const generated = buildAssistedFeedbackDraft(entry, draft || entryDraft);
      const existing = String(entryDraft.feedback || '').trim();
      const nextFeedback = existing
        ? `${existing}\n\n${generated}`.slice(0, 1500)
        : generated.slice(0, 1500);

      return {
        ...current,
        [session.id]: {
          ...sessionDraft,
          [entry.id]: {
            ...entryDraft,
            feedback: nextFeedback,
          },
        },
      };
    });
  }, [ensureSessionDraft]);

  const handleAdjustmentReasonChange = useCallback((sessionId, value) => {
    setSessionAdjustmentReasons((current) => ({
      ...current,
      [sessionId]: String(value || '').slice(0, 300),
    }));
  }, []);

  const handleResetSessionDraft = useCallback((session) => {
    setVerdictDrafts((current) => ({
      ...current,
      [session.id]: toVerdictDraft(session),
    }));
    setVerdictMessages((current) => ({
      ...current,
      [session.id]: '',
    }));
  }, []);

  const persistReviewedSession = useCallback(async (session, draftMap, options = {}) => {
    const reason = String(options.reason ?? sessionAdjustmentReasons[session.id] ?? '').trim();
    let reviewedSession = buildReviewedSession(session, draftMap);
    const regradeDiff = summarizeRegradeDiff(session, reviewedSession);

    if (regradeDiff.length > 0 || reason) {
      const existingHistory = Array.isArray(session?.interaction?.regradeHistory)
        ? session.interaction.regradeHistory
        : [];
      const regradeEvent = {
        id: `regrade-${Date.now()}-${session.id}`,
        at: Date.now(),
        reason: reason || 'No reason provided',
        changedCount: regradeDiff.length,
        changes: regradeDiff.slice(0, 25),
      };

      reviewedSession = {
        ...reviewedSession,
        interaction: {
          ...(reviewedSession.interaction || {}),
          gradeAdjustmentReason: reason || null,
          regradeHistory: [regradeEvent, ...existingHistory].slice(0, 50),
        },
      };
    }

    setSessionOverrides((current) => ({
      ...current,
      [session.id]: reviewedSession,
    }));
    setVerdictSavingId(session.id);
    setVerdictMessages((current) => ({
      ...current,
      [session.id]: 'Saving verdict changes...',
    }));

    let localStatus = 'skipped';
    const localSaveId = String(reviewedSession.localSessionId || reviewedSession.id || '').trim();
    if (localSaveId && localSessionIds.has(localSaveId)) {
      saveSession({
        ...reviewedSession,
        id: localSaveId,
        timestamp: reviewedSession.timestamp,
      });
      localStatus = 'saved';
      if (typeof onSessionsChanged === 'function') {
        onSessionsChanged();
      }
    }

    const syncResults = await Promise.allSettled([
      updateCloudSessionGrade({
        ...reviewedSession,
        id: localSaveId || reviewedSession.id,
      }),
      reviewedSession.submissionId
        ? updateAssignmentSubmissionGrade(reviewedSession.submissionId, reviewedSession)
        : Promise.resolve({ ok: true, skipped: true }),
    ]);

    const cloudResult = syncResults[0].status === 'fulfilled'
      ? syncResults[0].value
      : { state: 'error', reason: 'Cloud sync crashed' };
    const assignmentResult = syncResults[1].status === 'fulfilled'
      ? syncResults[1].value
      : { ok: false, reason: 'Assignment update crashed' };

    const statusParts = [];
    if (localStatus === 'saved') statusParts.push('local saved');
    if (cloudResult.state === 'synced') statusParts.push('cloud synced');
    else if (cloudResult.state === 'unavailable') statusParts.push(`cloud unavailable (${cloudResult.reason || 'offline'})`);
    else statusParts.push(`cloud failed (${cloudResult.reason || 'unknown'})`);

    if (reviewedSession.submissionId) {
      if (assignmentResult.ok) statusParts.push('homework updated');
      else statusParts.push(`homework failed (${assignmentResult.reason || 'unknown'})`);
    }
    if (reason) statusParts.push('reason logged');
    if (regradeDiff.length > 0) {
      statusParts.push(`${regradeDiff.length} change${regradeDiff.length === 1 ? '' : 's'} tracked`);
    }

    setVerdictSavingId('');
    setVerdictMessages((current) => ({
      ...current,
      [session.id]: `Verdict updated: ${statusParts.join(' · ')}.`,
    }));
    setSessionAdjustmentReasons((current) => ({
      ...current,
      [session.id]: '',
    }));

    await refreshCloudSessions();
  }, [localSessionIds, onSessionsChanged, refreshCloudSessions, sessionAdjustmentReasons]);

  const handleApplySessionVerdict = useCallback(async (session) => {
    const currentDraft = verdictDrafts[session.id] || toVerdictDraft(session);
    await persistReviewedSession(session, currentDraft, {
      reason: sessionAdjustmentReasons[session.id] || '',
    });
  }, [persistReviewedSession, sessionAdjustmentReasons, verdictDrafts]);

  const handleModerationQuickVerdict = useCallback(async (row, verdict) => {
    const session = filteredSessionMap.get(row.sessionId);
    if (!session) return;

    const currentDraft = verdictDrafts[session.id] || toVerdictDraft(session);
    const existingDraft = currentDraft[row.entryId] || { verdict: 'pending', scorePercent: 0, feedback: '' };
    const nextDraft = {
      ...currentDraft,
      [row.entryId]: {
        ...existingDraft,
        verdict,
        scorePercent: scoreFromVerdict(verdict, clampPercent(existingDraft.scorePercent)),
      },
    };

    setVerdictDrafts((current) => ({
      ...current,
      [session.id]: nextDraft,
    }));

    await persistReviewedSession(session, nextDraft, {
      reason: 'Moderation quick verdict',
    });
  }, [filteredSessionMap, persistReviewedSession, verdictDrafts]);

  if (!selectedLessonKey) {
    return (
      <div className="min-h-screen bg-[#f7f7f5] p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <header className="flex flex-wrap items-center justify-between gap-3 border border-zinc-200 bg-white px-4 py-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Grading</div>
              <div className="mt-1 text-xl font-semibold text-zinc-950">Select a lesson</div>
              <div className="mt-1 text-[11px] text-zinc-500">{cloudMessage || 'Choose one lesson to open grading.'}</div>
            </div>
            <div className="flex items-center gap-2">
              <IconActionButton onClick={refreshCloudSessions} disabled={cloudLoading} title={cloudLoading ? 'Refreshing sessions' : 'Refresh sessions'}>
                <RefreshIcon />
              </IconActionButton>
              <IconActionButton onClick={onBack} title="Back to home">
                <BackIcon />
              </IconActionButton>
            </div>
          </header>

          {lessons.length === 0 ? (
            <div className="border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm text-zinc-500">No graded sessions yet.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {lessons.map((lesson) => (
                <button key={lesson.key} type="button" onClick={() => setSelectedLessonKey(lesson.key)} className="border border-zinc-200 bg-white px-4 py-4 text-left transition hover:border-zinc-900">
                  <div className="text-sm font-semibold text-zinc-900">{lesson.lessonTitle}</div>
                  <div className="mt-2 text-xs text-zinc-500">Students/sessions: {lesson.count}</div>
                  <div className="mt-1 text-xs text-zinc-500">Average score: {lesson.avgScore}%</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 border border-zinc-200 bg-white px-4 py-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Grading</div>
            <div className="mt-1 text-xl font-semibold text-zinc-950">{activeLesson?.lessonTitle || 'Lesson'}</div>
            <div className="mt-1 text-[11px] text-zinc-500">{cloudMessage || 'Student and question grading view.'}</div>
          </div>
          <div className="flex items-center gap-2">
            <IconActionButton onClick={refreshCloudSessions} disabled={cloudLoading} title={cloudLoading ? 'Refreshing sessions' : 'Refresh sessions'}>
              <RefreshIcon />
            </IconActionButton>
            <IconActionButton onClick={() => setSelectedLessonKey(null)} title="Change lesson">
              <ExportIcon className="rotate-90" />
            </IconActionButton>
            <IconActionButton onClick={onBack} title="Back to home">
              <BackIcon />
            </IconActionButton>
          </div>
        </header>

        <section className="border border-zinc-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Filter by student</span>
              <select value={selectedStudent} onChange={(event) => setSelectedStudent(event.target.value)} className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
                {studentOptions.map((student) => (
                  <option key={student} value={student}>{student === 'all' ? 'All students' : displayStudentName(student)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Filter by question</span>
              <select value={selectedQuestion} onChange={(event) => setSelectedQuestion(event.target.value)} className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
                {questionOptions.map((question) => (
                  <option key={question} value={question}>{question === 'all' ? 'All questions' : question.split('::')[1]}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">SLA reminder (minutes)</span>
              <input
                type="number"
                min={1}
                step={5}
                value={slaTargetMinutes}
                onChange={(event) => setSlaTargetMinutes(Math.max(1, toNumber(event.target.value, 120)))}
                className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
              />
            </label>
            <label className="flex items-center gap-2 border border-zinc-200 px-3 py-2 text-sm text-zinc-700">
              <input type="checkbox" checked={anonymizedMode} onChange={(event) => setAnonymizedMode(event.target.checked)} />
              Anonymized grading mode
            </label>
          </div>

          <div className="mt-4 inline-flex border border-zinc-200 bg-white p-0.5">
            <button type="button" onClick={() => setView('students')} className={view === 'students' ? 'bg-zinc-900 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-white' : 'px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-600 hover:bg-zinc-50'}>Students</button>
            <button type="button" onClick={() => setView('questions')} className={view === 'questions' ? 'bg-zinc-900 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-white' : 'px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-600 hover:bg-zinc-50'}>Questions</button>
            <button type="button" onClick={() => setView('moderation')} className={view === 'moderation' ? 'bg-zinc-900 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-white' : 'px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-600 hover:bg-zinc-50'}>Moderation</button>
            <button type="button" onClick={() => setView('analytics')} className={view === 'analytics' ? 'bg-zinc-900 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-white' : 'px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-600 hover:bg-zinc-50'}>Analytics</button>
            <button type="button" onClick={() => setView('board')} className={view === 'board' ? 'bg-zinc-900 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-white' : 'px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-600 hover:bg-zinc-50'}>Published board</button>
          </div>
        </section>

        {view === 'students' && (
          <section className="border border-zinc-200 bg-white p-4">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Students ({studentRows.length})</div>
            <div className="space-y-2">
              {studentRows.map((session) => {
                const expanded = expandedStudent === session.id;
                const sessionDraft = verdictDrafts[session.id] || toVerdictDraft(session);
                const sessionMessage = verdictMessages[session.id] || '';
                return (
                  <div key={session.id} className="border border-zinc-200">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedStudent(expanded ? '' : session.id);
                        if (!expanded) ensureSessionDraft(session);
                      }}
                      className="grid w-full gap-2 px-3 py-3 text-left sm:grid-cols-[1fr_120px_150px_90px]"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-900">
                          <span>{displayStudentName(session.studentName)}</span>
                          {session.isLateSubmission && <span className="border border-red-200 bg-red-50 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-red-700">Late</span>}
                        </div>
                        <div className="text-[11px] text-zinc-500">{new Date(session.timestamp).toLocaleString()}</div>
                      </div>
                      <div className="text-sm text-zinc-700">Score: {session.score}%</div>
                      <div className="text-sm text-zinc-700">Questions: {session.breakdown.length}</div>
                      <div className="flex items-center justify-end text-zinc-500">
                        <ChevronDownIcon className={expanded ? 'rotate-180 transition' : 'transition'} />
                      </div>
                    </button>
                    {expanded && (
                      <div className="border-t border-zinc-200 bg-zinc-50 p-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border border-zinc-200 bg-white px-3 py-2">
                          <div>
                            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Verdict editor</div>
                            <div className="text-xs text-zinc-600">Adjust score and correctness, then apply to sync.</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleResetSessionDraft(session)}
                              className="inline-flex items-center gap-1 border border-zinc-200 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.14em] text-zinc-700 hover:border-zinc-900"
                            >
                              <EditIcon />
                              Reset
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCreateSessionShare(session)}
                              disabled={sessionShareLoadingId === session.id}
                              className="inline-flex items-center gap-1 border border-zinc-200 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.14em] text-zinc-700 hover:border-zinc-900 disabled:opacity-60"
                            >
                              <ExportIcon />
                              {sessionShareLoadingId === session.id ? 'Sharing' : 'Share'}
                            </button>
                            {sessionShareLinks[session.id] && (
                              <button
                                type="button"
                                onClick={() => handleCopySessionShare(session.id)}
                                className="inline-flex items-center gap-1 border border-zinc-200 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.14em] text-zinc-700 hover:border-zinc-900"
                              >
                                <CopyIcon />
                                Copy link
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleApplySessionVerdict(session)}
                              disabled={verdictSavingId === session.id}
                              className="inline-flex items-center gap-1 border border-zinc-900 bg-zinc-900 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.14em] text-white disabled:opacity-60"
                            >
                              <CheckIcon />
                              {verdictSavingId === session.id ? 'Saving' : 'Apply'}
                            </button>
                          </div>
                        </div>

                        {sessionMessage && <div className="mb-3 text-xs text-zinc-600">{sessionMessage}</div>}
                        {sessionShareLinks[session.id] && (
                          <input readOnly value={sessionShareLinks[session.id]} className="mb-3 w-full border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-700" />
                        )}
                        <label className="mb-3 block space-y-1">
                          <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Grade adjustment reason</span>
                          <input
                            value={sessionAdjustmentReasons[session.id] || ''}
                            onChange={(event) => handleAdjustmentReasonChange(session.id, event.target.value)}
                            placeholder="Optional reason that will be tracked with this regrade"
                            className="w-full border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 outline-none focus:border-zinc-900"
                          />
                        </label>
                        {Array.isArray(session.interaction?.regradeHistory) && session.interaction.regradeHistory.length > 0 && (
                          <details className="mb-3 border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                            <summary className="cursor-pointer text-[10px] uppercase tracking-[0.14em] text-zinc-500">Regrade history ({session.interaction.regradeHistory.length})</summary>
                            <div className="mt-2 space-y-2">
                              {session.interaction.regradeHistory.slice(0, 5).map((event) => (
                                <div key={event.id || `${event.at}-${event.reason}`} className="border border-zinc-200 bg-zinc-50 px-2 py-2">
                                  <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{new Date(event.at || Date.now()).toLocaleString()} · {event.changedCount || 0} changed</div>
                                  <div className="mt-1 text-xs text-zinc-700">Reason: {event.reason || 'No reason provided'}</div>
                                  {Array.isArray(event.changes) && event.changes.length > 0 && (
                                    <div className="mt-1 space-y-1 text-[11px] text-zinc-600">
                                      {event.changes.slice(0, 3).map((change) => (
                                        <div key={`${event.id || event.at}-${change.entryId}`}>
                                          {change.label}: {change.before?.verdict || 'pending'} {change.before?.scorePercent ?? 0}% to {change.after?.verdict || 'pending'} {change.after?.scorePercent ?? 0}%
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                        {extractAntiCheatTimeline(session).length > 0 && (
                          <details className="mb-3 border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
                            <summary className="cursor-pointer text-[10px] uppercase tracking-[0.14em] text-zinc-500">Anti-cheat timeline ({extractAntiCheatTimeline(session).length})</summary>
                            <div className="mt-2 space-y-1">
                              {extractAntiCheatTimeline(session).slice(0, 20).map((event) => (
                                <div key={event.id} className="border border-zinc-200 bg-zinc-50 px-2 py-1.5">
                                  <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{new Date(event.at).toLocaleString()} · {event.type}</div>
                                  {event.blockId && <div className="mt-0.5 text-[11px] text-zinc-600">Block: {event.blockId}</div>}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}

                        <div className="space-y-2">
                          {session.breakdown
                            .filter((entry) => selectedQuestion === 'all' || `${entry.taskType}::${entry.label}` === selectedQuestion)
                            .map((entry) => {
                              const draft = sessionDraft[entry.id] || {
                                verdict: verdictFromEntry(entry),
                                scorePercent: clampPercent(entry.score * 100),
                                feedback: typeof entry?.result?.feedback === 'string' ? entry.result.feedback : '',
                              };

                              const tone = draft.verdict === 'correct'
                                ? 'border-emerald-300 bg-emerald-50/40'
                                : draft.verdict === 'incorrect'
                                  ? 'border-red-300 bg-red-50/40'
                                  : draft.verdict === 'partial'
                                    ? 'border-amber-300 bg-amber-50/40'
                                    : 'border-zinc-200 bg-white';

                              return (
                                <div key={`${session.id}-${entry.id}`} className={`border p-3 ${tone}`}>
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div>
                                      <div className="text-sm font-semibold text-zinc-900">{entry.label}</div>
                                      <div className="text-[11px] text-zinc-500">{entry.taskType}</div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => handleDraftVerdictChange(session, entry.id, cycleVerdict(draft.verdict))}
                                        className="border border-zinc-200 bg-white px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-zinc-700 hover:border-zinc-900"
                                      >
                                        Verdict: {draft.verdict}
                                      </button>
                                      <label className="inline-flex items-center gap-1 border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 focus-within:border-zinc-900">
                                        <span>Score</span>
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          step={1}
                                          value={draft.scorePercent}
                                          onChange={(event) => handleDraftScoreChange(session, entry.id, event.target.value)}
                                          className="w-16 border-none bg-transparent text-right text-xs text-zinc-900 outline-none"
                                        />
                                        <span>%</span>
                                      </label>
                                    </div>
                                  </div>
                                  <div className="mt-2">
                                    <StudentAnswerCard entry={entry} draft={draft} />
                                  </div>
                                  <label className="mt-2 block space-y-1">
                                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Teacher feedback</span>
                                    <textarea
                                      rows={3}
                                      value={draft.feedback || ''}
                                      onChange={(event) => handleDraftFeedbackChange(session, entry.id, event.target.value)}
                                      placeholder="Add feedback for this answer..."
                                      className="w-full border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 outline-none focus:border-zinc-900"
                                    />
                                  </label>
                                  <div className="mt-1 space-y-2">
                                    <div>
                                      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">Quick comments</div>
                                      <div className="flex flex-wrap gap-1">
                                        {QUICK_FEEDBACK_CHIPS.map((chip) => (
                                          <button
                                            key={`${entry.id}-${chip}`}
                                            type="button"
                                            onClick={() => handleApplyFeedbackChip(session, entry.id, chip)}
                                            className="border border-zinc-200 bg-white px-2 py-1 text-[10px] text-zinc-600 hover:border-zinc-900"
                                          >
                                            {chip}
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">Rubric templates ({entry.taskType})</div>
                                      <div className="flex flex-wrap gap-1">
                                        {getRubricTemplatesForTask(entry.taskType).map((templateLine, templateIndex) => (
                                          <button
                                            key={`${entry.id}-rubric-${templateIndex}`}
                                            type="button"
                                            onClick={() => handleApplyRubricTemplate(session, entry.id, templateLine)}
                                            className="border border-zinc-200 bg-white px-2 py-1 text-[10px] text-zinc-600 hover:border-zinc-900"
                                          >
                                            Rubric {templateIndex + 1}
                                          </button>
                                        ))}
                                        <button
                                          type="button"
                                          onClick={() => handleGenerateAssistedFeedback(session, entry, draft)}
                                          className="border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] text-blue-700 hover:border-blue-400"
                                        >
                                          Assist draft
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="mt-1 text-[10px] text-zinc-500">
                                    Pending feedback and verdict changes apply when you click Apply for this student.
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {studentRows.length === 0 && <div className="border border-dashed border-zinc-200 px-4 py-5 text-sm text-zinc-500">No student sessions match the selected filters.</div>}
            </div>
          </section>
        )}

        {view === 'questions' && (
          <section className="border border-zinc-200 bg-white p-4">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Question responses ({questionRows.length})</div>
            {questionCompareOptions.length >= 2 && (
              <div className="mb-4 border border-zinc-200 bg-zinc-50 p-3">
                <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">Side-by-side compare</div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Response A</span>
                    <select value={compareLeftId} onChange={(event) => setCompareLeftId(event.target.value)} className="w-full border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-zinc-900">
                      {questionCompareOptions.map((option) => (
                        <option key={`left-${option.compareId}`} value={option.compareId}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Response B</span>
                    <select value={compareRightId} onChange={(event) => setCompareRightId(event.target.value)} className="w-full border border-zinc-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-zinc-900">
                      {questionCompareOptions.map((option) => (
                        <option key={`right-${option.compareId}`} value={option.compareId}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {[compareLeftRow, compareRightRow].map((row, index) => (
                    <div key={`compare-panel-${index}`} className="border border-zinc-200 bg-white px-3 py-3">
                      {row ? (
                        <>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="text-sm font-semibold text-zinc-900">{displayStudentName(row.studentName)}</div>
                            <div className="text-xs text-zinc-500">{row.score}%</div>
                          </div>
                          <div className="mt-1 text-[11px] text-zinc-500">{row.questionLabel} ({row.taskType})</div>
                          <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{row.answer}</div>
                          {row.expectedAnswer && (
                            <div className="mt-2 border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs text-zinc-700">
                              <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Expected answer</div>
                              <div className="mt-1 whitespace-pre-wrap">{row.expectedAnswer}</div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="text-xs text-zinc-500">Select a response to compare.</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              {questionRows.map((row, index) => {
                const tone = row.correct === true
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : row.correct === false
                    ? 'border-red-200 bg-red-50 text-red-900'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-700';
                const lateClass = row.isLateSubmission ? 'ring-1 ring-red-300' : '';
                return (
                  <div key={`${row.sessionId}-${index}`} className={`border px-3 py-3 ${tone} ${lateClass}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        <span>{displayStudentName(row.studentName)}</span>
                        {row.isLateSubmission && <span className="border border-red-300 bg-red-100 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-red-700">Late</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs">{row.score}%</div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedStudent(row.studentName);
                            setSelectedQuestion(row.questionKey);
                            setExpandedStudent(row.sessionId);
                            setView('students');
                          }}
                          className="border border-current/30 bg-white/70 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] hover:border-current"
                        >
                          Open grading
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] opacity-80">{row.questionLabel} ({row.taskType})</div>
                    {row.isLateSubmission && row.dueAt && (
                      <div className="mt-1 text-[10px] opacity-80">Submitted after due time ({new Date(row.dueAt).toLocaleString()}).</div>
                    )}
                    <div className="mt-2 whitespace-pre-wrap text-sm">{row.answer}</div>
                    {row.expectedAnswer && (
                      <div className="mt-2 border border-current/25 bg-white/70 px-2 py-1.5 text-xs">
                        <div className="text-[10px] uppercase tracking-[0.12em] opacity-70">Expected answer</div>
                        <div className="mt-1 whitespace-pre-wrap">{row.expectedAnswer}</div>
                      </div>
                    )}
                  </div>
                );
              })}
              {questionRows.length === 0 && <div className="border border-dashed border-zinc-200 px-4 py-5 text-sm text-zinc-500">No question responses for current filters.</div>}
            </div>
          </section>
        )}

        {view === 'moderation' && (
          <section className="border border-zinc-200 bg-white p-4">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Manual-Review Queue ({moderationQueueRows.length})</div>
            <div className="mb-3 grid gap-2 sm:grid-cols-3">
              <div className="border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">Pending: <strong>{moderationSlaSummary.pendingCount}</strong></div>
              <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Due soon: <strong>{moderationSlaSummary.dueSoonCount}</strong> (&gt;= 75% of {moderationSlaSummary.threshold}m)</div>
              <div className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">Overdue: <strong>{moderationSlaSummary.overdueCount}</strong> (&gt; {moderationSlaSummary.threshold}m)</div>
            </div>
            <div className="space-y-2">
              {moderationQueueRows.map((row, index) => {
                const saving = verdictSavingId === row.sessionId;
                const ageMinutes = ageMinutesFromTimestamp(row.timestamp);
                const overdue = ageMinutes > moderationSlaSummary.threshold;
                const dueSoon = !overdue && ageMinutes >= Math.round(moderationSlaSummary.threshold * 0.75);
                const rowTone = overdue
                  ? 'border-red-300 bg-red-50/50'
                  : dueSoon
                    ? 'border-amber-300 bg-amber-50/60'
                    : 'border-amber-200 bg-amber-50/40';
                return (
                  <div key={`${row.sessionId}-${row.entryId}-${index}`} className={`border px-3 py-3 ${rowTone}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-900">
                          <span>{displayStudentName(row.studentName)}</span>
                          {row.isLateSubmission && <span className="border border-red-300 bg-red-100 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-red-700">Late</span>}
                          {overdue && <span className="border border-red-300 bg-red-100 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-red-700">SLA overdue</span>}
                          {!overdue && dueSoon && <span className="border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-amber-700">SLA soon</span>}
                        </div>
                        <div className="text-[11px] text-zinc-600">{row.questionLabel} ({row.taskType})</div>
                      </div>
                      <div className="text-right text-[11px] text-zinc-500">
                        <div>{new Date(row.timestamp).toLocaleString()}</div>
                        <div>Age: {formatElapsedMinutes(ageMinutes)}</div>
                      </div>
                    </div>
                    <div className="mt-2 border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-700">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Student answer</div>
                      <div className="mt-1 whitespace-pre-wrap">{row.answer}</div>
                    </div>
                    {row.expectedAnswer && (
                      <div className="mt-2 border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-700">
                        <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Expected answer</div>
                        <div className="mt-1 whitespace-pre-wrap">{row.expectedAnswer}</div>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleModerationQuickVerdict(row, 'correct')}
                        disabled={saving}
                        className="border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-800 disabled:opacity-50"
                      >
                        Mark Correct
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModerationQuickVerdict(row, 'partial')}
                        disabled={saving}
                        className="border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-amber-800 disabled:opacity-50"
                      >
                        Mark Partial
                      </button>
                      <button
                        type="button"
                        onClick={() => handleModerationQuickVerdict(row, 'incorrect')}
                        disabled={saving}
                        className="border border-red-300 bg-red-50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-red-800 disabled:opacity-50"
                      >
                        Mark Incorrect
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStudent(row.studentName);
                          setSelectedQuestion(row.questionKey);
                          setExpandedStudent(row.sessionId);
                          setView('students');
                        }}
                        className="ml-auto border border-zinc-200 bg-white px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-700 hover:border-zinc-900"
                      >
                        Open Full Editor
                      </button>
                    </div>
                  </div>
                );
              })}
              {moderationQueueRows.length === 0 && <div className="border border-dashed border-zinc-200 px-4 py-5 text-sm text-zinc-500">No pending manual-review answers for current filters.</div>}
            </div>
          </section>
        )}

        {view === 'analytics' && (
          <section className="space-y-4 border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Analytics</div>
                <div className="mt-1 text-sm text-zinc-700">Difficulty, discrimination, mastery, cohorts, trends, confidence alignment, and watchlist insights.</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => exportAnalyticsPreset('teacher')} className="border border-zinc-200 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] text-zinc-700 hover:border-zinc-900">Export teacher</button>
                <button type="button" onClick={() => exportAnalyticsPreset('parent')} className="border border-zinc-200 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] text-zinc-700 hover:border-zinc-900">Export parent</button>
                <button type="button" onClick={() => exportAnalyticsPreset('admin')} className="border border-zinc-200 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] text-zinc-700 hover:border-zinc-900">Export admin</button>
                <button type="button" onClick={printReportCards} className="border border-zinc-900 bg-zinc-900 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.14em] text-white">Print report cards</button>
              </div>
            </div>
            {analyticsExportMessage && <div className="text-xs text-zinc-500">{analyticsExportMessage}</div>}

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Item Difficulty + Discrimination</div>
                <div className="mt-2 space-y-2">
                  {questionAnalyticsRows.slice(0, 8).map((row) => (
                    <div key={row.questionKey} className="border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-700">
                      <div className="font-medium text-zinc-900">{row.label}</div>
                      <div className="mt-1 text-[11px] text-zinc-500">{row.taskType} · attempts {row.attempts}</div>
                      <div className="mt-1 grid grid-cols-3 gap-2 text-[11px]">
                        <span>Difficulty: {row.difficulty}</span>
                        <span>Discrimination: {row.discrimination}</span>
                        <span>Correct: {row.correctRate}%</span>
                      </div>
                    </div>
                  ))}
                  {questionAnalyticsRows.length === 0 && <div className="border border-dashed border-zinc-200 px-3 py-4 text-xs text-zinc-500">No question analytics for current filters.</div>}
                </div>
              </div>

              <div className="border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Distractor Effectiveness (MCQ)</div>
                <div className="mt-2 space-y-2">
                  {questionAnalyticsRows
                    .filter((row) => ['multiple_choice', 'multi_select', 'true_false', 'yes_no', 'either_or'].includes(row.taskType))
                    .slice(0, 6)
                    .map((row) => (
                      <div key={`distractor-${row.questionKey}`} className="border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-700">
                        <div className="font-medium text-zinc-900">{row.label}</div>
                        <div className="mt-1 text-[11px] text-zinc-500">Top wrong responses:</div>
                        <div className="mt-1 space-y-1">
                          {row.distractors.length > 0
                            ? row.distractors.map((entry) => (
                              <div key={`${row.questionKey}-${entry.answer}`} className="flex items-center justify-between gap-2 border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px]">
                                <span className="truncate">{entry.answer}</span>
                                <span className="shrink-0">{entry.count} ({entry.rate}%)</span>
                              </div>
                            ))
                            : <div className="text-[11px] text-zinc-500">No repeated distractors yet.</div>}
                        </div>
                      </div>
                    ))}
                  {questionAnalyticsRows.filter((row) => ['multiple_choice', 'multi_select', 'true_false', 'yes_no', 'either_or'].includes(row.taskType)).length === 0 && (
                    <div className="border border-dashed border-zinc-200 px-3 py-4 text-xs text-zinc-500">No MCQ-style data in current selection.</div>
                  )}
                </div>
              </div>

              <div className="border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Mastery by Topic / Skill</div>
                <div className="mt-2 space-y-2">
                  {masteryBySkillRows.slice(0, 10).map((row) => (
                    <div key={row.skill} className="border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-700">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-zinc-900">{row.skill}</span>
                        <span>{row.mastery}%</span>
                      </div>
                      <div className="mt-1 h-2 w-full bg-zinc-100">
                        <div className="h-full bg-zinc-900" style={{ width: `${Math.max(2, row.mastery)}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-500">Attempts: {row.attempts} · Students: {row.studentCount}</div>
                    </div>
                  ))}
                  {masteryBySkillRows.length === 0 && <div className="border border-dashed border-zinc-200 px-3 py-4 text-xs text-zinc-500">No mastery data yet.</div>}
                </div>
              </div>

              <div className="border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Cohort Comparison</div>
                <div className="mt-2 space-y-2">
                  {cohortRows.map((row) => (
                    <div key={row.cohort} className="border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-700">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-zinc-900">{row.cohort}</span>
                        <span>{row.avgScore}%</span>
                      </div>
                      <div className="mt-1 h-2 w-full bg-zinc-100">
                        <div className="h-full bg-zinc-900" style={{ width: `${Math.max(2, row.avgScore)}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-500">Sessions: {row.count} · Late rate: {row.lateRate}%</div>
                    </div>
                  ))}
                  {cohortRows.length === 0 && <div className="border border-dashed border-zinc-200 px-3 py-4 text-xs text-zinc-500">No cohort segments for current filters.</div>}
                </div>
              </div>

              <div className="border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Trend Over Time</div>
                <div className="mt-2 space-y-2">
                  {trendRows.slice(-12).map((row) => (
                    <div key={row.day} className="border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-700">
                      <div className="flex items-center justify-between gap-2">
                        <span>{row.day}</span>
                        <span>{row.avgScore}%</span>
                      </div>
                      <div className="mt-1 h-2 w-full bg-zinc-100">
                        <div className="h-full bg-zinc-900" style={{ width: `${Math.max(2, row.avgScore)}%` }} />
                      </div>
                      <div className="mt-1 text-[11px] text-zinc-500">Sessions: {row.count}</div>
                    </div>
                  ))}
                  {trendRows.length === 0 && <div className="border border-dashed border-zinc-200 px-3 py-4 text-xs text-zinc-500">No time-series data for current filters.</div>}
                </div>
              </div>

              <div className="border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Percentile + Confidence Alignment</div>
                <div className="mt-2 border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-700">
                  Confidence vs performance correlation: <strong>{confidenceStats.correlation === null ? 'n/a' : confidenceStats.correlation.toFixed(2)}</strong>
                  <div className="mt-1 text-[11px] text-zinc-500">Samples: {confidenceStats.sampleSize}</div>
                </div>
                <div className="mt-2 space-y-1">
                  {percentileRows.slice(0, 8).map((entry) => (
                    <div key={`percentile-${entry.session.id}`} className="flex items-center justify-between gap-2 border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700">
                      <span>{displayStudentName(entry.session.studentName)}</span>
                      <span>{entry.session.score}% · P{entry.percentile} · {entry.band}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">At-Risk Watchlist</div>
              <div className="mt-2 space-y-2">
                {watchlistRows.map((entry) => (
                  <div key={`watch-${entry.session.id}`} className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{displayStudentName(entry.session.studentName)}</span>
                      <span>Risk {entry.riskScore} · Score {entry.session.score}% · P{entry.percentile}</span>
                    </div>
                    <div className="mt-1 text-[11px]">{entry.reasons.join(' · ')}</div>
                  </div>
                ))}
                {watchlistRows.length === 0 && <div className="border border-dashed border-zinc-200 px-3 py-4 text-xs text-zinc-500">No students currently match watchlist thresholds.</div>}
              </div>
            </div>
          </section>
        )}

        {view === 'board' && (
          <section className="border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Published board</div>
                <div className="mt-1 text-sm text-zinc-700">Share one lesson board with ranking and printable layout.</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 hover:border-zinc-900">
                  <ExportIcon />
                  Print
                </button>
                <button type="button" onClick={handleCreateBoardShare} disabled={boardShareState === 'creating'} className="inline-flex items-center gap-1 border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs text-white disabled:opacity-50">
                  <ExportIcon />
                  {boardShareState === 'creating' ? 'Creating...' : 'Publish'}
                </button>
                {boardShareLink && (
                  <button type="button" onClick={handleCopyBoardShareLink} className="inline-flex items-center gap-1 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 hover:border-zinc-900">
                    <CopyIcon />
                    Copy
                  </button>
                )}
              </div>
            </div>

            {boardShareLink && <input readOnly value={boardShareLink} className="mb-3 w-full border border-zinc-200 px-3 py-2 text-xs text-zinc-700" />}
            {boardShareState === 'empty' && <div className="mb-3 text-xs text-amber-700">No board data available for this lesson.</div>}
            {boardShareState === 'error' && <div className="mb-3 text-xs text-red-700">Failed to publish board link.</div>}
            {boardShareState === 'copied' && <div className="mb-3 text-xs text-emerald-700">Board link copied.</div>}
            {boardShareState === 'copy-error' && <div className="mb-3 text-xs text-amber-700">Clipboard unavailable. Copy manually.</div>}

            {board.rows.length === 0 || board.columns.length === 0 ? (
              <div className="border border-dashed border-zinc-200 px-4 py-5 text-sm text-zinc-500">No published board rows for current filters.</div>
            ) : (
              <div className="overflow-auto border border-zinc-200">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-zinc-50 text-left text-[11px] uppercase tracking-[0.12em] text-zinc-500">
                      <th className="sticky left-0 z-10 border-b border-r border-zinc-200 bg-zinc-50 px-3 py-2">Rank</th>
                      <th className="sticky left-[58px] z-10 border-b border-r border-zinc-200 bg-zinc-50 px-3 py-2">Student</th>
                      <th className="border-b border-r border-zinc-200 px-3 py-2">Score</th>
                      {board.columns.map((column) => (
                        <th key={column.id} className="min-w-[120px] border-b border-r border-zinc-200 px-3 py-2">
                          <div className="text-zinc-700" title={column.label}>{column.shortLabel || column.label}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {board.rows.map((row) => (
                      <tr key={row.sessionId} className="border-t border-zinc-200 align-top">
                        <td className="sticky left-0 z-10 border-r border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-900">#{row.rank}</td>
                        <td className="sticky left-[58px] z-10 border-r border-zinc-200 bg-white px-3 py-2 font-medium text-zinc-900">
                          <div className="flex flex-wrap items-center gap-1">
                            <span>{displayStudentName(row.studentName)}</span>
                            {row.isLateSubmission && <span className="border border-red-200 bg-red-50 px-1 py-0.5 text-[10px] uppercase tracking-[0.1em] text-red-700">Late</span>}
                          </div>
                        </td>
                        <td className="border-r border-zinc-200 px-3 py-2 text-zinc-700">{row.score}%</td>
                        {board.columns.map((column) => {
                          const cell = row.cellMap.get(column.id);
                          const tone = cell?.correct === true
                            ? 'bg-emerald-50 text-emerald-700'
                            : cell?.correct === false
                              ? 'bg-red-50 text-red-700'
                              : 'bg-zinc-50 text-zinc-500';
                          return (
                            <td key={`${row.sessionId}-${column.id}`} className={`border-r border-zinc-200 px-3 py-2 text-center text-xs ${tone}`}>
                              {cell ? `${cell.score}%` : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
