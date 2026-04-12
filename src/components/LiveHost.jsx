import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LessonStage from './LessonStage';
import QuickPulse from './QuickPulse';
import SessionWarmth from './SessionWarmth';
import { getBlockLabel, getTaskBlocks, getTaskPoints, isGradableTask, validateLessonStructure } from '../utils/lesson';
import { recordDebugEvent } from '../utils/debug';
import { normalizeScore } from '../utils/grading';
import { buildLiveJoinUrl, buildLiveQrUrl, createLiveSessionId, getLiveSessionIdFromSearch, getLiveTransportLabel, supportsConfiguredLiveTransport } from '../utils/liveTransport';
import { createLiveChannel } from '../utils/liveChannel';
import { deleteManualScores, fetchManualScores, fetchSessionResponses, persistManualScore } from '../utils/liveSupabaseData';
import { ensureSession } from '../utils/accountAuth';
import { saveSession } from '../storage';
import { syncSessionGradeToCloud } from '../utils/gradingCloud';
import { useAppDialogs } from '../context/DialogContext';

const PHASE = { LOBBY: 'lobby', RUNNING: 'running', FINISHED: 'finished' };
const AUTO_ADVANCE_POLICY = {
  TIMER: 'timer',
  ALL_SUBMITTED: 'all_submitted',
  SUBMISSION_THRESHOLD: 'submission_threshold',
};
const LIVE_PACE_MODE = {
  TEACHER_LED: 'teacher_led',
  STUDENT_PACED: 'student_paced',
  HYBRID: 'hybrid',
};

function normalizeAutoAdvancePolicy(value) {
  const policy = String(value || '').trim().toLowerCase();
  if (Object.values(AUTO_ADVANCE_POLICY).includes(policy)) return policy;
  return AUTO_ADVANCE_POLICY.TIMER;
}

function clampSubmissionPercent(value, fallback = 70) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(100, Math.round(numeric)));
}

function toPositiveInt(value, fallback = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.round(numeric);
}

function normalizeLivePaceMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === LIVE_PACE_MODE.STUDENT_PACED || mode === LIVE_PACE_MODE.HYBRID || mode === LIVE_PACE_MODE.TEACHER_LED) {
    return mode;
  }
  return LIVE_PACE_MODE.TEACHER_LED;
}

function clampGroupCount(value, fallback = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(2, Math.min(8, Math.round(numeric)));
}

function clampCaptainRotation(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(1, Math.min(10, Math.round(numeric)));
}

function normalizeAnswerForBucket(answer) {
  if (answer === null || answer === undefined || answer === '') return '(empty)';
  if (typeof answer === 'string' || typeof answer === 'number' || typeof answer === 'boolean') return String(answer);
  try {
    return JSON.stringify(answer);
  } catch {
    return String(answer);
  }
}

function formatSecondsToClock(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function LiveHost({ lesson, onExit }) {
  const { confirm, prompt } = useAppDialogs();
  const hostPlayerId = useMemo(() => {
    let stored = '';
    try {
      stored = sessionStorage.getItem('lf_live_host_pid') || '';
    } catch {
      // Ignore session storage read failures.
    }
    if (stored) return stored;
    const created = crypto.randomUUID();
    try {
      sessionStorage.setItem('lf_live_host_pid', created);
    } catch {
      // Ignore session storage write failures.
    }
    return created;
  }, []);

  const sessionId = useMemo(() => {
    const fromUrl = typeof window !== 'undefined' ? getLiveSessionIdFromSearch(window.location.search) : '';
    return fromUrl || createLiveSessionId();
  }, []);
  const pin = sessionId;
  const validation = useMemo(() => validateLessonStructure(lesson), [lesson]);
  const channelRef = useRef(null);
  const stateRef = useRef({
    phase: PHASE.LOBBY,
    currentIndex: 0,
    lessonPayload: null,
    participantCount: 0,
    autoModeRemainingSeconds: null,
    questionDeadlineRemainingSeconds: null,
    paceMode: LIVE_PACE_MODE.TEACHER_LED,
    teamAssignments: {},
    captainsByTeam: {},
    spotlight: null,
  });
  const hasPersistedLiveResultsRef = useRef(false);
  const finishSessionRef = useRef(null);

  const blocks = validation.blocks;
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const [liveSettings, setLiveSettings] = useState(() => ({
    allowRetry: lesson?.settings?.allowRetryLive === true,
    showCheckButton: lesson?.settings?.showCheckButtonLive === true,
    lockAfterSubmit: lesson?.settings?.lockAfterSubmitLive !== false,
    hideQuestionContent: lesson?.settings?.hideQuestionContentLive === true,
    autoAdvanceSeconds: Number(lesson?.settings?.liveAutoAdvanceSeconds) > 0 ? Number(lesson.settings.liveAutoAdvanceSeconds) : null,
    autoAdvancePolicy: normalizeAutoAdvancePolicy(lesson?.settings?.liveAutoAdvancePolicy),
    autoAdvanceSubmissionThreshold: clampSubmissionPercent(lesson?.settings?.liveAutoAdvanceSubmissionThreshold, 70),
    questionResponseDeadlineSeconds: toPositiveInt(lesson?.settings?.liveQuestionResponseDeadlineSeconds, null),
    autoModeTimeLimitMinutes: Number(lesson?.settings?.liveAutoModeTimeLimitMinutes) > 0 ? Number(lesson.settings.liveAutoModeTimeLimitMinutes) : null,
    showLeaderboardEachQuestion: lesson?.settings?.showLeaderboardEachQuestionLive === true,
    paceMode: normalizeLivePaceMode(lesson?.settings?.livePaceMode),
    groupModeEnabled: lesson?.settings?.liveGroupModeEnabled === true,
    groupCount: clampGroupCount(lesson?.settings?.liveGroupCount, 2),
    captainRotationEvery: clampCaptainRotation(lesson?.settings?.liveCaptainRotationEvery, 1),
    balanceEnabled: lesson?.settings?.liveBalanceEnabled === true,
    balanceStartCredits: Number(lesson?.settings?.liveBalanceStartCredits) > 0 ? Number(lesson.settings.liveBalanceStartCredits) : 100,
    balanceCorrectReward: Number(lesson?.settings?.liveBalanceCorrectReward) > 0 ? Number(lesson.settings.liveBalanceCorrectReward) : 10,
    balanceWrongPenalty: Number(lesson?.settings?.liveBalanceWrongPenalty) > 0 ? Number(lesson.settings.liveBalanceWrongPenalty) : 5,
    balanceAllowNegative: lesson?.settings?.liveBalanceAllowNegative !== false,
    privacyMode: lesson?.settings?.livePrivacyMode === true,
  }));
  const [autoAdvanceRemaining, setAutoAdvanceRemaining] = useState(null);
  const [autoModeRemainingSeconds, setAutoModeRemainingSeconds] = useState(null);
  const [autoAdvancePaused, setAutoAdvancePaused] = useState(false);
  const [questionDeadlineRemainingSeconds, setQuestionDeadlineRemainingSeconds] = useState(null);
  const [skipAuditTrail, setSkipAuditTrail] = useState([]);
  const [reopenAuditTrail, setReopenAuditTrail] = useState([]);
  const [spotlightAuditTrail, setSpotlightAuditTrail] = useState([]);
  const [spotlight, setSpotlight] = useState(null);
  const [showBasicSettings, setShowBasicSettings] = useState(true);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showRunningOverflow, setShowRunningOverflow] = useState(false);
  const [showQuickPulse, setShowQuickPulse] = useState(false);
  const [pulseVotes, setPulseVotes] = useState({});

  const lessonPayload = useMemo(() => ({
    id: lesson?.id || 'live-lesson',
    title: lesson?.title || 'Live Lesson',
    settings: {
      ...(lesson?.settings || {}),
      allowRetryLive: liveSettings.allowRetry,
      showCheckButtonLive: liveSettings.showCheckButton,
      lockAfterSubmitLive: liveSettings.lockAfterSubmit,
      hideQuestionContentLive: liveSettings.hideQuestionContent,
      liveAutoAdvanceSeconds: liveSettings.autoAdvanceSeconds,
      liveAutoAdvancePolicy: liveSettings.autoAdvancePolicy,
      liveAutoAdvanceSubmissionThreshold: liveSettings.autoAdvanceSubmissionThreshold,
      liveQuestionResponseDeadlineSeconds: liveSettings.questionResponseDeadlineSeconds,
      liveAutoModeTimeLimitMinutes: liveSettings.autoModeTimeLimitMinutes,
      showLeaderboardEachQuestionLive: liveSettings.showLeaderboardEachQuestion,
      livePaceMode: normalizeLivePaceMode(liveSettings.paceMode),
      liveGroupModeEnabled: liveSettings.groupModeEnabled === true,
      liveGroupCount: clampGroupCount(liveSettings.groupCount, 2),
      liveCaptainRotationEvery: clampCaptainRotation(liveSettings.captainRotationEvery, 1),
      liveBalanceEnabled: liveSettings.balanceEnabled === true,
      liveBalanceStartCredits: liveSettings.balanceStartCredits,
      liveBalanceCorrectReward: liveSettings.balanceCorrectReward,
      liveBalanceWrongPenalty: liveSettings.balanceWrongPenalty,
      liveBalanceAllowNegative: liveSettings.balanceAllowNegative,
      livePrivacyMode: liveSettings.privacyMode === true,
    },
    blocks,
  }), [blocks, lesson?.id, lesson?.settings, lesson?.title, liveSettings]);

  const [phase, setPhase] = useState(PHASE.LOBBY);
  const [students, setStudents] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewStudentId, setReviewStudentId] = useState('');
  const [hostTab, setHostTab] = useState('live');
  const [expandedStudentId, setExpandedStudentId] = useState('');
  const [manualPoints, setManualPoints] = useState({});
  const [transportStatus, setTransportStatus] = useState('connecting');
  const [transportMode, setTransportMode] = useState(() => (typeof window !== 'undefined' ? getLiveTransportLabel(window.location.search) : 'broadcast-local'));
  const [transportError, setTransportError] = useState('');
  const currentBlock = blocks[currentIndex] || null;
  const playerCount = Object.keys(students).length;
  const paceMode = normalizeLivePaceMode(liveSettings.paceMode);
  const teacherLedPace = paceMode === LIVE_PACE_MODE.TEACHER_LED;
  const hybridPace = paceMode === LIVE_PACE_MODE.HYBRID;
  const showPerQuestionLeaderboard = liveSettings.showLeaderboardEachQuestion && playerCount > 1;
  const autoAdvancePolicy = normalizeAutoAdvancePolicy(liveSettings.autoAdvancePolicy);
  const submissionThreshold = clampSubmissionPercent(liveSettings.autoAdvanceSubmissionThreshold, 70);
  const timerPolicyEnabled = teacherLedPace && autoAdvancePolicy === AUTO_ADVANCE_POLICY.TIMER && Number(liveSettings.autoAdvanceSeconds) > 0;
  const submissionPolicyEnabled = teacherLedPace && (autoAdvancePolicy === AUTO_ADVANCE_POLICY.ALL_SUBMITTED || autoAdvancePolicy === AUTO_ADVANCE_POLICY.SUBMISSION_THRESHOLD);
  const autoModeEnabled = timerPolicyEnabled || submissionPolicyEnabled;
  const questionDeadlineEnabled = teacherLedPace && toPositiveInt(liveSettings.questionResponseDeadlineSeconds, null) !== null;
  const hostFlowControlsEnabled = teacherLedPace && (autoModeEnabled || questionDeadlineEnabled);
  const teamAssignments = useMemo(() => {
    if (!liveSettings.groupModeEnabled) return {};
    const groupCount = clampGroupCount(liveSettings.groupCount, 2);
    const ordered = Object.entries(students)
      .sort((left, right) => (left[1]?.joinedAt || 0) - (right[1]?.joinedAt || 0))
      .map(([studentId]) => studentId);

    const next = {};
    ordered.forEach((studentId, index) => {
      const teamNumber = (index % groupCount) + 1;
      next[studentId] = `Team ${String(teamNumber).padStart(2, '0')}`;
    });
    return next;
  }, [liveSettings.groupCount, liveSettings.groupModeEnabled, students]);

  const captainsByTeam = useMemo(() => {
    if (!liveSettings.groupModeEnabled) return {};
    const teamMembers = new Map();
    Object.entries(teamAssignments).forEach(([studentId, teamName]) => {
      if (!teamMembers.has(teamName)) teamMembers.set(teamName, []);
      teamMembers.get(teamName).push(studentId);
    });

    const rotationEvery = clampCaptainRotation(liveSettings.captainRotationEvery, 1);
    const rotationStep = Math.floor(currentIndex / rotationEvery);
    const next = {};
    teamMembers.forEach((members, teamName) => {
      if (!Array.isArray(members) || members.length === 0) return;
      const captainIndex = rotationStep % members.length;
      next[teamName] = members[captainIndex];
    });
    return next;
  }, [currentIndex, liveSettings.captainRotationEvery, liveSettings.groupModeEnabled, teamAssignments]);

  const currentTaskResponses = useMemo(() => {
    if (!currentBlock || currentBlock.type !== 'task') return [];
    return Object.entries(students)
      .map(([studentId, student]) => {
        const result = student?.responses?.[currentBlock.id];
        if (!result) return null;
        const answer = result?.response ?? result?.answer ?? null;
        const submitted = result?.submitted === true || answer !== null;
        if (!submitted) return null;
        const teamName = teamAssignments[studentId] || null;
        const isCaptain = teamName ? captainsByTeam[teamName] === studentId : false;
        return {
          studentId,
          name: student?.name || 'Student',
          answer,
          correct: result?.correct,
          submittedAt: result?.timestamp || Date.now(),
          teamName,
          isCaptain,
        };
      })
      .filter(Boolean)
      .sort((left, right) => (right.submittedAt || 0) - (left.submittedAt || 0));
  }, [captainsByTeam, currentBlock, students, teamAssignments]);

  useEffect(() => {
    if (phase === PHASE.FINISHED) setHostTab('results');
  }, [phase]);

  const joinUrl = useMemo(() => buildLiveJoinUrl(sessionId), [sessionId]);
  const qrUrl = useMemo(() => buildLiveQrUrl(joinUrl), [joinUrl]);
  const allTaskBlocks = useMemo(() => getTaskBlocks(blocks), [blocks]);
  const gradableTasks = useMemo(() => getTaskBlocks(blocks).filter(isGradableTask), [blocks]);

  const updateStudent = useCallback((playerId, updater) => {
    setStudents((prev) => {
      const existing = prev[playerId] || {
        name: 'Student',
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        responses: {},
      };
      return {
        ...prev,
        [playerId]: updater(existing),
      };
    });
  }, []);

  useEffect(() => {
    stateRef.current = {
      phase,
      currentIndex,
      lessonPayload,
      participantCount: Object.keys(students).length,
      autoModeRemainingSeconds,
      questionDeadlineRemainingSeconds,
      paceMode,
      teamAssignments,
      captainsByTeam,
      spotlight,
    };
  }, [autoModeRemainingSeconds, captainsByTeam, currentIndex, lessonPayload, paceMode, phase, questionDeadlineRemainingSeconds, spotlight, students, teamAssignments]);

  const broadcast = useCallback((msg) => {
    channelRef.current?.postMessage(msg);
  }, []);

  const broadcastSnapshot = useCallback((nextPhase = phase, nextIndex = currentIndex) => {
    broadcast({
      type: 'sync',
      phase: nextPhase,
      currentIndex: nextIndex,
      lesson: lessonPayload,
      participantCount: Object.keys(students).length,
      autoModeRemainingSeconds,
      questionDeadlineRemainingSeconds,
      paceMode,
      teamAssignments,
      captainsByTeam,
      spotlight,
      timestamp: Date.now(),
    });
  }, [autoModeRemainingSeconds, broadcast, captainsByTeam, currentIndex, lessonPayload, paceMode, phase, questionDeadlineRemainingSeconds, spotlight, students, teamAssignments]);

  useEffect(() => {
    void ensureSession();
  }, []);

  useEffect(() => {
    const ch = createLiveChannel({
      sessionId,
      role: 'host',
      playerId: hostPlayerId,
      name: 'Host',
      onStatus: (next) => {
        if (next?.mode) setTransportMode(next.mode);
        if (next?.state) setTransportStatus(next.state);
        if (next?.error) setTransportError(next.error);
      },
    });

    if (!ch) return undefined;

    channelRef.current = ch;
    setTransportMode(ch.mode || transportMode);

    ch.onmessage = (e) => {
      const msg = e.data;
      if (msg?.sessionId && msg.sessionId !== sessionId) return;
      if (msg.type === 'join') {
        updateStudent(msg.playerId, (current) => {
          const next = {
            ...current,
            name: msg.name || current.name || 'Student',
            joinedAt: current.joinedAt || Date.now(),
            lastSeen: Date.now(),
          };
          recordDebugEvent('live_join', { pin, playerId: msg.playerId, name: msg.name, transport: transportMode });
          return next;
        });
        ch.postMessage({ type: 'join_ack', playerId: msg.playerId, sessionId, mode: transportMode, timestamp: Date.now() });
        const snapshot = stateRef.current;
        ch.postMessage({
          type: 'sync',
          sessionId,
          phase: snapshot.phase,
          currentIndex: snapshot.currentIndex,
          lesson: snapshot.lessonPayload,
          participantCount: snapshot.participantCount || 0,
          autoModeRemainingSeconds: snapshot.autoModeRemainingSeconds ?? null,
          questionDeadlineRemainingSeconds: snapshot.questionDeadlineRemainingSeconds ?? null,
          paceMode: snapshot.paceMode || LIVE_PACE_MODE.TEACHER_LED,
          teamAssignments: snapshot.teamAssignments || {},
          captainsByTeam: snapshot.captainsByTeam || {},
          spotlight: snapshot.spotlight || null,
          timestamp: Date.now(),
        });
      }
      if (msg.type === 'leave') {
        setStudents((prev) => {
          const next = { ...prev };
          delete next[msg.playerId];
          return next;
        });
      }
      if (msg.type === 'request_sync') {
        const snapshot = stateRef.current;
        ch.postMessage({
          type: 'sync',
          sessionId,
          playerId: hostPlayerId,
          phase: snapshot.phase,
          currentIndex: snapshot.currentIndex,
          lesson: snapshot.lessonPayload,
          participantCount: snapshot.participantCount || 0,
          autoModeRemainingSeconds: snapshot.autoModeRemainingSeconds ?? null,
          questionDeadlineRemainingSeconds: snapshot.questionDeadlineRemainingSeconds ?? null,
          paceMode: snapshot.paceMode || LIVE_PACE_MODE.TEACHER_LED,
          teamAssignments: snapshot.teamAssignments || {},
          captainsByTeam: snapshot.captainsByTeam || {},
          spotlight: snapshot.spotlight || null,
          timestamp: Date.now(),
        });
      }
      if (msg.type === 'student_heartbeat' && msg.playerId) {
        updateStudent(msg.playerId, (current) => ({ ...current, lastSeen: Date.now() }));
      }
      if (msg.type === 'response_update' && msg.playerId && msg.blockId) {
        const snapshot = stateRef.current;
        const snapshotBlockId = blocksRef.current[snapshot.currentIndex]?.id || null;
        const deadlineReached = Number(snapshot.questionDeadlineRemainingSeconds) === 0;
        if (deadlineReached && snapshot.phase === PHASE.RUNNING && snapshotBlockId && msg.blockId === snapshotBlockId) {
          ch.postMessage({
            type: 'response_rejected',
            sessionId,
            playerId: msg.playerId,
            blockId: msg.blockId,
            reason: 'deadline_reached',
            timestamp: Date.now(),
          });
          return;
        }
        updateStudent(msg.playerId, (current) => ({
          ...current,
          name: msg.name || current.name,
          lastSeen: Date.now(),
          responses: {
            ...(current.responses || {}),
            [msg.blockId]: msg.result,
          },
        }));
      }
    };
    return () => {
      ch.postMessage({ type: 'host-exit', sessionId, playerId: hostPlayerId });
      ch.close();
      channelRef.current = null;
    };
  }, [hostPlayerId, pin, sessionId, transportMode, updateStudent]);

  useEffect(() => {
    if (!channelRef.current) return undefined;
    const id = window.setInterval(() => {
      channelRef.current?.postMessage({ type: 'heartbeat', sessionId, playerId: hostPlayerId, phase, currentIndex, timestamp: Date.now() });
    }, 4000);
    return () => window.clearInterval(id);
  }, [currentIndex, hostPlayerId, phase, sessionId]);

  useEffect(() => {
    if (phase === PHASE.RUNNING || phase === PHASE.FINISHED) {
      broadcastSnapshot(phase, currentIndex);
    }
  }, [broadcastSnapshot, currentIndex, phase]);

  const startSession = () => {
    recordDebugEvent('live_host_start', { pin, lessonId: lesson?.id || null, totalBlocks: blocks.length, transport: transportMode });
    setCurrentIndex(0);
    setAutoAdvancePaused(false);
    setSkipAuditTrail([]);
    setReopenAuditTrail([]);
    setSpotlightAuditTrail([]);
    setSpotlight(null);
    setPhase(PHASE.RUNNING);
  };

  const finishSession = async () => {
    const participantCount = Object.keys(students).length;
    if (participantCount > 0 && !await confirm(`End session for ${participantCount} student${participantCount > 1 ? 's' : ''}? This cannot be undone.`, {
      title: 'End live session',
      confirmLabel: 'End session',
    })) return;
    recordDebugEvent('live_host_finish', { pin, lessonId: lesson?.id || null, totalBlocks: blocks.length });
    setAutoAdvancePaused(false);
    setPhase(PHASE.FINISHED);
  };
  finishSessionRef.current = finishSession;

  const advanceToNextBlock = useCallback(() => {
    if (currentIndex >= blocks.length - 1) {
      void finishSession();
      return;
    }
    setCurrentIndex((value) => Math.min(blocks.length - 1, value + 1));
  }, [blocks.length, currentIndex, finishSession]);

  const skipCurrentQuestion = useCallback(async () => {
    if (phase !== PHASE.RUNNING || !currentBlock) return;
    const inputReason = await prompt('Reason for skipping this question?', {
      title: 'Skip question',
      placeholder: 'Time is up',
      defaultValue: 'Time is up',
      confirmLabel: 'Skip question',
      allowEmpty: true,
    });
    if (inputReason === null) return;

    const reason = String(inputReason || '').trim() || 'No reason provided';
    const event = {
      id: `skip-${Date.now()}-${currentIndex}`,
      action: 'skip',
      blockId: currentBlock.id || null,
      blockLabel: getBlockLabel(currentBlock, currentIndex),
      blockIndex: currentIndex,
      reason,
      timestamp: Date.now(),
    };

    setSkipAuditTrail((current) => [event, ...current].slice(0, 100));
    recordDebugEvent('live_host_skip_question', {
      pin,
      blockId: event.blockId,
      blockLabel: event.blockLabel,
      blockIndex: event.blockIndex,
      reason,
    });
    broadcast({
      type: 'question_skipped',
      sessionId,
      ...event,
    });
    advanceToNextBlock();
  }, [advanceToNextBlock, broadcast, currentBlock, currentIndex, phase, pin, prompt, sessionId]);

  const reopenPreviousQuestion = useCallback(async () => {
    if (phase !== PHASE.RUNNING || currentIndex <= 0) return;

    const targetIndex = currentIndex - 1;
    const targetBlock = blocks[targetIndex] || null;
    const inputReason = await prompt('Reason for re-opening the previous question?', {
      title: 'Re-open question',
      placeholder: 'Need to review answers',
      defaultValue: 'Need to review answers',
      confirmLabel: 'Re-open question',
      allowEmpty: true,
    });
    if (inputReason === null) return;

    const reason = String(inputReason || '').trim() || 'No reason provided';
    const event = {
      id: `reopen-${Date.now()}-${targetIndex}`,
      action: 'reopen',
      blockId: targetBlock?.id || null,
      blockLabel: targetBlock ? getBlockLabel(targetBlock, targetIndex) : `Block ${targetIndex + 1}`,
      blockIndex: targetIndex,
      fromIndex: currentIndex,
      reason,
      timestamp: Date.now(),
    };

    setReopenAuditTrail((current) => [event, ...current].slice(0, 100));
    setAutoAdvancePaused(true);
    recordDebugEvent('live_host_reopen_question', {
      pin,
      blockId: event.blockId,
      blockLabel: event.blockLabel,
      blockIndex: event.blockIndex,
      fromIndex: event.fromIndex,
      reason,
    });
    broadcast({
      type: 'question_reopened',
      sessionId,
      ...event,
    });
    setCurrentIndex(targetIndex);
  }, [blocks, broadcast, currentIndex, phase, pin, prompt, sessionId]);

  const spotlightStudentAnswer = useCallback((studentId) => {
    if (!currentBlock || currentBlock.type !== 'task') return;
    const student = students[studentId];
    const result = student?.responses?.[currentBlock.id];
    if (!student || !result) return;

    const teamName = teamAssignments[studentId] || null;
    const payload = {
      id: `spotlight-${Date.now()}-${studentId}`,
      studentId,
      studentName: student?.name || 'Student',
      blockId: currentBlock.id,
      blockLabel: getBlockLabel(currentBlock, currentIndex),
      blockIndex: currentIndex,
      answer: result?.response ?? result?.answer ?? null,
      correct: typeof result?.correct === 'boolean' ? result.correct : null,
      teamName,
      isCaptain: teamName ? captainsByTeam[teamName] === studentId : false,
      timestamp: Date.now(),
    };

    setSpotlight(payload);
    setSpotlightAuditTrail((current) => [
      {
        ...payload,
        action: 'spotlight',
      },
      ...current,
    ].slice(0, 100));

    broadcast({
      type: 'spotlight_answer',
      sessionId,
      spotlight: payload,
      timestamp: Date.now(),
    });
  }, [broadcast, captainsByTeam, currentBlock, currentIndex, sessionId, students, teamAssignments]);

  const clearSpotlight = useCallback(() => {
    setSpotlight(null);
    broadcast({
      type: 'spotlight_cleared',
      sessionId,
      timestamp: Date.now(),
    });
  }, [broadcast, sessionId]);

  const buildLiveSessions = useCallback((submittedAt) => {
    const lessonId = lesson?.id || `live-${sessionId}`;
    const lessonTitle = lesson?.title || 'Live Lesson';
    const lessonPreview = lesson?.dsl || '';
    const controlEvents = [
      ...skipAuditTrail
        .map((event) => ({
          type: 'live_host_question_skipped',
          at: event.timestamp,
          blockId: event.blockId,
          blockLabel: event.blockLabel,
          blockIndex: event.blockIndex,
          reason: event.reason,
        })),
      ...reopenAuditTrail
        .map((event) => ({
          type: 'live_host_question_reopened',
          at: event.timestamp,
          blockId: event.blockId,
          blockLabel: event.blockLabel,
          blockIndex: event.blockIndex,
          fromIndex: event.fromIndex,
          reason: event.reason,
        })),
      ...spotlightAuditTrail
        .map((event) => ({
          type: 'live_host_spotlight_answer',
          at: event.timestamp,
          studentId: event.studentId,
          studentName: event.studentName,
          blockId: event.blockId,
          blockLabel: event.blockLabel,
          blockIndex: event.blockIndex,
          teamName: event.teamName || null,
        })),
    ].sort((left, right) => left.at - right.at);

    return Object.entries(students).map(([studentId, student]) => {
      const responses = student?.responses || {};
      const hasAnyResponse = gradableTasks.some((block) => {
        if (responses[block.id]) return true;
        const override = manualPoints?.[studentId]?.[block.id];
        return typeof override === 'number' && Number.isFinite(override);
      });
      if (!hasAnyResponse) return null;

      const breakdown = gradableTasks.map((block, index) => {
        const result = responses[block.id] || null;
        const points = Math.max(0, Number(getTaskPoints(block) || 0));
        const overrideRaw = manualPoints?.[studentId]?.[block.id];
        const hasOverride = typeof overrideRaw === 'number' && Number.isFinite(overrideRaw);
        const overridePoints = hasOverride ? Math.max(0, Math.min(points, Number(overrideRaw))) : null;
        const autoScore = Math.max(0, Math.min(1, Number(normalizeScore(result) || 0)));
        const finalScore = hasOverride ? (points > 0 ? overridePoints / points : 0) : autoScore;

        let correct = typeof result?.correct === 'boolean' ? result.correct : null;
        if (hasOverride) {
          if (points > 0) {
            if (overridePoints >= points) correct = true;
            else if (overridePoints <= 0) correct = false;
            else correct = null;
          } else {
            correct = null;
          }
        }

        const responseValue = result?.response ?? result?.answer ?? null;
        const answered = result?.submitted === true || responseValue !== null;

        return {
          id: block.id,
          label: getBlockLabel(block, index),
          taskType: block.taskType || 'unknown',
          points,
          correct,
          score: finalScore,
          result: {
            ...(result && typeof result === 'object' ? result : { response: responseValue }),
            response: responseValue,
            answer: result?.answer ?? responseValue,
            submitted: answered,
            source: 'live',
            liveSessionId: sessionId,
            studentId,
            manualOverridePoints: hasOverride ? overridePoints : null,
            timestamp: result?.timestamp || submittedAt,
          },
        };
      });

      const total = breakdown.reduce((sum, entry) => sum + Math.max(0, Number(entry.points || 0)), 0);
      const earned = breakdown.reduce((sum, entry) => {
        const points = Math.max(0, Number(entry.points || 0));
        const score = Math.max(0, Math.min(1, Number(entry.score || 0)));
        return sum + points * score;
      }, 0);
      const teamName = teamAssignments[studentId] || null;

      return {
        id: `live-${sessionId}-${studentId}`,
        lessonId,
        lessonTitle,
        studentName: (student?.name || 'Student').trim() || 'Student',
        score: total > 0 ? Math.round((earned / total) * 100) : 0,
        earned: Number(earned.toFixed(2)),
        total,
        completedCount: breakdown.filter((entry) => entry?.result?.submitted === true).length,
        correctCount: breakdown.filter((entry) => entry.correct === true).length,
        incorrectCount: breakdown.filter((entry) => entry.correct === false).length,
        breakdown,
        lessonPreview,
        mode: 'live',
        origin: 'live',
        sourceType: 'live',
        teamName,
        balance: computeStudentBalance(studentId),
        submissionState: breakdown.some((entry) => entry.correct === null) ? 'awaiting_review' : 'graded',
        interaction: {
          transport: transportMode,
          liveSessionId: sessionId,
          studentId,
          teamName,
          wasCaptain: teamName ? captainsByTeam[teamName] === studentId : false,
          events: [
            ...controlEvents,
            { type: 'live_host_finished', at: submittedAt },
          ],
        },
        timestamp: submittedAt,
      };
    }).filter(Boolean);
  }, [captainsByTeam, computeStudentBalance, gradableTasks, lesson?.dsl, lesson?.id, lesson?.title, manualPoints, reopenAuditTrail, sessionId, skipAuditTrail, spotlightAuditTrail, students, teamAssignments, transportMode]);

  const persistFinishedLiveResults = useCallback(async () => {
    if (hasPersistedLiveResultsRef.current) return;
    hasPersistedLiveResultsRef.current = true;

    const submittedAt = Date.now();
    const sessionsToPersist = buildLiveSessions(submittedAt);
    if (sessionsToPersist.length === 0) return;

    sessionsToPersist.forEach((session) => {
      saveSession(session);
    });

    await Promise.allSettled(sessionsToPersist.map((session) => syncSessionGradeToCloud(session)));
  }, [buildLiveSessions]);

  useEffect(() => {
    if (phase !== PHASE.FINISHED) return;
    void persistFinishedLiveResults();
  }, [phase, persistFinishedLiveResults]);

  const goPrev = () => setCurrentIndex((value) => Math.max(0, value - 1));
  const goNext = () => {
    advanceToNextBlock();
  };

  const currentBlockStats = useMemo(() => {
    if (!currentBlock || currentBlock.type !== 'task') return null;
    let submitted = 0;
    let correct = 0;

    Object.values(students).forEach((student) => {
      const result = student?.responses?.[currentBlock.id];
      if (!result) return;
      const responded = result.submitted === true || result.response !== undefined || result.answer !== undefined;
      if (!responded) return;
      submitted += 1;
      if (result.correct === true) correct += 1;
    });

    return {
      submitted,
      correct,
      percent: submitted > 0 ? Math.round((correct / submitted) * 100) : 0,
    };
  }, [currentBlock, students]);

  useEffect(() => {
    if (phase !== PHASE.RUNNING) {
      setQuestionDeadlineRemainingSeconds(null);
      return;
    }

    if (!teacherLedPace) {
      setQuestionDeadlineRemainingSeconds(null);
      return;
    }

    const configured = toPositiveInt(liveSettings.questionResponseDeadlineSeconds, null);
    if (!currentBlock || currentBlock.type !== 'task' || !configured) {
      setQuestionDeadlineRemainingSeconds(null);
      return;
    }

    setQuestionDeadlineRemainingSeconds(configured);
  }, [currentBlock, liveSettings.questionResponseDeadlineSeconds, phase, teacherLedPace]);

  useEffect(() => {
    if (phase !== PHASE.RUNNING || questionDeadlineRemainingSeconds === null || autoAdvancePaused) return undefined;
    if (questionDeadlineRemainingSeconds <= 0) return undefined;

    const timerId = window.setTimeout(() => {
      setQuestionDeadlineRemainingSeconds((current) => {
        if (current === null) return null;
        return Math.max(0, current - 1);
      });
    }, 1000);

    return () => window.clearTimeout(timerId);
  }, [autoAdvancePaused, phase, questionDeadlineRemainingSeconds]);

  useEffect(() => {
    if (phase !== PHASE.RUNNING) {
      setAutoAdvanceRemaining(null);
      return;
    }

    if (!teacherLedPace) {
      setAutoAdvanceRemaining(null);
      return;
    }

    const seconds = Number(liveSettings.autoAdvanceSeconds);
    if (autoAdvancePolicy !== AUTO_ADVANCE_POLICY.TIMER || !Number.isFinite(seconds) || seconds <= 0) {
      setAutoAdvanceRemaining(null);
      return;
    }

    setAutoAdvanceRemaining(Math.round(seconds));
  }, [autoAdvancePolicy, currentIndex, liveSettings.autoAdvanceSeconds, phase, teacherLedPace]);

  useEffect(() => {
    if (phase !== PHASE.RUNNING) {
      setAutoModeRemainingSeconds(null);
      return;
    }

    if (!teacherLedPace) {
      setAutoModeRemainingSeconds(null);
      return;
    }

    const limitMinutes = Number(liveSettings.autoModeTimeLimitMinutes);
    if (!autoModeEnabled || !Number.isFinite(limitMinutes) || limitMinutes <= 0) {
      setAutoModeRemainingSeconds(null);
      return;
    }

    setAutoModeRemainingSeconds(Math.round(limitMinutes * 60));
  }, [autoModeEnabled, liveSettings.autoModeTimeLimitMinutes, phase, teacherLedPace]);

  useEffect(() => {
    if (phase !== PHASE.RUNNING || autoAdvanceRemaining === null || autoAdvancePaused) return undefined;

    if (autoAdvanceRemaining <= 0) {
      advanceToNextBlock();
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setAutoAdvanceRemaining((current) => {
        if (current === null) return null;
        return Math.max(0, current - 1);
      });
    }, 1000);

    return () => window.clearTimeout(timerId);
  }, [advanceToNextBlock, autoAdvancePaused, autoAdvanceRemaining, phase]);

  useEffect(() => {
    if (phase !== PHASE.RUNNING || autoModeRemainingSeconds === null || autoAdvancePaused) return undefined;

    if (autoModeRemainingSeconds <= 0) {
      finishSessionRef.current?.();
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setAutoModeRemainingSeconds((current) => {
        if (current === null) return null;
        return Math.max(0, current - 1);
      });
    }, 1000);

    return () => window.clearTimeout(timerId);
  }, [autoAdvancePaused, autoModeRemainingSeconds, phase]);

  useEffect(() => {
    if (phase !== PHASE.RUNNING || !teacherLedPace || autoAdvancePaused || !submissionPolicyEnabled) return;
    if (!currentBlock || currentBlock.type !== 'task' || playerCount <= 0) return;

    const submittedCount = currentBlockStats?.submitted || 0;
    if (autoAdvancePolicy === AUTO_ADVANCE_POLICY.ALL_SUBMITTED) {
      if (submittedCount >= playerCount) {
        advanceToNextBlock();
      }
      return;
    }

    if (autoAdvancePolicy === AUTO_ADVANCE_POLICY.SUBMISSION_THRESHOLD) {
      const submissionPercent = Math.round((submittedCount / playerCount) * 100);
      if (submissionPercent >= submissionThreshold) {
        advanceToNextBlock();
      }
    }
  }, [advanceToNextBlock, autoAdvancePaused, autoAdvancePolicy, currentBlock, currentBlockStats, phase, playerCount, submissionPolicyEnabled, submissionThreshold, teacherLedPace]);

  const supportsLive = supportsConfiguredLiveTransport(typeof window !== 'undefined' ? window.location.search : '');

  const computeStudentStats = useCallback((playerId) => {
    const student = students[playerId];
    const responses = student?.responses || {};
    const totalPoints = gradableTasks.reduce((sum, block) => sum + getTaskPoints(block), 0);
    let earned = 0;
    gradableTasks.forEach((block) => {
      const override = manualPoints[playerId]?.[block.id];
      if (typeof override === 'number' && Number.isFinite(override)) {
        earned += Math.max(0, Math.min(getTaskPoints(block), override));
        return;
      }
      earned += normalizeScore(responses[block.id]) * getTaskPoints(block);
    });
    const completed = gradableTasks.filter((block) => responses[block.id]).length;
    const pct = totalPoints > 0 ? Math.round((earned / totalPoints) * 100) : 0;
    return { earned, totalPoints, completed, pct };
  }, [gradableTasks, manualPoints, students]);

  const computeStudentBalance = useCallback((playerId) => {
    if (!liveSettings.balanceEnabled) return null;
    const student = students[playerId];
    const responses = student?.responses || {};
    let balance = liveSettings.balanceStartCredits;
    gradableTasks.forEach((block) => {
      const result = responses[block.id];
      if (!result) return;
      const override = manualPoints[playerId]?.[block.id];
      const isCorrect = typeof override === 'number' && Number.isFinite(override)
        ? override >= getTaskPoints(block)
        : result.correct === true;
      const isWrong = typeof override === 'number' && Number.isFinite(override)
        ? override <= 0
        : result.correct === false;
      if (isCorrect) balance += liveSettings.balanceCorrectReward;
      else if (isWrong) balance -= liveSettings.balanceWrongPenalty;
      if (!liveSettings.balanceAllowNegative && balance < 0) balance = 0;
    });
    return balance;
  }, [gradableTasks, liveSettings.balanceAllowNegative, liveSettings.balanceCorrectReward, liveSettings.balanceEnabled, liveSettings.balanceStartCredits, liveSettings.balanceWrongPenalty, manualPoints, students]);

  const setManualPoint = (playerId, blockId, value) => {
    const parsed = Number(value);
    setManualPoints((prev) => ({
      ...prev,
      [playerId]: {
        ...(prev[playerId] || {}),
        [blockId]: Number.isFinite(parsed) ? parsed : undefined,
      },
    }));

    if (transportMode === 'supabase' && Number.isFinite(parsed)) {
      void persistManualScore({ sessionId, playerId, blockId, points: parsed });
    }
  };

  const resetManualPointsForStudent = (playerId) => {
    setManualPoints((prev) => {
      const next = { ...prev };
      delete next[playerId];
      return next;
    });

    if (transportMode === 'supabase') {
      void deleteManualScores({ sessionId, playerId });
    }
  };

  const resetManualPointForBlock = (playerId, blockId) => {
    setManualPoints((prev) => {
      if (!prev[playerId]) return prev;
      const nextStudent = { ...prev[playerId] };
      delete nextStudent[blockId];
      const next = { ...prev };
      if (Object.keys(nextStudent).length === 0) delete next[playerId];
      else next[playerId] = nextStudent;
      return next;
    });

    if (transportMode === 'supabase') {
      void deleteManualScores({ sessionId, playerId, blockId });
    }
  };

  const exportReviewedStudentCsv = (playerId) => {
    const student = students[playerId];
    if (!student) return;

    const lines = [
      ['student', 'block_id', 'block_label', 'max_points', 'auto_points', 'override_points', 'final_points'],
    ];

    gradableTasks.forEach((block, idx) => {
      const result = student.responses?.[block.id] || null;
      const maxPoints = getTaskPoints(block);
      const autoPoints = Number((normalizeScore(result) * maxPoints).toFixed(2));
      const override = manualPoints[playerId]?.[block.id];
      const finalPoints = typeof override === 'number'
        ? Number(Math.max(0, Math.min(maxPoints, override)).toFixed(2))
        : autoPoints;
      lines.push([
        student.name || 'Student',
        block.id,
        getBlockLabel(block, idx),
        String(maxPoints),
        String(autoPoints),
        typeof override === 'number' ? String(override) : '',
        String(finalPoints),
      ]);
    });

    const csv = lines
      .map((row) => row.map((value) => `"${String(value || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const fileSafeName = String(student.name || 'student').replace(/[^a-z0-9_-]+/gi, '_');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `live-review-${fileSafeName}-${sessionId}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (transportMode !== 'supabase') return;
    let cancelled = false;
    void fetchManualScores(sessionId).then((loaded) => {
      if (cancelled) return;
      if (loaded && Object.keys(loaded).length > 0) {
        setManualPoints((prev) => ({ ...loaded, ...prev }));
      }
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId, transportMode]);

  useEffect(() => {
    if (transportMode !== 'supabase') return undefined;
    let stopped = false;

    const loadResponses = async () => {
      const remote = await fetchSessionResponses(sessionId);
      if (stopped || !remote || Object.keys(remote).length === 0) return;
      setStudents((prev) => {
        const next = { ...prev };
        Object.entries(remote).forEach(([studentId, responses]) => {
          const existing = next[studentId] || {
            name: 'Student',
            joinedAt: Date.now(),
            lastSeen: Date.now(),
            responses: {},
          };
          next[studentId] = {
            ...existing,
            responses: {
              ...(responses || {}),
              ...(existing.responses || {}),
            },
          };
        });
        return next;
      });
    };

    void loadResponses();
    const timer = window.setInterval(() => {
      void loadResponses();
    }, 7000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [sessionId, transportMode]);

  const classStats = useMemo(() => {
    const ids = Object.keys(students);
    if (ids.length === 0) {
      return { avgPct: 0, avgCompleted: 0, submissions: 0 };
    }
    const totals = ids.reduce((acc, id) => {
      const stats = computeStudentStats(id);
      const submissionCount = Object.keys(students[id]?.responses || {}).length;
      return {
        pct: acc.pct + stats.pct,
        completed: acc.completed + stats.completed,
        submissions: acc.submissions + submissionCount,
      };
    }, { pct: 0, completed: 0, submissions: 0 });
    return {
      avgPct: Math.round(totals.pct / ids.length),
      avgCompleted: Math.round((totals.completed / Math.max(ids.length * Math.max(gradableTasks.length, 1), 1)) * 100),
      submissions: totals.submissions,
    };
  }, [students, gradableTasks.length, computeStudentStats]);

  const topLeaders = useMemo(() => {
    return Object.entries(students)
      .map(([id, student]) => {
        const stats = computeStudentStats(id);
        return {
          id,
          name: student.name || 'Student',
          pct: stats.pct,
          completed: stats.completed,
          totalPoints: stats.totalPoints,
          earned: stats.earned,
          balance: computeStudentBalance(id),
        };
      })
      .sort((left, right) => right.pct - left.pct || right.completed - left.completed)
      .slice(0, 5);
  }, [students, computeStudentBalance, computeStudentStats]);

  const teamLeaderboard = useMemo(() => {
    if (!liveSettings.groupModeEnabled) return [];
    const byTeam = new Map();
    Object.entries(students).forEach(([studentId, student]) => {
      const teamName = teamAssignments[studentId] || 'Unassigned';
      const stats = computeStudentStats(studentId);
      const captainId = captainsByTeam[teamName] || null;
      if (!byTeam.has(teamName)) {
        byTeam.set(teamName, {
          teamName,
          members: 0,
          avgPct: 0,
          totalPct: 0,
          captainName: captainId && students[captainId] ? students[captainId].name : null,
          sampleMembers: [],
        });
      }
      const bucket = byTeam.get(teamName);
      bucket.members += 1;
      bucket.totalPct += stats.pct;
      if (bucket.sampleMembers.length < 3) bucket.sampleMembers.push(student.name || 'Student');
    });

    return [...byTeam.values()]
      .map((team) => ({
        ...team,
        avgPct: team.members > 0 ? Math.round(team.totalPct / team.members) : 0,
      }))
      .sort((left, right) => right.avgPct - left.avgPct || right.members - left.members);
  }, [captainsByTeam, computeStudentStats, liveSettings.groupModeEnabled, students, teamAssignments]);

  const recentControlAudit = useMemo(() => {
    return [...skipAuditTrail, ...reopenAuditTrail, ...spotlightAuditTrail]
      .slice()
      .sort((left, right) => right.timestamp - left.timestamp);
  }, [reopenAuditTrail, skipAuditTrail, spotlightAuditTrail]);

  const studentRows = useMemo(() => {
    return Object.entries(students).map(([studentId, student]) => {
      const stats = computeStudentStats(studentId);
      const answers = allTaskBlocks.map((block) => {
        const result = student.responses?.[block.id] || null;
        return {
          taskId: block.id,
          answer: result?.answer ?? result?.response ?? null,
          isCorrect: result?.correct === true,
          timestamp: result?.timestamp || result?.savedAt || null,
          submitted: result?.submitted === true,
        };
      });
      return {
        studentId,
        name: student.name || 'Student',
        score: stats.pct,
        balance: computeStudentBalance(studentId),
        answers,
      };
    });
  }, [students, allTaskBlocks, computeStudentBalance, computeStudentStats]);

  const taskAnalytics = useMemo(() => {
    return allTaskBlocks.map((block, index) => {
      const answers = studentRows
        .map((row) => row.answers.find((a) => a.taskId === block.id))
        .filter(Boolean);
      const submitted = answers.filter((a) => a.submitted);
      const correctCount = submitted.filter((a) => a.isCorrect).length;
      const percentCorrect = submitted.length > 0 ? Math.round((correctCount / submitted.length) * 100) : 0;

      const mistakesMap = new Map();
      submitted
        .filter((a) => !a.isCorrect)
        .forEach((a) => {
          const key = normalizeAnswerForBucket(a.answer);
          mistakesMap.set(key, (mistakesMap.get(key) || 0) + 1);
        });

      const mistakes = [...mistakesMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([answer, count]) => ({ answer, count }));

      return {
        taskId: block.id,
        label: getBlockLabel(block, index),
        percentCorrect,
        totalSubmitted: submitted.length,
        mistakes,
      };
    });
  }, [allTaskBlocks, studentRows]);

  const exportResultsJson = () => {
    const payload = {
      sessionId,
      exportedAt: new Date().toISOString(),
      audit: {
        skippedQuestions: skipAuditTrail,
        reopenedQuestions: reopenAuditTrail,
        spotlightedAnswers: spotlightAuditTrail,
      },
      students: studentRows.map((row) => ({
        sessionId,
        studentId: row.studentId,
        name: row.name,
        score: row.score,
        answers: row.answers,
      })),
      tasks: taskAnalytics,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `live-results-${sessionId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const exportResultsPdf = () => {
    window.print();
  };

  if (!supportsLive || validation.issues.length > 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white">
        <div className="text-xl font-bold">Live mode pre-check failed</div>
        <div className="mt-2 max-w-xl px-6 text-center text-sm text-zinc-400">The app stayed stable and refused to start a broken live session.</div>
        <div className="mt-5 w-full max-w-2xl space-y-2 px-6">
          {!supportsLive && <div className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">No compatible live transport is available. Check your environment configuration in Settings.</div>}
          {transportError && <div className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{transportError}</div>}
          {validation.issues.map((issue) => <div key={issue} className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{issue}</div>)}
        </div>
        <button type="button" onClick={onExit} className="mt-6 border border-zinc-700 px-4 py-2 text-sm">Back</button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2.5 sm:flex-nowrap sm:gap-3 sm:px-6 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <div className="min-w-0 truncate text-sm font-semibold">{lesson?.title || 'Live Lesson'}</div>
          <span className="shrink-0 border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-mono tracking-wider">PIN: {pin}</span>
          <div className="ml-0.5 flex shrink-0 items-center gap-1 border border-zinc-700 bg-zinc-900 p-0.5">
            <button type="button" onClick={() => setHostTab('live')} className={`px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${hostTab === 'live' ? 'bg-white text-zinc-900' : 'text-zinc-400'}`}>
              Live
            </button>
            <button type="button" onClick={() => setHostTab('results')} className={`px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${hostTab === 'results' ? 'bg-white text-zinc-900' : 'text-zinc-400'}`}>
              Results
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="text-xs text-zinc-400">{playerCount} player{playerCount !== 1 ? 's' : ''}</span>
          <button type="button" onClick={onExit} className="border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:text-white">Exit</button>
        </div>
      </header>

      <main className={`flex flex-1 flex-col items-center overflow-x-hidden p-4 sm:p-6 ${(hostTab === 'live' && phase === PHASE.LOBBY) ? 'justify-center' : 'justify-start overflow-y-auto'}`}>
        {hostTab === 'results' && (
          <div className="w-full max-w-6xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Results Dashboard</div>
                <div className="mt-1 text-sm text-zinc-300">Real-time student outcomes and task analytics for session {sessionId}.</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={exportResultsJson} className="border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:text-white">Export JSON</button>
                <button type="button" onClick={exportResultsPdf} className="border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:text-white">Print PDF</button>
              </div>
            </div>

            <div className="mb-5 overflow-hidden border border-zinc-800 bg-zinc-900">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead className="bg-zinc-950/60 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">Score</th>
                    {liveSettings.balanceEnabled && <th className="px-3 py-2">Credits</th>}
                    <th className="px-3 py-2">Answered</th>
                    <th className="px-3 py-2">Expand</th>
                  </tr>
                </thead>
                <tbody>
                  {studentRows.map((row) => {
                    const answeredCount = row.answers.filter((a) => a.submitted).length;
                    const isExpanded = expandedStudentId === row.studentId;
                    return (
                      <Fragment key={row.studentId}>
                        <tr key={row.studentId} className="border-t border-zinc-800">
                          <td className="px-3 py-2 font-medium">{row.name}</td>
                          <td className="px-3 py-2">{row.score}%</td>
                          {liveSettings.balanceEnabled && <td className="px-3 py-2">{row.balance ?? '—'}</td>}
                          <td className="px-3 py-2">{answeredCount}/{allTaskBlocks.length}</td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => setExpandedStudentId(isExpanded ? '' : row.studentId)} className="border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400 hover:text-white">
                              {isExpanded ? 'Hide' : 'Show'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-t border-zinc-800 bg-zinc-950/40">
                            <td colSpan={liveSettings.balanceEnabled ? 5 : 4} className="px-3 py-3">
                              <div className="space-y-1">
                                {row.answers.map((answer, idx) => {
                                  const tone = answer.submitted ? (answer.isCorrect ? 'border-emerald-700 bg-emerald-950/30 text-emerald-200' : 'border-red-700 bg-red-950/30 text-red-200') : 'border-zinc-700 bg-zinc-900 text-zinc-400';
                                  return (
                                    <div key={`${answer.taskId}-${idx}`} className={`border px-2 py-2 text-[11px] ${tone}`}>
                                      <div className="font-medium">{taskAnalytics.find((t) => t.taskId === answer.taskId)?.label || answer.taskId}</div>
                                      <div className="mt-0.5">Answer: {normalizeAnswerForBucket(answer.answer)}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {studentRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-zinc-500">No student responses yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border border-zinc-800 bg-zinc-900 p-4">
              <div className="mb-3 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Per-Task Analytics</div>
              <div className="space-y-2">
                {taskAnalytics.map((task) => (
                  <div key={task.taskId} className="border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-300">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{task.label}</span>
                      <span>{task.percentCorrect}% correct ({task.totalSubmitted} submitted)</span>
                    </div>
                    {task.mistakes.length > 0 && (
                      <div className="mt-1 text-[11px] text-zinc-400">
                        Most common mistakes: {task.mistakes.map((m) => `${m.answer} (${m.count})`).join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {hostTab === 'live' && phase === PHASE.LOBBY && (
          <div className="w-full max-w-lg text-center">
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Game PIN</div>
            <div className="mt-2 text-5xl font-black tracking-wider sm:text-6xl">{pin}</div>
            <div className="mt-4 text-sm text-zinc-400">Share this PIN with your students to join the session.</div>
            <div className="mt-6 grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start">
              <img src={qrUrl} alt="Join QR" className="mx-auto h-[140px] w-[140px] border border-zinc-700 bg-white p-1.5 sm:h-[180px] sm:w-[180px] sm:p-2" />
              <div className="space-y-2 text-left">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Join Link</div>
                <div className="break-all border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">{joinUrl}</div>
                <button
                  type="button"
                  onClick={() => { void navigator.clipboard?.writeText(joinUrl).catch(() => {}); }}
                  className="border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:text-white"
                >
                  Copy Join Link
                </button>
              </div>
            </div>
            <div className="mt-8">
              <div className="mb-3 text-[10px] uppercase tracking-[0.2em] text-zinc-500">Players joined ({playerCount})</div>
              <div className="flex flex-wrap justify-center gap-2">
                {Object.values(students).map((p, i) => (
                  <span key={i} className="border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs">{p.name}</span>
                ))}
                {playerCount === 0 && <span className="text-xs text-zinc-600">Waiting for players…</span>}
              </div>
            </div>
            <div className="mt-8 border border-zinc-800 bg-zinc-900 px-4 py-3 text-left text-sm text-zinc-300">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Pre-check</div>
              <div className="mt-2">{blocks.length} live blocks ready. Slides, media, split views, and all task types are broadcast from one source of truth.</div>
            </div>
            <div className="mt-4 border border-zinc-800 bg-zinc-900 px-4 py-3 text-left text-sm text-zinc-300">
              <button type="button" className="collapsible-header w-full text-zinc-400" onClick={() => setShowBasicSettings?.((v) => !v) ?? void 0} aria-expanded={showBasicSettings !== false}>
                <span className="collapsible-chevron" data-open={showBasicSettings !== false ? 'true' : 'false'}>▸</span>
                Session Rules
              </button>
              {showBasicSettings !== false && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={liveSettings.allowRetry} onChange={(event) => setLiveSettings((current) => ({ ...current, allowRetry: event.target.checked }))} />Allow retries <span className="group relative"><span className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-zinc-600 text-[8px] font-bold text-zinc-500">?</span><span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden w-44 -translate-x-1/2 border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-[10px] text-zinc-300 shadow group-hover:block">Students can retry tasks after submitting.</span></span></label>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={liveSettings.showCheckButton} onChange={(event) => setLiveSettings((current) => ({ ...current, showCheckButton: event.target.checked }))} />Show check button <span className="group relative"><span className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-zinc-600 text-[8px] font-bold text-zinc-500">?</span><span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden w-44 -translate-x-1/2 border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-[10px] text-zinc-300 shadow group-hover:block">Displays a check button so students get instant feedback.</span></span></label>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={liveSettings.lockAfterSubmit} onChange={(event) => setLiveSettings((current) => ({ ...current, lockAfterSubmit: event.target.checked }))} />One attempt per task <span className="group relative"><span className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-zinc-600 text-[8px] font-bold text-zinc-500">?</span><span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden w-44 -translate-x-1/2 border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-[10px] text-zinc-300 shadow group-hover:block">Locks the task after the first submission.</span></span></label>
                  <label className="space-y-1 text-xs text-zinc-300">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Class pace mode</span>
                    <select
                      value={liveSettings.paceMode}
                      onChange={(event) => setLiveSettings((current) => ({
                        ...current,
                        paceMode: normalizeLivePaceMode(event.target.value),
                      }))}
                      className="w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-white"
                    >
                      <option value={LIVE_PACE_MODE.TEACHER_LED}>Teacher-led</option>
                      <option value={LIVE_PACE_MODE.HYBRID}>Hybrid (students up to host)</option>
                      <option value={LIVE_PACE_MODE.STUDENT_PACED}>Student-paced</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
            <div className="mt-3 border border-zinc-800 bg-zinc-900 px-4 py-3 text-left text-sm text-zinc-300">
              <button type="button" className="collapsible-header w-full text-zinc-400" onClick={() => setShowAdvancedSettings?.((v) => !v) ?? void 0} aria-expanded={showAdvancedSettings === true}>
                <span className="collapsible-chevron" data-open={showAdvancedSettings ? 'true' : 'false'}>▸</span>
                Advanced Settings
              </button>
              {showAdvancedSettings && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={liveSettings.hideQuestionContent} onChange={(event) => setLiveSettings((current) => ({ ...current, hideQuestionContent: event.target.checked }))} />Hide question text for students</label>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={liveSettings.showLeaderboardEachQuestion} onChange={(event) => setLiveSettings((current) => ({ ...current, showLeaderboardEachQuestion: event.target.checked }))} />Show leaderboard each question</label>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={liveSettings.groupModeEnabled === true} onChange={(event) => setLiveSettings((current) => ({ ...current, groupModeEnabled: event.target.checked }))} />Enable teammate/group mode</label>
                  <label className="space-y-1 text-xs text-zinc-300">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Team count</span>
                    <input
                      type="number"
                      min={2}
                      max={8}
                      step={1}
                      value={liveSettings.groupCount ?? 2}
                      onChange={(event) => setLiveSettings((current) => ({
                        ...current,
                        groupCount: clampGroupCount(event.target.value, 2),
                      }))}
                      disabled={liveSettings.groupModeEnabled !== true}
                      className="w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-white disabled:opacity-50"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-300">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Captain rotation (blocks)</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      step={1}
                      value={liveSettings.captainRotationEvery ?? 1}
                      onChange={(event) => setLiveSettings((current) => ({
                        ...current,
                        captainRotationEvery: clampCaptainRotation(event.target.value, 1),
                      }))}
                      disabled={liveSettings.groupModeEnabled !== true}
                      className="w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-white disabled:opacity-50"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-300">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Auto-advance policy</span>
                    <select
                      value={liveSettings.autoAdvancePolicy}
                      onChange={(event) => setLiveSettings((current) => ({
                        ...current,
                        autoAdvancePolicy: normalizeAutoAdvancePolicy(event.target.value),
                      }))}
                      className="w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-white"
                    >
                      <option value={AUTO_ADVANCE_POLICY.TIMER}>Timer (seconds)</option>
                      <option value={AUTO_ADVANCE_POLICY.ALL_SUBMITTED}>All submitted</option>
                      <option value={AUTO_ADVANCE_POLICY.SUBMISSION_THRESHOLD}>Submission threshold</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs text-zinc-300">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Auto-advance (seconds)</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={liveSettings.autoAdvanceSeconds ?? ''}
                      onChange={(event) => setLiveSettings((current) => ({
                        ...current,
                        autoAdvanceSeconds: event.target.value ? Number(event.target.value) : null,
                      }))}
                      placeholder="Manual"
                      disabled={liveSettings.autoAdvancePolicy !== AUTO_ADVANCE_POLICY.TIMER}
                      className="w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-white"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-300">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Submission threshold (%)</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={liveSettings.autoAdvanceSubmissionThreshold ?? ''}
                      onChange={(event) => setLiveSettings((current) => ({
                        ...current,
                        autoAdvanceSubmissionThreshold: clampSubmissionPercent(event.target.value, 70),
                      }))}
                      placeholder="70"
                      disabled={liveSettings.autoAdvancePolicy !== AUTO_ADVANCE_POLICY.SUBMISSION_THRESHOLD}
                      className="w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-white"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-300">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Auto mode limit (minutes)</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={liveSettings.autoModeTimeLimitMinutes ?? ''}
                      onChange={(event) => setLiveSettings((current) => ({
                        ...current,
                        autoModeTimeLimitMinutes: event.target.value ? Number(event.target.value) : null,
                      }))}
                      placeholder="No limit"
                      className="w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-white"
                    />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-300">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Question response deadline (seconds)</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={liveSettings.questionResponseDeadlineSeconds ?? ''}
                      onChange={(event) => setLiveSettings((current) => ({
                        ...current,
                        questionResponseDeadlineSeconds: event.target.value ? toPositiveInt(event.target.value, null) : null,
                      }))}
                      placeholder="No deadline"
                      className="w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-white"
                    />
                  </label>
                </div>
              )}
              {paceMode !== LIVE_PACE_MODE.TEACHER_LED && showAdvancedSettings && (
                <div className="mt-2 text-[11px] text-zinc-500">
                  Teacher auto timers and per-question deadlines are paused in {paceMode.replace('_', '-')} mode.
                </div>
              )}
              {liveSettings.showLeaderboardEachQuestion && playerCount <= 1 && showAdvancedSettings && (
                <div className="mt-2 text-[11px] text-zinc-500">Leaderboard cards appear after each question when at least two students are connected.</div>
              )}
            </div>
            <div className="mt-3 border border-zinc-800 bg-zinc-900 px-4 py-3 text-left text-sm text-zinc-300">
              <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                <input type="checkbox" checked={liveSettings.balanceEnabled} onChange={(event) => setLiveSettings((current) => ({ ...current, balanceEnabled: event.target.checked }))} />
                Enable credit balance
              </label>
              {liveSettings.balanceEnabled && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-xs text-zinc-300">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Starting credits</span>
                    <input type="number" min={0} step={1} value={liveSettings.balanceStartCredits} onChange={(event) => setLiveSettings((current) => ({ ...current, balanceStartCredits: Math.max(0, Number(event.target.value) || 0) }))} className="w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-white" />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-300">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Correct answer reward</span>
                    <input type="number" min={0} step={1} value={liveSettings.balanceCorrectReward} onChange={(event) => setLiveSettings((current) => ({ ...current, balanceCorrectReward: Math.max(0, Number(event.target.value) || 0) }))} className="w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-white" />
                  </label>
                  <label className="space-y-1 text-xs text-zinc-300">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Wrong answer penalty</span>
                    <input type="number" min={0} step={1} value={liveSettings.balanceWrongPenalty} onChange={(event) => setLiveSettings((current) => ({ ...current, balanceWrongPenalty: Math.max(0, Number(event.target.value) || 0) }))} className="w-full border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-white" />
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                    <input type="checkbox" checked={liveSettings.balanceAllowNegative} onChange={(event) => setLiveSettings((current) => ({ ...current, balanceAllowNegative: event.target.checked }))} />
                    Allow negative balance
                  </label>
                </div>
              )}
            </div>
            <div className="mt-3 border border-zinc-800 bg-zinc-900 px-4 py-3 text-left text-sm text-zinc-300">
              <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                <input type="checkbox" checked={liveSettings.privacyMode} onChange={(event) => setLiveSettings((current) => ({ ...current, privacyMode: event.target.checked }))} />
                Privacy mode <span className="group relative"><span className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-zinc-600 text-[8px] font-bold text-zinc-500">?</span><span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden w-48 -translate-x-1/2 border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-[10px] text-zinc-300 shadow group-hover:block">Students see randomly assigned safe names instead of typing their own.</span></span>
              </label>
            </div>
            <button type="button" onClick={startSession} disabled={playerCount === 0} className="action-primary mt-8 px-8 py-3 text-sm font-bold disabled:opacity-30">
              Start live lesson
            </button>
          </div>
        )}

        {hostTab === 'live' && phase === PHASE.RUNNING && (
          <div className="w-full max-w-6xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Teacher Control</div>
                <div className="mt-1 truncate text-sm text-zinc-300">Block {currentIndex + 1}/{blocks.length}: {currentBlock ? getBlockLabel(currentBlock, currentIndex) : 'N/A'}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                  <span>{playerCount} joined</span>
                  <span>Pace: {paceMode.replace('_', '-')}</span>
                </div>
                {currentBlockStats && playerCount > 0 && (
                  <div className="mt-1"><SessionWarmth responded={currentBlockStats.submitted} total={playerCount} /></div>
                )}
                {autoAdvanceRemaining !== null && (
                  <div className="mt-1 text-xs text-zinc-400">Auto-advancing in {autoAdvanceRemaining}s</div>
                )}
                {autoAdvancePolicy === AUTO_ADVANCE_POLICY.ALL_SUBMITTED && currentBlock?.type === 'task' && (
                  <div className="mt-1 text-xs text-zinc-400">Auto policy: advance when all submit ({currentBlockStats?.submitted || 0}/{playerCount})</div>
                )}
                {autoAdvancePolicy === AUTO_ADVANCE_POLICY.SUBMISSION_THRESHOLD && currentBlock?.type === 'task' && (
                  <div className="mt-1 text-xs text-zinc-400">Auto policy: advance at {submissionThreshold}% submissions ({currentBlockStats?.submitted || 0}/{playerCount})</div>
                )}
                {autoModeRemainingSeconds !== null && (
                  <div className="mt-1 text-xs text-zinc-400">Auto mode ends in {formatSecondsToClock(autoModeRemainingSeconds)}</div>
                )}
                {questionDeadlineRemainingSeconds !== null && (
                  <div className="mt-1 text-xs text-zinc-400">
                    Question deadline: {questionDeadlineRemainingSeconds > 0 ? `${questionDeadlineRemainingSeconds}s left` : 'responses closed'}
                  </div>
                )}
                {autoAdvancePaused && hostFlowControlsEnabled && (
                  <div className="mt-1 text-xs text-amber-300">Auto mode paused</div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={goPrev} disabled={currentIndex === 0} className="border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 disabled:opacity-30 sm:px-4 sm:py-2" aria-label="Previous question">← Back</button>
                <button type="button" onClick={goNext} className="action-primary px-3 py-1.5 text-sm font-bold sm:px-4 sm:py-2">{currentIndex === blocks.length - 1 ? 'Finish →' : 'Next →'}</button>
                <div className="relative">
                  <button type="button" onClick={() => setShowRunningOverflow(v => !v)} className="overflow-menu-btn border border-zinc-700 px-2.5 py-2 text-sm text-zinc-400" aria-label="More actions" aria-expanded={showRunningOverflow}>⋮</button>
                  {showRunningOverflow && (
                    <>
                      <button type="button" onClick={() => setShowRunningOverflow(false)} className="fixed inset-0 z-30" aria-label="Close menu" />
                      <div className="absolute right-0 top-full z-40 mt-1 w-52 border border-zinc-700 bg-zinc-900 shadow-lg" role="menu">
                        {hostFlowControlsEnabled && (
                          <button type="button" role="menuitem" onClick={() => { setAutoAdvancePaused((current) => !current); setShowRunningOverflow(false); }} className="w-full px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800">
                            {autoAdvancePaused ? 'Resume Auto' : 'Pause Auto'}
                          </button>
                        )}
                        <button type="button" role="menuitem" onClick={() => { skipCurrentQuestion(); setShowRunningOverflow(false); }} className="w-full px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800">
                          Skip Question
                        </button>
                        <button type="button" role="menuitem" onClick={() => { reopenPreviousQuestion(); setShowRunningOverflow(false); }} disabled={currentIndex === 0} className="w-full px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-30">
                          Re-open Previous
                        </button>
                        {spotlight && (
                          <button type="button" role="menuitem" onClick={() => { clearSpotlight(); setShowRunningOverflow(false); }} className="w-full px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800">
                            Clear Spotlight
                          </button>
                        )}
                        <button type="button" role="menuitem" onClick={() => { setShowQuickPulse(true); setPulseVotes({}); setShowRunningOverflow(false); }} className="w-full px-3 py-2.5 text-left text-sm text-zinc-300 hover:bg-zinc-800">
                          Quick Pulse
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
            {showPerQuestionLeaderboard && (
              <div className="mb-4 border border-zinc-800 bg-zinc-900 p-3">
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Top 5 Leaderboard</div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {topLeaders.map((leader, index) => (
                    <div key={leader.id} className="leaderboard-row border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">#{index + 1}</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-100">{leader.name}</div>
                      <div className="text-xs text-zinc-400">{leader.pct}% • {leader.completed} answered{leader.balance !== null ? ` • ${leader.balance} cr` : ''}</div>
                    </div>
                  ))}
                  {topLeaders.length === 0 && <div className="text-xs text-zinc-500">Waiting for submissions...</div>}
                </div>
              </div>
            )}
            {liveSettings.showLeaderboardEachQuestion && !showPerQuestionLeaderboard && (
              <div className="mb-4 border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
                Leaderboard is enabled and will appear automatically once at least two students are connected.
              </div>
            )}
            {currentBlockStats && (
              <div className="mb-4 border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
                Current question: {currentBlockStats.submitted} submitted • {currentBlockStats.correct} correct • {currentBlockStats.percent}% accuracy
              </div>
            )}
            {liveSettings.groupModeEnabled && teamLeaderboard.length > 0 && (
              <div className="mb-4 border border-zinc-800 bg-zinc-900 p-3">
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Team leaderboard</div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {teamLeaderboard.map((team) => (
                    <div key={team.teamName} className="border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-300">
                      <div className="font-semibold text-zinc-100">{team.teamName}</div>
                      <div className="mt-1 text-zinc-400">Avg score: {team.avgPct}% • {team.members} member{team.members === 1 ? '' : 's'}</div>
                      <div className="mt-1 text-zinc-500">Captain: {team.captainName || 'TBD'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {currentTaskResponses.length > 0 && currentBlock?.type === 'task' && (
              <div className="mb-4 border border-zinc-800 bg-zinc-900 p-3">
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Spotlight answers</div>
                <div className="space-y-2">
                  {currentTaskResponses.slice(0, 8).map((row) => (
                    <div key={`${row.studentId}-${row.submittedAt}`} className="flex flex-wrap items-center justify-between gap-2 border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-300">
                      <div>
                        <div className="font-medium text-zinc-100">{row.name}{row.teamName ? ` · ${row.teamName}` : ''}{row.isCaptain ? ' · Captain' : ''}</div>
                        <div className="mt-0.5 max-w-[44rem] truncate text-zinc-400">{normalizeAnswerForBucket(row.answer)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => spotlightStudentAnswer(row.studentId)}
                        className="border border-violet-700 bg-violet-50/10 px-3 py-1 text-[10px] uppercase tracking-[0.12em] text-violet-200 hover:bg-violet-100/10"
                      >
                        Spotlight
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {spotlight && (
              <div className="mb-4 border border-violet-500/40 bg-violet-500/10 px-3 py-3 text-xs text-violet-100">
                <div className="text-[10px] uppercase tracking-[0.18em] text-violet-300">Live Spotlight</div>
                <div className="mt-1 font-medium">{spotlight.studentName}{spotlight.teamName ? ` · ${spotlight.teamName}` : ''}</div>
                <div className="mt-1 text-violet-200">{spotlight.blockLabel}</div>
                <div className="mt-2 whitespace-pre-wrap text-violet-100">{normalizeAnswerForBucket(spotlight.answer)}</div>
              </div>
            )}
            {recentControlAudit.length > 0 && (
              <div className="mb-4 border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
                <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-500">Control Audit</div>
                <div className="space-y-1">
                  {recentControlAudit.slice(0, 4).map((event) => (
                    <div key={event.id} className="border border-zinc-800 bg-zinc-950/40 px-2 py-1.5">
                      {event.action === 'reopen' ? 'Re-opened' : event.action === 'spotlight' ? 'Spotlighted' : 'Skipped'} Q{event.blockIndex + 1} {event.blockLabel}{event.reason ? `: ${event.reason}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {showQuickPulse && (
              <QuickPulse mode="host" votes={pulseVotes} totalVoters={playerCount} onDismiss={() => setShowQuickPulse(false)} />
            )}
            <LessonStage
              blocks={blocks}
              currentIndex={currentIndex}
              results={{}}
              onCompleteBlock={() => {}}
              emptyMessage="The live session stayed connected, but this block is unavailable."
              taskOptions={{
                allowRetry: liveSettings.allowRetry,
                showCheckButton: liveSettings.showCheckButton,
                lockAfterSubmit: false,
                hideQuestionContent: false,
              }}
            />
          </div>
        )}

        {hostTab === 'live' && phase === PHASE.FINISHED && (
          <div className="w-full max-w-md text-center">
            <div className="mb-6 text-2xl font-black">Live lesson complete</div>
            <div className="mb-4 text-sm text-zinc-400">Students have reached the safe final state. The host can exit cleanly at any time.</div>
            <div className="mb-4 grid grid-cols-3 gap-2 text-xs">
              <div className="border border-zinc-700 bg-zinc-900 px-3 py-2"><div className="text-zinc-500">Avg Score</div><div className="mt-1 text-sm text-white">{classStats.avgPct}%</div></div>
              <div className="border border-zinc-700 bg-zinc-900 px-3 py-2"><div className="text-zinc-500">Completion</div><div className="mt-1 text-sm text-white">{classStats.avgCompleted}%</div></div>
              <div className="border border-zinc-700 bg-zinc-900 px-3 py-2"><div className="text-zinc-500">Responses</div><div className="mt-1 text-sm text-white">{classStats.submissions}</div></div>
            </div>
            <div className="mb-4 border border-zinc-800 bg-zinc-900 p-3 text-left">
              <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Final Top 5</div>
              <div className="grid gap-2">
                {topLeaders.map((leader, index) => (
                  <div key={leader.id} className="flex flex-wrap items-center justify-between gap-1 border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs text-zinc-300">
                    <span>#{index + 1} {leader.name}</span>
                    <span>{leader.earned.toFixed(1)} / {leader.totalPoints} pts ({leader.pct}%){leader.balance !== null ? ` • ${leader.balance} cr` : ''}</span>
                  </div>
                ))}
                {topLeaders.length === 0 && <div className="text-xs text-zinc-500">No leaderboard data.</div>}
              </div>
            </div>
            {liveSettings.groupModeEnabled && teamLeaderboard.length > 0 && (
              <div className="mb-4 border border-zinc-800 bg-zinc-900 p-3 text-left">
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Team standings</div>
                <div className="space-y-1 text-xs text-zinc-300">
                  {teamLeaderboard.map((team, index) => (
                    <div key={`final-${team.teamName}`} className="flex items-center justify-between border border-zinc-800 bg-zinc-950/40 px-2 py-1.5">
                      <span>#{index + 1} {team.teamName} ({team.members})</span>
                      <span>{team.avgPct}% · Captain {team.captainName || 'TBD'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {recentControlAudit.length > 0 && (
              <div className="mb-4 border border-zinc-800 bg-zinc-900 p-3 text-left">
                <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Control Audit Trail</div>
                <div className="space-y-1 text-xs text-zinc-300">
                  {recentControlAudit.map((event) => (
                    <div key={`finished-${event.id}`} className="border border-zinc-800 bg-zinc-950/40 px-2 py-1.5">
                      {new Date(event.timestamp).toLocaleTimeString()} · {event.action === 'reopen' ? 'Re-opened' : event.action === 'spotlight' ? 'Spotlighted' : 'Skipped'} Q{event.blockIndex + 1} {event.blockLabel} {event.reason ? `· ${event.reason}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              {Object.entries(students).map(([id, student], i) => {
                const stats = computeStudentStats(id);
                return (
                  <button key={id} type="button" onClick={() => setReviewStudentId(id)} className="flex w-full items-center justify-between border border-zinc-700 bg-zinc-900 px-4 py-3 text-left text-sm">
                    <div className="flex items-center gap-3">
                      <span className="w-8 text-lg font-bold text-zinc-500">#{i + 1}</span>
                      <div>
                        <div className="font-medium">{student.name}</div>
                        <div className="text-[11px] text-zinc-500">{stats.completed}/{gradableTasks.length} answered</div>
                      </div>
                    </div>
                    <span className="text-xs text-zinc-400">{stats.earned.toFixed(1)} / {stats.totalPoints} pts ({stats.pct}%)</span>
                  </button>
                );
              })}
              {playerCount === 0 && <div className="border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-500">No students were connected.</div>}
            </div>
            {reviewStudentId && students[reviewStudentId] && (
              <div className="mt-5 border border-zinc-800 bg-zinc-900 p-4 text-left">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Review: {students[reviewStudentId].name}</div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => exportReviewedStudentCsv(reviewStudentId)} className="border border-zinc-700 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-400 hover:text-white">Export CSV</button>
                    <button type="button" onClick={() => resetManualPointsForStudent(reviewStudentId)} className="border border-zinc-700 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-400 hover:text-white">Reset Overrides</button>
                  </div>
                </div>
                <div className="space-y-2">
                  {gradableTasks.map((block, idx) => {
                    const result = students[reviewStudentId]?.responses?.[block.id] || null;
                    const points = getTaskPoints(block);
                    const auto = normalizeScore(result) * points;
                    const override = manualPoints[reviewStudentId]?.[block.id];
                    return (
                      <div key={block.id} className="grid gap-2 border border-zinc-800 bg-zinc-950/40 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center">
                        <div>
                          <div className="text-xs text-zinc-300">{idx + 1}. {getBlockLabel(block, idx)}</div>
                          <div className="text-[11px] text-zinc-500">Auto: {auto.toFixed(1)} / {points} points</div>
                          {result && (
                            <details className="mt-1 text-[11px] text-zinc-400">
                              <summary className="cursor-pointer text-zinc-500">View answer</summary>
                              <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap border border-zinc-800 bg-zinc-950 p-2 text-zinc-300">{JSON.stringify(result.response ?? result, null, 2)}</pre>
                            </details>
                          )}
                        </div>
                        <div className="space-y-1">
                          <input
                            type="number"
                            min={0}
                            max={points}
                            step={0.5}
                            value={typeof override === 'number' ? override : ''}
                            onChange={(event) => setManualPoint(reviewStudentId, block.id, event.target.value)}
                            placeholder={`auto ${auto.toFixed(1)}`}
                            className="w-full border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-white"
                          />
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => setManualPoint(reviewStudentId, block.id, auto.toFixed(2))} className="border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400 hover:text-white">Use Auto</button>
                            <button type="button" onClick={() => resetManualPointForBlock(reviewStudentId, block.id)} className="border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400 hover:text-white">Clear</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <button type="button" onClick={onExit} className="mt-8 border border-zinc-700 px-6 py-2 text-sm text-zinc-300 hover:text-white">Back to Lessons</button>
          </div>
        )}
      </main>
    </div>
  );
}
