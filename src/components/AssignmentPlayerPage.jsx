import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LessonPlayer from './LessonPlayer';
import { fetchAssignmentById, hasLocalAssignmentAttempt, submitAssignmentResult } from '../utils/lessonAssignments';

export default function AssignmentPlayerPage() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [assignment, setAssignment] = useState(null);
  const [studentName, setStudentName] = useState('');
  const [started, setStarted] = useState(false);
  const [submitState, setSubmitState] = useState('idle');
  const [submitMessage, setSubmitMessage] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      const result = await fetchAssignmentById(assignmentId);
      if (!active) return;
      if (!result.ok) {
        setAssignment(null);
        setError(result.reason || 'Failed to load assignment');
        setLoading(false);
        return;
      }
      setAssignment(result.assignment);
      setLoading(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, [assignmentId]);

  const attemptBlocked = useMemo(() => {
    if (!assignment?.oneAttemptOnly && Number(assignment?.maxAttempts || 1) > 1) return false;
    if (!studentName.trim()) return false;
    return hasLocalAssignmentAttempt(assignment.assignmentId, studentName.trim());
  }, [assignment, studentName]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-6">
        <div className="w-full max-w-md border border-zinc-200 bg-white p-6 overflow-guard">
          <div className="mb-3 h-4 w-32 animate-pulse bg-zinc-200" />
          <div className="mb-2 h-3 w-full animate-pulse bg-zinc-100" />
          <div className="mb-2 h-3 w-5/6 animate-pulse bg-zinc-100" />
          <div className="h-10 w-full animate-pulse border border-zinc-200 bg-zinc-50" />
          <div className="mt-3 text-xs text-zinc-500">Loading assignment…</div>
        </div>
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-6">
        <div className="w-full max-w-lg border border-zinc-200 bg-white p-8 text-center">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Assignment unavailable</div>
          <div className="mt-3 text-lg font-semibold text-zinc-950">This assignment link cannot be opened</div>
          <div className="mt-2 text-sm text-zinc-500">{error || 'The assignment may be expired or disabled.'}</div>
          <button type="button" onClick={() => navigate('/')} className="mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white">Close</button>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-6">
        <div className="w-full max-w-lg border border-zinc-200 bg-white p-8">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Homework assignment</div>
          <div className="mt-2 text-2xl font-semibold text-zinc-950">{assignment.lesson?.title || 'Untitled lesson'}</div>
          <div className="mt-2 text-sm text-zinc-500">
            Enter your name to start.
            {assignment.oneAttemptOnly ? ' This assignment uses one-attempt mode.' : ` Up to ${assignment.maxAttempts || 1} attempts are allowed.`}
            {assignment.allowRetry ? ' Task retries are enabled.' : ' Task retries are disabled.'}
            {assignment.disableBackNavigation ? ' Back navigation is disabled.' : ''}
            {assignment.sessionTimeLimitMinutes ? ` Time limit: ${assignment.sessionTimeLimitMinutes} minute${assignment.sessionTimeLimitMinutes === 1 ? '' : 's'}.` : ''}
          </div>
          <div className="mt-3 grid gap-1 text-[11px] text-zinc-600 sm:grid-cols-2">
            <div className="border border-zinc-200 bg-zinc-50 px-2 py-1">Attempts: {assignment.maxAttempts || 1}</div>
            <div className="border border-zinc-200 bg-zinc-50 px-2 py-1">Retry cooldown: {assignment.retryCooldownSeconds || 0}s</div>
            <div className="border border-zinc-200 bg-zinc-50 px-2 py-1">Question randomization: {assignment.randomizeQuestions ? 'On' : 'Off'}</div>
            <div className="border border-zinc-200 bg-zinc-50 px-2 py-1">Option randomization: {assignment.randomizeOptions ? 'On' : 'Off'}</div>
            <div className="border border-zinc-200 bg-zinc-50 px-2 py-1">Copy/paste restriction: {assignment.copyPasteRestricted ? 'On' : 'Off'}</div>
            <div className="border border-zinc-200 bg-zinc-50 px-2 py-1">Tab-switch threshold: {assignment.suspiciousTabSwitchThreshold || 6}</div>
          </div>
          {assignment.showCheckButton === false && (
            <div className="mt-2 text-xs text-zinc-500">Check button is disabled for this assignment. Use save and submit flow.</div>
          )}

          <label className="mt-4 block space-y-2">
            <span className="text-xs text-zinc-600">Student name</span>
            <input
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              placeholder="Your name"
              className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
            />
          </label>

          {attemptBlocked && (
            <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              This device already submitted an attempt for this assignment and name.
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              disabled={!studentName.trim() || attemptBlocked}
              onClick={() => {
                setSubmitState('idle');
                setSubmitMessage('');
                setStarted(true);
              }}
              className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Start assignment
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {submitState !== 'idle' && (
        <div className="fixed left-4 top-4 z-40 border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700">
          Submission: {submitState}{submitMessage ? ` - ${submitMessage}` : ''}
        </div>
      )}
      <LessonPlayer
        lesson={assignment.lesson}
        mode="assignment"
        sessionMeta={{
          assignmentId: assignment.assignmentId,
          origin: 'homework',
          allowRetry: assignment.allowRetry,
          allowRestart: false,
          requireRequiredTasks: true,
          visibilityPolicy: assignment.visibilityPolicy,
          showCheckButton: assignment.showCheckButton,
          enableGrading: assignment.enableGrading,
          showTotalGrade: assignment.showTotalGrade,
          showPerQuestionGrade: assignment.showPerQuestionGrade,
          disableBackNavigation: assignment.disableBackNavigation,
          sessionTimeLimitMinutes: assignment.sessionTimeLimitMinutes,
          maxAttempts: assignment.maxAttempts,
          retryCooldownSeconds: assignment.retryCooldownSeconds,
          randomizeQuestions: assignment.randomizeQuestions,
          randomizeOptions: assignment.randomizeOptions,
          lockOnTimeout: assignment.lockOnTimeout,
          bindAttemptToDevice: assignment.bindAttemptToDevice,
          suspiciousTabSwitchThreshold: assignment.suspiciousTabSwitchThreshold,
          copyPasteRestricted: assignment.copyPasteRestricted,
          gracePeriodSeconds: assignment.gracePeriodSeconds,
          expiresAt: assignment.expiresAt,
          randomSeed: `${assignment.assignmentId || 'assignment'}:${studentName.trim().toLowerCase()}`,
        }}
        onExit={() => navigate('/')}
        onSubmitted={async (sessionPayload) => {
          setSubmitState('submitting');
          setSubmitMessage('');
          const submitResult = await submitAssignmentResult({
            assignmentId: assignment.assignmentId,
            studentName: studentName.trim(),
            sessionPayload: {
              ...sessionPayload,
              studentName: studentName.trim(),
            },
          });
          setSubmitState(submitResult.ok ? 'submitted' : 'error');
          if (!submitResult.ok) {
            const reason = submitResult.reason || 'submit_failed';
            const readable = reason === 'attempt_limit_reached'
              ? 'Attempt limit reached.'
              : reason === 'cooldown_active'
                ? 'Cooldown active before retry.'
                : reason === 'device_binding_mismatch'
                  ? 'This assignment is bound to another device.'
                  : reason === 'expired'
                    ? 'Assignment window is closed.'
                    : reason;
            setSubmitMessage(readable);
            throw new Error(readable);
          }
          setSubmitMessage('Saved successfully.');
          return submitResult;
        }}
      />
    </div>
  );
}
