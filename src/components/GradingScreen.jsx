import { useCallback, useEffect, useRef, useMemo, useState } from 'react';
import { exportSession, printSessionReport, saveSession } from '../storage';
import { summarizeResults } from '../utils/grading';
import { syncSessionGradeToCloud } from '../utils/gradingCloud';
import { createResultShareLink } from '../utils/resultSharing';

const OFFLINE_SUBMISSION_QUEUE_KEY = 'lesson-flow-offline-submission-queue-v1';

function loadOfflineSubmissionQueue() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFLINE_SUBMISSION_QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOfflineSubmissionQueue(entries) {
  try {
    localStorage.setItem(OFFLINE_SUBMISSION_QUEUE_KEY, JSON.stringify((entries || []).slice(0, 200)));
  } catch {
    // Ignore local storage write failures and continue with in-memory flow.
  }
}

function statusTone(entry) {
  if (entry.correct === true) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (entry.correct === false) return entry.score > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800';
  return 'border-zinc-200 bg-zinc-50 text-zinc-700';
}

function getScoreBand(score) {
  if (score >= 90) return { label: 'Excellent', tone: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', message: 'Outstanding performance! You clearly understand this material.' };
  if (score >= 70) return { label: 'Good', tone: 'text-sky-700', bg: 'bg-sky-50 border-sky-200', message: 'Solid work — just a few areas to review for full mastery.' };
  if (score >= 50) return { label: 'Needs Practice', tone: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', message: 'You\'re getting there. Focus on the areas below to improve.' };
  return { label: 'Keep Trying', tone: 'text-red-700', bg: 'bg-red-50 border-red-200', message: 'Don\'t give up — review the mistakes below and try again.' };
}

function computeTakeaways(breakdown) {
  const strengths = [];
  const weaknesses = [];
  const mistakes = [];
  const categoryScores = new Map();

  for (const entry of breakdown) {
    if (entry.correct === null) continue;
    const cat = entry.taskType || 'other';
    if (!categoryScores.has(cat)) categoryScores.set(cat, { total: 0, earned: 0 });
    const bucket = categoryScores.get(cat);
    bucket.total += 1;
    bucket.earned += entry.score || 0;

    if (entry.correct === false) {
      mistakes.push({ label: entry.label, taskType: entry.taskType, feedback: entry.result?.feedback || null });
    }
  }

  for (const [cat, data] of categoryScores) {
    const avg = data.total > 0 ? data.earned / data.total : 0;
    if (avg >= 0.8) strengths.push(cat);
    else if (avg < 0.5) weaknesses.push(cat);
  }

  return { strengths, weaknesses, mistakes };
}

function summarizeStudentAnswer(result) {
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

function summarizeReferenceAnswer(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.join(' | ');
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return 'Reference answer available';
    }
  }
  return '';
}

function normalizeVisibilityPolicy(policy, isAssignmentMode) {
  const value = String(policy || '').trim();
  if (value === 'full_answers') return 'full_feedback';
  if (value) return value;
  return isAssignmentMode ? 'student_answers_only' : 'full_feedback';
}

function toCanonicalBreakdown(breakdown = []) {
  return breakdown.map((entry) => {
    const maxScore = Math.max(1, Number(entry?.points || entry?.maxScore || 1));
    const score = Number(entry?.score || 0);
    const safeResult = entry?.result && typeof entry.result === 'object' ? entry.result : {};
    const studentAnswerText = safeResult.studentAnswerText || summarizeStudentAnswer(safeResult);
    const correctAnswerText = safeResult.correctAnswerText || summarizeReferenceAnswer(safeResult.correctAnswer ?? safeResult.expectedAnswer ?? entry?.correctAnswer ?? null);
    return {
      ...entry,
      block_id: entry?.id || null,
      block_type: entry?.taskType || 'unknown',
      raw_response: safeResult?.response ?? null,
      student_answer_text: studentAnswerText,
      is_correct: typeof entry?.correct === 'boolean' ? entry.correct : null,
      max_score: maxScore,
      answered_at: safeResult?.answeredAt || null,
      result: {
        ...safeResult,
        studentAnswerText,
        correctAnswerText,
      },
      score,
    };
  });
}

export default function GradingScreen({ lesson, blocks, results, studentName, onStudentNameChange, onRestart, onExit, mode = 'default', allowRestart = true, sessionMeta = null, onSubmitted = null }) {
  const [saved, setSaved] = useState(false);
  const [cloudStatus, setCloudStatus] = useState('idle');
  const [cloudMessage, setCloudMessage] = useState('');
  const [queuedSubmissionCount, setQueuedSubmissionCount] = useState(() => loadOfflineSubmissionQueue().length);
  const [replayMessage, setReplayMessage] = useState('');
  const [expandedTasks, setExpandedTasks] = useState(() => new Set());
  const [resultShareLink, setResultShareLink] = useState('');
  const [resultShareState, setResultShareState] = useState('idle');
  const replayInFlightRef = useRef(false);
  const isAssignmentMode = mode === 'assignment' || mode === 'homework';
  const lessonSettings = lesson?.settings || {};
  const visibilityPolicy = normalizeVisibilityPolicy(lessonSettings.visibilityPolicy, isAssignmentMode);
  const enableGrading = lessonSettings.enableGrading !== false;
  const showTotalGrade = enableGrading && lessonSettings.showTotalGrade !== false;
  const showPerQuestionGrade = enableGrading && lessonSettings.showPerQuestionGrade !== false;
  const showCorrectness = visibilityPolicy !== 'student_answers_only';
  const showStudentAnswers = visibilityPolicy === 'student_answers_only' || visibilityPolicy === 'full_feedback';
  const showCorrectAnswers = visibilityPolicy === 'show_correct_answers' || visibilityPolicy === 'full_feedback';
  const showFeedback = visibilityPolicy === 'full_feedback';
  const safeBlocks = Array.isArray(blocks) ? blocks.filter(Boolean) : [];
  const summary = useMemo(() => summarizeResults(safeBlocks, results), [safeBlocks, results]);
  const canonicalBreakdown = useMemo(() => toCanonicalBreakdown(summary.breakdown), [summary.breakdown]);
  const takeaways = useMemo(() => computeTakeaways(summary.breakdown), [summary.breakdown]);
  const scoreBand = useMemo(() => {
    if (!showTotalGrade) {
      return {
        label: 'Submission received',
        tone: 'text-zinc-700',
        bg: 'bg-zinc-50 border-zinc-200',
        message: 'This assignment hides total scores. Your teacher can still review your submission.',
      };
    }
    return getScoreBand(summary.score);
  }, [showTotalGrade, summary.score]);
  const shouldCollapseByDefault = summary.breakdown.length > 10;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;

  const sessionPayload = {
    lessonId: lesson?.id || 'unknown-lesson',
    lessonTitle: lesson?.title || 'Untitled Lesson',
    studentName,
    score: summary.score,
    earned: summary.earned,
    total: summary.total,
    completedCount: summary.breakdown.filter((entry) => entry.result).length,
    correctCount: summary.breakdown.filter((entry) => entry.correct === true).length,
    incorrectCount: summary.breakdown.filter((entry) => entry.correct === false).length,
    breakdown: canonicalBreakdown,
    lessonPreview: lesson?.dsl || lesson?.blocks?.map((block) => block.title || block.question || block.instruction || '').find(Boolean) || '',
    mode,
    origin: sessionMeta?.origin || (mode === 'assignment' ? 'homework' : mode === 'practice' ? 'practice' : mode === 'live' ? 'live' : 'local'),
    sourceType: sessionMeta?.origin || (mode === 'assignment' ? 'homework' : mode === 'practice' ? 'practice' : mode === 'live' ? 'live' : 'local'),
    interaction: {
      tabLeaves: Number(sessionMeta?.tabLeaves || 0),
      tabReturns: Number(sessionMeta?.tabReturns || 0),
      blurCount: Number(sessionMeta?.blurCount || 0),
      focusCount: Number(sessionMeta?.focusCount || 0),
      lastTabLeftAt: sessionMeta?.lastTabLeftAt || null,
      answerTimeline: Array.isArray(sessionMeta?.answerTimeline) ? sessionMeta.answerTimeline : [],
      events: Array.isArray(sessionMeta?.events) ? sessionMeta.events : [],
      startedAt: sessionMeta?.startedAt || null,
    },
    assignmentId: sessionMeta?.assignmentId || null,
    submissionId: sessionMeta?.submissionId || null,
    submissionState: summary.breakdown.some((entry) => entry.correct === null) ? 'awaiting_review' : 'graded',
    timestamp: Number(sessionMeta?.timestamp || 0),
  };
  const completionPercent = Math.round((sessionPayload.completedCount / Math.max(summary.breakdown.length, 1)) * 100);
  const primaryPercent = showTotalGrade ? summary.score : completionPercent;
  const dashOffset = circumference - (primaryPercent / 100) * circumference;

  const runExternalSubmission = useCallback(async (payload) => {
    if (typeof onSubmitted !== 'function') return { ok: true, skipped: true };
    try {
      const result = await onSubmitted(payload);
      if (result && typeof result === 'object' && result.ok === false) {
        return { ok: false, reason: result.reason || 'submission_failed' };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: error?.message || 'submission_failed' };
    }
  }, [onSubmitted]);

  const queueSubmissionForReplay = useCallback((payload, reason = 'offline') => {
    const queue = loadOfflineSubmissionQueue();
    const fingerprint = `${payload?.assignmentId || ''}:${payload?.studentName || ''}:${payload?.timestamp || Date.now()}`;
    if (!queue.some((entry) => entry.fingerprint === fingerprint)) {
      queue.unshift({
        id: crypto.randomUUID(),
        fingerprint,
        queuedAt: Date.now(),
        reason,
        attempts: 0,
        payload,
      });
      saveOfflineSubmissionQueue(queue);
    }
    setQueuedSubmissionCount(queue.length);
  }, []);

  const flushQueuedSubmissions = useCallback(async () => {
    if (replayInFlightRef.current) return;
    if (typeof onSubmitted !== 'function') return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const queue = loadOfflineSubmissionQueue();
    if (queue.length === 0) {
      setQueuedSubmissionCount(0);
      return;
    }

    replayInFlightRef.current = true;
    let replayedCount = 0;
    const remaining = [];

    for (const entry of queue) {
      const submitResult = await runExternalSubmission(entry.payload);
      if (submitResult.ok) {
        replayedCount += 1;
      } else {
        remaining.push({
          ...entry,
          attempts: Number(entry.attempts || 0) + 1,
          lastError: submitResult.reason || 'submission_failed',
        });
      }
    }

    saveOfflineSubmissionQueue(remaining);
    setQueuedSubmissionCount(remaining.length);
    if (replayedCount > 0) {
      setReplayMessage(`Replayed ${replayedCount} queued submission${replayedCount === 1 ? '' : 's'}.`);
    } else if (remaining.length > 0) {
      setReplayMessage(`Replay pending: ${remaining.length} submission${remaining.length === 1 ? '' : 's'} still queued.`);
    }
    replayInFlightRef.current = false;
  }, [onSubmitted, runExternalSubmission]);

  useEffect(() => {
    setQueuedSubmissionCount(loadOfflineSubmissionQueue().length);
    if (typeof onSubmitted !== 'function') return undefined;

    const handleOnline = () => {
      void flushQueuedSubmissions();
    };

    window.addEventListener('online', handleOnline);
    void flushQueuedSubmissions();

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [flushQueuedSubmissions, onSubmitted]);

  const handleSaveSession = async () => {
    const submittedAt = Date.now();
    const savedSession = saveSession({
      ...sessionPayload,
      timestamp: submittedAt,
      interaction: {
        ...(sessionPayload.interaction || {}),
        submittedAt,
        events: [
          ...((sessionPayload.interaction && Array.isArray(sessionPayload.interaction.events)) ? sessionPayload.interaction.events : []),
          { type: 'submitted', at: submittedAt },
        ],
      },
    });
    setSaved(true);
    setCloudStatus('syncing');
    setCloudMessage('Saved locally. Syncing grading data to cloud...');

    const result = await syncSessionGradeToCloud(savedSession);

    if (typeof onSubmitted === 'function') {
      const submitResult = await runExternalSubmission(savedSession);
      if (!submitResult.ok) {
        queueSubmissionForReplay(savedSession, submitResult.reason || 'submission_failed');
        setReplayMessage('Submission queued for replay when connection is restored.');
      }
    }
    if (result.state === 'synced') {
      setCloudStatus('synced');
      setCloudMessage('Saved locally and synced to cloud.');
      return;
    }

    if (result.state === 'unavailable') {
      setCloudStatus('local-only');
      setCloudMessage(`Saved locally (${result.reason || 'cloud unavailable'}).`);
      return;
    }

    setCloudStatus('error');
    setCloudMessage(`Saved locally. Cloud sync failed: ${result.reason || 'unknown error'}.`);
  };

  const handleCreateResultShare = async () => {
    setResultShareState('creating');
    const result = await createResultShareLink(sessionPayload, sessionMeta?.submissionId || null);
    if (!result.ok) {
      setResultShareState('error');
      return;
    }
    setResultShareLink(result.shareUrl || '');
    setResultShareState('ready');
  };

  const toggleExpanded = (entryId) => {
    setExpandedTasks((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedTasks(new Set(summary.breakdown.map((entry) => entry.id)));
  };

  const collapseAll = () => {
    setExpandedTasks(new Set());
  };

  return (
    <div className="min-h-screen bg-[#f7f7f5] px-4 py-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <section className="rounded-[28px] border border-zinc-200 bg-white p-4 md:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">Final report</div>
          <h1 className="mt-3 text-3xl font-semibold text-zinc-950">{lesson?.title || 'Lesson complete'}</h1>
          <div className="mt-6 flex justify-center">
            <div className="relative flex h-36 w-36 items-center justify-center">
              <svg width="136" height="136" className="-rotate-90" role="img" aria-label={`Score: ${summary.score}%`}>
                <circle cx="68" cy="68" r={radius} fill="none" stroke="#e4e4e7" strokeWidth="10" />
                <circle cx="68" cy="68" r={radius} fill="none" stroke="#111111" strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} style={{ transition: 'stroke-dashoffset 400ms ease' }} />
              </svg>
              <div className="absolute text-center">
                <div className="text-3xl font-semibold text-zinc-950">{primaryPercent}%</div>
                <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">{showTotalGrade ? 'Score' : 'Completion'}</div>
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Correct</div>
              <div className="mt-1 text-xl font-semibold text-zinc-950">{sessionPayload.correctCount}</div>
            </div>
            <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Reviewed</div>
              <div className="mt-1 text-xl font-semibold text-zinc-950">{sessionPayload.completedCount}</div>
            </div>
            <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Graded</div>
              <div className="mt-1 text-xl font-semibold text-zinc-950">{showTotalGrade ? summary.total : 'Off'}</div>
            </div>
          </div>
          <div className="mt-6 border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Session</div>
            {lesson?.settings?.allowSessionSave === false && !isAssignmentMode ? (
              <div className="mt-3 text-xs text-zinc-400">Session saving is disabled for this lesson.</div>
            ) : (
              <>
                <label className="mt-3 block space-y-2">
                  <span className="text-sm text-zinc-700">Student name</span>
                  <input value={studentName} onChange={(event) => onStudentNameChange(event.target.value)} placeholder="Enter student name" className="w-full border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
                </label>
                <div className="mt-4 grid gap-3">
                  <button type="button" disabled={saved} onClick={handleSaveSession} className={`border px-4 py-3 text-sm font-medium transition ${saved ? 'border-emerald-300 bg-emerald-50 text-emerald-700 cursor-default' : 'border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800'}`}>{saved ? (isAssignmentMode ? 'Submitted ✓' : 'Saved ✓') : (isAssignmentMode ? 'Submit assignment' : 'Save session')}</button>
                  <button type="button" onClick={() => exportSession(sessionPayload)} className="border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">Export JSON</button>
                  <button type="button" onClick={() => printSessionReport(sessionPayload, { visibilityPolicy, showTotalGrade, showPerQuestionGrade })} className="border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">Print / PDF</button>
                  <button type="button" onClick={handleCreateResultShare} disabled={!saved || resultShareState === 'creating'} className="border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50">{resultShareState === 'creating' ? 'Creating share link...' : 'Create result share link'}</button>
                </div>
                {saved && <div className="mt-3 text-sm text-emerald-700">Session saved locally.</div>}
                {saved && sessionPayload.submissionState === 'awaiting_review' && (
                  <div className="mt-1 text-xs text-amber-700">Submission saved as awaiting review.</div>
                )}
                {saved && cloudStatus !== 'idle' && (
                  <div className={`mt-2 text-xs ${cloudStatus === 'synced' ? 'text-emerald-700' : cloudStatus === 'syncing' ? 'text-zinc-500' : cloudStatus === 'error' ? 'text-red-600' : 'text-zinc-500'}`}>
                    {cloudMessage}
                  </div>
                )}
                {queuedSubmissionCount > 0 && (
                  <div className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <div>Offline submission queue: {queuedSubmissionCount} pending replay.</div>
                    <button type="button" onClick={() => void flushQueuedSubmissions()} className="mt-1 border border-amber-300 bg-white px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-amber-800">Replay now</button>
                  </div>
                )}
                {replayMessage && <div className="mt-2 text-xs text-zinc-500">{replayMessage}</div>}
                {resultShareLink && (
                  <div className="mt-2 space-y-1">
                    <div className="text-[11px] text-zinc-500">Result share link</div>
                    <input readOnly value={resultShareLink} className="w-full border border-zinc-200 px-3 py-2 text-xs text-zinc-700 outline-none" />
                  </div>
                )}
              </>
            )}
          </div>
          <div className="mt-6 grid gap-3">
            {allowRestart && (
              <button type="button" onClick={onRestart} className="border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">Try again</button>
            )}
            <button type="button" onClick={onExit} className="border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800">Back to lessons</button>
          </div>
        </section>
        <section className="rounded-[28px] border border-zinc-200 bg-white p-4 md:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          {/* Key Takeaways */}
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">Key Takeaways</div>
          <div className={`mt-3 border p-4 ${scoreBand.bg}`}>
            <div className="flex items-center justify-between gap-3">
              <div className={`text-lg font-semibold ${scoreBand.tone}`}>{scoreBand.label}</div>
              <div className={`border border-current px-3 py-1 text-xs font-medium ${scoreBand.tone}`}>{summary.score}%</div>
            </div>
            <div className={`mt-2 text-sm ${scoreBand.tone}`}>{scoreBand.message}</div>
          </div>

          {showTotalGrade && takeaways.strengths.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-600">Strengths</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {takeaways.strengths.map((cat) => (
                  <span key={cat} className="border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">{cat}</span>
                ))}
              </div>
            </div>
          )}

          {showTotalGrade && takeaways.weaknesses.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-amber-600">Areas for Improvement</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {takeaways.weaknesses.map((cat) => (
                  <span key={cat} className="border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">{cat}</span>
                ))}
              </div>
            </div>
          )}

          {showTotalGrade && takeaways.mistakes.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-red-600">Mistakes to Review</div>
              <div className="mt-2 space-y-2">
                {takeaways.mistakes.slice(0, 5).map((m, i) => (
                  <div key={i} className="border border-red-200 bg-red-50 px-3 py-2">
                    <div className="text-xs font-medium text-red-800">{m.label}</div>
                    {m.feedback && <div className="mt-1 text-[11px] text-red-600">{m.feedback}</div>}
                  </div>
                ))}
                {takeaways.mistakes.length > 5 && (
                  <div className="text-[11px] text-zinc-500">+{takeaways.mistakes.length - 5} more — see breakdown below</div>
                )}
              </div>
            </div>
          )}

          {(showTotalGrade && takeaways.strengths.length === 0 && takeaways.weaknesses.length === 0 && takeaways.mistakes.length === 0) && (
            <div className="mt-4 border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-500">Complete more tasks to see detailed takeaways.</div>
          )}
          {!showTotalGrade && (
            <div className="mt-4 border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-500">Detailed score insights are disabled for this assignment.</div>
          )}
        </section>

        <section className="rounded-[28px] border border-zinc-200 bg-white p-4 md:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">Breakdown</div>
              <h2 className="mt-1 text-2xl font-semibold text-zinc-950">Per-task results</h2>
            </div>
            <div className="flex items-center gap-2">
              {shouldCollapseByDefault && (
                <>
                  <button type="button" onClick={expandAll} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:border-zinc-900">Expand all</button>
                  <button type="button" onClick={collapseAll} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:border-zinc-900">Collapse all</button>
                </>
              )}
              <div className="rounded-full border border-zinc-200 px-3 py-2 text-xs text-zinc-500">
                {showTotalGrade ? `${summary.earned} / ${summary.total} graded correct` : `${sessionPayload.completedCount} submitted tasks`}
              </div>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {summary.breakdown.length === 0 && <div className="border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500">No gradable tasks were completed. This lesson ended safely and the session can still be saved or restarted.</div>}
            {summary.breakdown.map((entry) => {
              const expanded = !shouldCollapseByDefault || expandedTasks.has(entry.id);
              return (
                <div key={entry.id} className={`border ${statusTone(entry)}`}>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(entry.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.18em] opacity-70">{entry.taskType}</div>
                      <div className="mt-1 text-sm font-medium">{entry.label}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {showPerQuestionGrade && showCorrectness && (
                        <div className="rounded-full border border-current px-3 py-1 text-xs">{Math.round((entry.score || 0) * 100)}%</div>
                      )}
                      <span className="text-xs opacity-70">{expanded ? 'Hide' : 'Show'}</span>
                    </div>
                  </button>
                  {expanded && (
                    <div className="border-t border-current/20 px-4 pb-4 pt-2">
                      {visibilityPolicy === 'correctness_only' && (
                        <div className="text-xs opacity-75">{entry.correct === true ? 'Correct' : entry.correct === false ? 'Incorrect' : 'Submitted'}</div>
                      )}
                      {visibilityPolicy !== 'correctness_only' && (
                        <>
                          {showStudentAnswers && (
                            <div className="text-xs opacity-80">
                              <span className="font-medium">Student answer:</span> {entry.result?.studentAnswerText || 'No answer submitted'}
                            </div>
                          )}
                          {showCorrectAnswers && entry.result?.correctAnswerText && (
                            <div className="text-xs opacity-80">
                              <span className="font-medium">Correct answer:</span> {entry.result.correctAnswerText}
                            </div>
                          )}
                          {showCorrectness && !showFeedback && (
                            <div className="text-xs opacity-75">{entry.correct === true ? 'Correct' : entry.correct === false ? 'Incorrect' : 'Submitted'}</div>
                          )}
                          {showFeedback && (
                            entry.result?.feedback
                              ? <div className="text-xs opacity-75">{entry.result.feedback}</div>
                              : <div className="text-xs opacity-60">No additional feedback.</div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
