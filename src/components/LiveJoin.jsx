import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import LessonStage from './LessonStage';
import { normalizeVisibleBlocks } from '../utils/lesson';
import { recordDebugEvent } from '../utils/debug';
import { getLiveSessionIdFromSearch, getLiveTransportLabel, supportsConfiguredLiveTransport } from '../utils/liveTransport';
import { createLiveChannel } from '../utils/liveChannel';
import { ensureSession } from '../utils/accountAuth';
import { fetchStudentResponses } from '../utils/liveSupabaseData';
import { generateNickname } from '../utils/nicknames';
import PrivacyDot from './PrivacyDot';

const PHASE = { WAITING: 'waiting', RUNNING: 'running', FINISHED: 'finished' };
const LIVE_PACE_MODE = {
  TEACHER_LED: 'teacher_led',
  STUDENT_PACED: 'student_paced',
  HYBRID: 'hybrid',
};

function normalizeLivePaceMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === LIVE_PACE_MODE.STUDENT_PACED || mode === LIVE_PACE_MODE.HYBRID || mode === LIVE_PACE_MODE.TEACHER_LED) {
    return mode;
  }
  return LIVE_PACE_MODE.TEACHER_LED;
}

function getConnectionBadge(status, isOffline) {
  if (isOffline) {
    return {
      label: 'Offline',
      className: 'border-amber-700 bg-amber-900/30 text-amber-200',
    };
  }

  if (status === 'connected') {
    return {
      label: 'Connected',
      className: 'border-emerald-700 bg-emerald-900/30 text-emerald-200',
    };
  }

  if (status === 'reconnecting' || status === 'joining' || status === 'waiting-sync') {
    return {
      label: 'Syncing',
      className: 'border-sky-700 bg-sky-900/30 text-sky-200',
    };
  }

  return {
    label: 'Attention',
    className: 'border-zinc-700 bg-zinc-900/40 text-zinc-300',
  };
}

function getDeadlineNotice(remainingSeconds) {
  const numeric = Number(remainingSeconds);
  if (!Number.isFinite(numeric)) return null;
  if (numeric <= 0) {
    return {
      title: 'Responses closed',
      detail: 'Time is up for this question. New submissions are locked.',
      className: 'border-red-300 bg-red-50 text-red-800',
    };
  }
  if (numeric <= 10) {
    return {
      title: `Submit now: ${numeric}s left`,
      detail: 'This question is about to lock.',
      className: 'border-red-300 bg-red-50 text-red-800',
    };
  }
  if (numeric <= 30) {
    return {
      title: `${numeric}s remaining`,
      detail: 'Finish and submit before the response window closes.',
      className: 'border-amber-300 bg-amber-50 text-amber-800',
    };
  }
  return {
    title: `Response deadline: ${numeric}s`,
    detail: 'The teacher is running this question with a timed response window.',
    className: 'border-zinc-200 bg-zinc-50 text-zinc-700',
  };
}

function getLocalResponseKey(sessionId, playerId) {
  return `lf_live_responses_${sessionId}_${playerId}`;
}

function loadLocalResponses(sessionId, playerId) {
  try {
    const raw = localStorage.getItem(getLocalResponseKey(sessionId, playerId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLocalResponses(sessionId, playerId, responses) {
  try {
    localStorage.setItem(getLocalResponseKey(sessionId, playerId), JSON.stringify({ ...responses, _timestamp: Date.now() }));
  } catch {
    // Ignore storage failures.
  }
}

function getLocalQueueKey(sessionId, playerId) {
  return `lf_live_queue_${sessionId}_${playerId}`;
}

function loadLocalQueuedUpdates(sessionId, playerId) {
  try {
    const raw = localStorage.getItem(getLocalQueueKey(sessionId, playerId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry === 'object' && typeof entry.blockId === 'string') : [];
  } catch {
    return [];
  }
}

function saveLocalQueuedUpdates(sessionId, playerId, queuedUpdates) {
  try {
    if (!queuedUpdates || queuedUpdates.length === 0) {
      localStorage.removeItem(getLocalQueueKey(sessionId, playerId));
      return;
    }
    localStorage.setItem(getLocalQueueKey(sessionId, playerId), JSON.stringify(queuedUpdates));
  } catch {
    // Ignore storage failures.
  }
}

export default function LiveJoin({ onExit }) {
  const initialSessionId = useMemo(() => (typeof window !== 'undefined' ? getLiveSessionIdFromSearch(window.location.search) : ''), []);
  const playerId = useMemo(() => {
    let stored = '';
    try {
      stored = sessionStorage.getItem('lf_live_pid') || '';
    } catch {
      // Ignore session storage read failures.
    }
    if (stored) return stored;
    const id = crypto.randomUUID();
    try {
      sessionStorage.setItem('lf_live_pid', id);
    } catch {
      // Ignore session storage write failures.
    }
    return id;
  }, []);
  const [pin, setPin] = useState(initialSessionId);
  const [pinDigits, setPinDigits] = useState(() => {
    const id = initialSessionId || '';
    return [id[0] || '', id[1] || '', id[2] || '', id[3] || '', id[4] || '', id[5] || ''];
  });
  const pinInputRefs = useRef([]);
  const [name, setName] = useState(() => generateNickname());
  const [joined, setJoined] = useState(false);
  const [phase, setPhase] = useState(PHASE.WAITING);
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('idle');
  const [results, setResults] = useState({});
  const [error, setError] = useState('');
  const [liveNotice, setLiveNotice] = useState('');
  const [transportMode, setTransportMode] = useState(() => (typeof window !== 'undefined' ? getLiveTransportLabel(window.location.search) : 'broadcast-local'));
  const [localIndex, setLocalIndex] = useState(0);
  const [offlineQueuedUpdates, setOfflineQueuedUpdates] = useState([]);
  const [isOffline, setIsOffline] = useState(() => (typeof navigator !== 'undefined' ? !navigator.onLine : false));
  const [queueReplayState, setQueueReplayState] = useState('idle');
  const [queueReplayAttempt, setQueueReplayAttempt] = useState(0);

  const channelRef = useRef(null);
  const activeSessionRef = useRef('');
  const lastSignatureRef = useRef({});
  const lastSyncRef = useRef(0);
  const joinAckRef = useRef(false);
  const joinTimeoutRef = useRef(null);
  const replayTimerRef = useRef(null);
  const statusRef = useRef(status);
  const offlineRef = useRef(isOffline);

  const blocks = useMemo(() => normalizeVisibleBlocks(session?.lesson?.blocks || []), [session]);
  const paceMode = normalizeLivePaceMode(session?.paceMode || session?.lesson?.settings?.livePaceMode);
  const hostIndex = Math.max(0, Math.min(Number(session?.currentIndex) || 0, Math.max(blocks.length - 1, 0)));
  const maxReachableIndex = paceMode === LIVE_PACE_MODE.STUDENT_PACED
    ? Math.max(blocks.length - 1, 0)
    : hostIndex;
  const effectiveIndex = paceMode === LIVE_PACE_MODE.TEACHER_LED
    ? hostIndex
    : Math.max(0, Math.min(localIndex, maxReachableIndex));
  const currentBlock = useMemo(() => blocks[effectiveIndex] || null, [blocks, effectiveIndex]);
  const deadlineClosed = paceMode === LIVE_PACE_MODE.TEACHER_LED && Number(session?.questionDeadlineRemainingSeconds) === 0;
  const connectionBadge = useMemo(() => getConnectionBadge(status, isOffline), [isOffline, status]);
  const deadlineNotice = useMemo(() => {
    if (currentBlock?.type !== 'task') return null;
    return getDeadlineNotice(session?.questionDeadlineRemainingSeconds);
  }, [currentBlock?.type, session?.questionDeadlineRemainingSeconds]);
  const myTeam = session?.teamAssignments?.[playerId] || '';
  const isTeamCaptain = Boolean(myTeam && session?.captainsByTeam?.[myTeam] === playerId);
  const isPrivacyMode = session?.lesson?.settings?.livePrivacyMode === true;
  const liveTaskOptions = useMemo(() => {
    const settings = session?.lesson?.settings || {};
    return {
      allowRetry: settings.allowRetryLive === true,
      showCheckButton: settings.showCheckButtonLive === true,
      lockAfterSubmit: settings.lockAfterSubmitLive !== false,
      hideQuestionContent: settings.hideQuestionContentLive === true,
      forceLocked: deadlineClosed,
      lockMessage: deadlineClosed ? 'Time is up for this question. Responses are now closed.' : '',
    };
  }, [deadlineClosed, session]);

  const studentBalance = useMemo(() => {
    const settings = session?.lesson?.settings || {};
    if (!settings.liveBalanceEnabled) return null;
    const startCredits = Number(settings.liveBalanceStartCredits) || 100;
    const correctReward = Number(settings.liveBalanceCorrectReward) || 10;
    const wrongPenalty = Number(settings.liveBalanceWrongPenalty) || 5;
    const allowNegative = settings.liveBalanceAllowNegative !== false;
    let balance = startCredits;
    Object.values(results).forEach((result) => {
      if (!result) return;
      if (result.correct === true) balance += correctReward;
      else if (result.correct === false) balance -= wrongPenalty;
      if (!allowNegative && balance < 0) balance = 0;
    });
    return balance;
  }, [results, session]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    offlineRef.current = isOffline;
  }, [isOffline]);

  useEffect(() => {
    void ensureSession();
  }, []);

  useEffect(() => {
    if (!joined || !channelRef.current) return undefined;
    const id = window.setInterval(() => {
      const stale = Date.now() - lastSyncRef.current > 12000;
      if (stale) {
        setStatus('reconnecting');
        channelRef.current?.postMessage({ type: 'request_sync', playerId });
      }
      if (Date.now() - lastSyncRef.current > 26000) {
        setStatus('disconnected');
        setError('Connection to host was lost. Please check your network and try again.');
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [joined, playerId]);

  useEffect(() => {
    if (!joined || !channelRef.current) return undefined;
    const id = window.setInterval(() => {
      channelRef.current?.postMessage({ type: 'student_heartbeat', playerId, timestamp: Date.now() });
    }, 5000);
    return () => window.clearInterval(id);
  }, [joined, playerId]);

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      setLiveNotice('Network offline. New responses will be queued and replayed on reconnect.');
    };
    const handleOnline = () => {
      setIsOffline(false);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    if (!joined) return;
    if (paceMode === LIVE_PACE_MODE.TEACHER_LED) {
      setLocalIndex(hostIndex);
      return;
    }
    setLocalIndex((current) => Math.max(0, Math.min(current, maxReachableIndex)));
  }, [hostIndex, joined, maxReachableIndex, paceMode]);

  useEffect(() => {
    const sessionId = activeSessionRef.current || pin.trim();
    if (!sessionId) return;
    saveLocalQueuedUpdates(sessionId, playerId, offlineQueuedUpdates);
    if (offlineQueuedUpdates.length === 0) {
      setQueueReplayState('idle');
      setQueueReplayAttempt(0);
    }
  }, [offlineQueuedUpdates, pin, playerId]);

  useEffect(() => {
    if (offlineQueuedUpdates.length === 0) return undefined;
    if (status !== 'connected' || isOffline || !channelRef.current || !joinAckRef.current) return undefined;
    if (replayTimerRef.current) return undefined;

    const sessionId = activeSessionRef.current || pin.trim();
    const replayCount = queueReplayAttempt + 1;
    const replayedAt = Date.now();

    setQueueReplayState('replaying');
    setQueueReplayAttempt(replayCount);
    setLiveNotice(`Replaying ${offlineQueuedUpdates.length} queued update${offlineQueuedUpdates.length === 1 ? '' : 's'} (attempt ${replayCount}).`);

    offlineQueuedUpdates.forEach((payload) => {
      channelRef.current?.postMessage({
        ...payload,
        mode: payload.mode === 'submit' ? 'submit' : 'change',
        replayed: true,
        replayAttempt: replayCount,
        timestamp: replayedAt,
      });
    });

    replayTimerRef.current = window.setTimeout(() => {
      replayTimerRef.current = null;
      if (offlineRef.current || statusRef.current !== 'connected') {
        setQueueReplayState('pending');
        return;
      }

      const channelMode = String(channelRef.current?.mode || '').toLowerCase();
      if (channelMode !== 'supabase') {
        setOfflineQueuedUpdates([]);
        setQueueReplayState('verified');
        setLiveNotice(`Synced ${offlineQueuedUpdates.length} queued update${offlineQueuedUpdates.length === 1 ? '' : 's'}.`);
        return;
      }

      void fetchStudentResponses(sessionId, playerId).then((remoteResponses) => {
        const remoteKeys = new Set(Object.keys(remoteResponses || {}));
        setOfflineQueuedUpdates((current) => {
          const remaining = current.filter((entry) => !remoteKeys.has(entry.blockId));
          if (remaining.length === 0) {
            setQueueReplayState('verified');
            setLiveNotice(`Synced ${current.length} queued update${current.length === 1 ? '' : 's'}.`);
            return [];
          }
          setQueueReplayState('pending');
          setLiveNotice(`${remaining.length} queued update${remaining.length === 1 ? '' : 's'} still pending. Retry will continue automatically.`);
          return remaining;
        });
      }).catch(() => {
        setQueueReplayState('pending');
        setLiveNotice(`Replay attempt ${replayCount} sent. Waiting for confirmation before clearing queued updates.`);
      });
    }, 1600);

    return () => {
      if (replayTimerRef.current) {
        window.clearTimeout(replayTimerRef.current);
        replayTimerRef.current = null;
      }
    };
  }, [isOffline, offlineQueuedUpdates, pin, playerId, queueReplayAttempt, status]);

  const sendResponseUpdate = (sessionId, blockId, result, mode = 'submit') => {
    if (deadlineClosed && mode !== 'restore') {
      setLiveNotice('Time is up for this question. Your response was not submitted.');
      return;
    }

    const answerPayload = result?.response ?? result ?? null;
    const answerSignature = JSON.stringify(answerPayload);
    const signatureKey = `${blockId}:${mode}`;
    if (lastSignatureRef.current[signatureKey] === answerSignature) return;
    lastSignatureRef.current[signatureKey] = answerSignature;

    setResults((current) => {
      const next = {
        ...current,
        [blockId]: {
          ...(current[blockId] || {}),
          ...(result || {}),
          answer: answerPayload,
          taskId: blockId,
          timestamp: Date.now(),
          submitMode: mode,
        },
      };
      if (sessionId) saveLocalResponses(sessionId, playerId, next);
      return next;
    });

    const payload = {
      type: 'response_update',
      sessionId,
      playerId,
      name: name.trim(),
      blockId,
      mode,
      result: {
        ...(result || {}),
        answer: answerPayload,
        taskId: blockId,
        timestamp: Date.now(),
      },
      timestamp: Date.now(),
    };

    const shouldQueue = isOffline || status === 'disconnected' || status === 'reconnecting' || status === 'host-not-found' || !joinAckRef.current;
    if (shouldQueue) {
      setOfflineQueuedUpdates((current) => {
        const deduped = current.filter((entry) => entry.blockId !== blockId);
        const next = [...deduped, payload];
        setQueueReplayState('pending');
        setLiveNotice(`Offline queue: ${next.length} pending update${next.length === 1 ? '' : 's'}.`);
        return next;
      });
      return;
    }

    channelRef.current?.postMessage(payload);
  };

  const handleJoin = () => {
    if (!supportsConfiguredLiveTransport(typeof window !== 'undefined' ? window.location.search : '')) {
      setError('No compatible live transport is available. Check your environment configuration in Settings.');
      return;
    }
    if (!pin.trim() || !name.trim()) return;
    const sessionId = pin.trim();
    activeSessionRef.current = sessionId;
    const ch = createLiveChannel({
      sessionId,
      role: 'student',
      playerId,
      name: name.trim(),
      onStatus: (next) => {
        if (next?.mode) setTransportMode(next.mode);
        if (next?.state === 'error' && next.error) setError(next.error);
        if (next?.state === 'disconnected') setStatus('reconnecting');
      },
    });
    if (!ch) {
      setError('Unable to connect to this session. Please try again.');
      return;
    }

    channelRef.current = ch;
    joinAckRef.current = false;
    lastSignatureRef.current = {};
    setError('');
    setTransportMode(ch.mode || transportMode);

    const localResponses = loadLocalResponses(sessionId, playerId);
    if (Object.keys(localResponses).length > 0) {
      setResults(localResponses);
    }

    const queuedResponses = loadLocalQueuedUpdates(sessionId, playerId);
    if (queuedResponses.length > 0) {
      setOfflineQueuedUpdates(queuedResponses);
      setQueueReplayState('pending');
      setLiveNotice(`${queuedResponses.length} queued update${queuedResponses.length === 1 ? '' : 's'} restored from this device and will retry after sync.`);
    } else {
      setOfflineQueuedUpdates([]);
      setQueueReplayState('idle');
    }

    void fetchStudentResponses(sessionId, playerId).then((remoteResponses) => {
      if (!remoteResponses || Object.keys(remoteResponses).length === 0) return;
      setResults((current) => {
        const merged = { ...remoteResponses, ...current };
        saveLocalResponses(sessionId, playerId, merged);
        return merged;
      });
    }).catch(() => {});

    ch.onmessage = (e) => {
      const msg = e.data;
      if (msg?.sessionId && msg.sessionId !== sessionId) return;
      if (msg.type === 'join_ack' && msg.playerId === playerId) {
        joinAckRef.current = true;
        setStatus('waiting-sync');
      }
      if (msg.type === 'sync') {
        if (msg.sessionId && msg.sessionId !== sessionId) return;
        lastSyncRef.current = Date.now();
        joinAckRef.current = true;
        setSession({
          lesson: msg.lesson,
          currentIndex: msg.currentIndex,
          participantCount: Number(msg.participantCount) || 0,
          autoModeRemainingSeconds: Number.isFinite(Number(msg.autoModeRemainingSeconds)) ? Number(msg.autoModeRemainingSeconds) : null,
          questionDeadlineRemainingSeconds: Number.isFinite(Number(msg.questionDeadlineRemainingSeconds)) ? Number(msg.questionDeadlineRemainingSeconds) : null,
          paceMode: normalizeLivePaceMode(msg.paceMode || msg.lesson?.settings?.livePaceMode),
          teamAssignments: msg.teamAssignments && typeof msg.teamAssignments === 'object' ? msg.teamAssignments : {},
          captainsByTeam: msg.captainsByTeam && typeof msg.captainsByTeam === 'object' ? msg.captainsByTeam : {},
          spotlight: msg.spotlight || null,
          timestamp: msg.timestamp || Date.now(),
        });
        if (Number(msg.questionDeadlineRemainingSeconds) > 0) {
          setLiveNotice('');
        }
        if (normalizeLivePaceMode(msg.paceMode || msg.lesson?.settings?.livePaceMode) === LIVE_PACE_MODE.TEACHER_LED) {
          setLocalIndex(Math.max(0, Number(msg.currentIndex) || 0));
        }
        setPhase(msg.phase === 'finished' ? PHASE.FINISHED : msg.phase === 'running' ? PHASE.RUNNING : PHASE.WAITING);
        setStatus('connected');
      }
      if (msg.type === 'question_skipped') {
        const reason = String(msg.reason || 'No reason provided.');
        setLiveNotice(`Teacher skipped this question: ${reason}`);
      }
      if (msg.type === 'question_reopened') {
        const reason = String(msg.reason || 'No reason provided.');
        const blockNumber = Number(msg.blockIndex) >= 0 ? Number(msg.blockIndex) + 1 : null;
        const blockLabel = String(msg.blockLabel || '').trim();
        const targetLabel = blockNumber && blockLabel
          ? `Q${blockNumber} ${blockLabel}`
          : blockNumber
            ? `Q${blockNumber}`
            : 'the previous question';
        setLiveNotice(`Teacher re-opened ${targetLabel}: ${reason}`);
      }
      if (msg.type === 'spotlight_answer' && msg.spotlight) {
        setSession((current) => (current ? { ...current, spotlight: msg.spotlight } : current));
        setLiveNotice(`Spotlight: ${msg.spotlight.studentName || 'Student'} on ${msg.spotlight.blockLabel || 'current question'}.`);
      }
      if (msg.type === 'spotlight_cleared') {
        setSession((current) => (current ? { ...current, spotlight: null } : current));
      }
      if (msg.type === 'response_rejected' && msg.playerId === playerId && msg.reason === 'deadline_reached') {
        setLiveNotice('Submission window closed. Your late response was not accepted.');
      }
      if (msg.type === 'heartbeat') {
        lastSyncRef.current = Date.now();
        if (!session) ch.postMessage({ type: 'request_sync', sessionId, playerId });
      }
      if (msg.type === 'host-exit') {
        setStatus('host-left');
        setPhase(PHASE.FINISHED);
      }
    };

    ch.postMessage({ type: 'join', sessionId, playerId, name: name.trim() });
    ch.postMessage({ type: 'request_sync', sessionId, playerId });

    // Replay local answers so host dashboard restores immediately on reconnect.
    Object.entries(localResponses).forEach(([blockId, result]) => {
      ch.postMessage({
        type: 'response_update',
        sessionId,
        playerId,
        name: name.trim(),
        blockId,
        mode: 'restore',
        result,
        timestamp: Date.now(),
      });
    });

    lastSyncRef.current = Date.now();
    setStatus('joining');
    recordDebugEvent('live_join_attempt', { pin: sessionId, playerId, name: name.trim(), transport: ch.mode || transportMode });
    setJoined(true);

    if (joinTimeoutRef.current) window.clearTimeout(joinTimeoutRef.current);
    joinTimeoutRef.current = window.setTimeout(() => {
      if (!joinAckRef.current) {
        setStatus('host-not-found');
        setError('Host not found for this session. Local mode requires host and join in the same browser/origin context.');
      }
    }, 7000);
  };

  useEffect(() => {
    return () => {
      if (joinTimeoutRef.current) window.clearTimeout(joinTimeoutRef.current);
      if (replayTimerRef.current) window.clearTimeout(replayTimerRef.current);
      channelRef.current?.postMessage({ type: 'leave', sessionId: activeSessionRef.current || pin.trim(), playerId });
      channelRef.current?.close();
    };
  }, [pin, playerId]);

  const handleComplete = (blockId, result) => {
    sendResponseUpdate(activeSessionRef.current || pin.trim(), blockId, result, 'submit');
  };

  const handleProgress = (blockId, result) => {
    sendResponseUpdate(activeSessionRef.current || pin.trim(), blockId, result, 'change');
  };

  if (!joined) {
    const handlePinDigit = (index, value) => {
      const digit = value.replace(/\D/g, '').slice(-1);
      const next = [...pinDigits];
      next[index] = digit;
      setPinDigits(next);
      setPin(next.join(''));
      if (digit && index < 5) {
        pinInputRefs.current[index + 1]?.focus();
      }
    };
    const handlePinKeyDown = (index, e) => {
      if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
        pinInputRefs.current[index - 1]?.focus();
      }
      if (e.key === 'Enter' && pin.length >= 6 && name.trim()) {
        handleJoin();
      }
    };
    const handlePinPaste = (e) => {
      const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      if (pasted.length >= 1) {
        e.preventDefault();
        const next = [pasted[0] || '', pasted[1] || '', pasted[2] || '', pasted[3] || '', pasted[4] || '', pasted[5] || ''];
        setPinDigits(next);
        setPin(next.join(''));
        if (pasted.length >= 6) {
          pinInputRefs.current[5]?.blur();
        } else {
          pinInputRefs.current[Math.min(pasted.length, 5)]?.focus();
        }
      }
    };

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-white">
        <div className="w-full max-w-xs">
          <div className="mb-6 text-center text-xl font-bold">Join a live session</div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Session PIN</div>
          <div className="mb-4 flex items-center justify-center gap-2" onPaste={handlePinPaste}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <input
                key={i}
                ref={(el) => { pinInputRefs.current[i] = el; }}
                value={pinDigits[i]}
                onChange={(e) => handlePinDigit(i, e.target.value)}
                onKeyDown={(e) => handlePinKeyDown(i, e)}
                className="pin-digit-input"
                inputMode="numeric"
                maxLength={1}
                aria-label={`PIN digit ${i + 1}`}
                autoFocus={i === 0 && !initialSessionId}
              />
            ))}
          </div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Your name</span>
            <button type="button" onClick={() => setName(generateNickname())} className="text-[10px] text-zinc-500 hover:text-zinc-300" aria-label="Generate new random nickname">New name</button>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            aria-label="Your name for this session"
            className="mb-1 w-full border border-zinc-700 bg-zinc-900 px-4 py-3 text-center text-sm outline-none focus:border-white"
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            autoFocus={!!initialSessionId}
          />
          <div className="mb-4 text-center text-[10px] text-zinc-500">Your teacher will see this name on the results board.</div>
          {error && <div className="mb-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}
          <button type="button" onClick={handleJoin} disabled={pin.length < 6 || !name.trim()} className="action-primary w-full px-4 py-3 text-sm font-bold disabled:opacity-30">
            Join Session
          </button>
          <button type="button" onClick={onExit} className="mt-3 w-full text-center text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2.5 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold">{name}</span>
          <PrivacyDot state="shared" />
          <span className={`shrink-0 border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em] ${connectionBadge.className}`}>{connectionBadge.label}</span>
          {myTeam && <span className="shrink-0 border border-sky-700 bg-sky-900/30 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-sky-300">{myTeam}</span>}
          {isTeamCaptain && <span className="shrink-0 border border-amber-600 bg-amber-900/30 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-amber-300">Captain</span>}
        </div>
        <button type="button" onClick={onExit} className="shrink-0 text-xs text-zinc-500 hover:text-white">Leave</button>
      </header>

      <main className={`flex flex-1 flex-col items-center overflow-x-hidden p-4 sm:p-6 ${phase === PHASE.RUNNING ? 'justify-start overflow-y-auto' : 'justify-center'}`}>
        {phase === PHASE.WAITING && (
          <div className="w-full max-w-xl text-center">
            <div className="text-lg font-semibold">You're in!</div>
            <div className="mt-2 text-sm text-zinc-400">Waiting for the host to start the live lesson…</div>
            <div className="mt-2 text-xs text-zinc-500">Current participants: {Number(session?.participantCount) || 0}</div>
            {isPrivacyMode && <div className="mt-3 border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-300">Privacy mode is active — random safe names are assigned.</div>}
            <div className="mt-6 border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">As soon as the teacher advances, you will receive the same slide or task instantly.</div>
          </div>
        )}

        {phase === PHASE.RUNNING && (
          <div className="w-full max-w-6xl pb-8 text-zinc-900 [&_input]:text-zinc-900 [&_textarea]:text-zinc-900 [&_select]:text-zinc-900">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
              <span>Block {Math.min(effectiveIndex + 1, Math.max(blocks.length, 1))} / {blocks.length || 1}</span>
              <div className="h-1.5 flex-1 bg-zinc-800 sm:max-w-[200px]"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${blocks.length > 0 ? ((effectiveIndex + 1) / blocks.length) * 100 : 0}%` }} /></div>
              {studentBalance !== null && <span className="ml-auto border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs font-medium text-amber-300">{studentBalance} cr</span>}
            </div>
            {session?.autoModeRemainingSeconds !== null && session?.autoModeRemainingSeconds !== undefined && (
              <div className="mb-2 text-xs text-zinc-500">Auto mode time remaining: {Math.max(0, Number(session.autoModeRemainingSeconds) || 0)}s</div>
            )}
            {deadlineNotice && (
              <div className={`mb-3 border px-3 py-2 text-xs ${deadlineNotice.className}`}>
                <div className="font-semibold uppercase tracking-[0.12em]">{deadlineNotice.title}</div>
                <div className="mt-1">{deadlineNotice.detail}</div>
              </div>
            )}
            {liveNotice && (
              <div className="mb-3 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">{liveNotice}</div>
            )}
            {session?.spotlight && (
              <div className="mb-3 border border-violet-300 bg-violet-50 px-3 py-2 text-xs text-violet-800">
                Spotlight: {session.spotlight.studentName || 'Student'} on {session.spotlight.blockLabel || 'current question'}.
                <div className="mt-1 whitespace-pre-wrap">{typeof session.spotlight.answer === 'string' ? session.spotlight.answer : JSON.stringify(session.spotlight.answer)}</div>
              </div>
            )}
            {paceMode !== LIVE_PACE_MODE.TEACHER_LED && (
              <div className="mb-3 flex flex-wrap items-center gap-2 border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
                <span>You can navigate at your own pace.</span>
                <button
                  type="button"
                  onClick={() => setLocalIndex((current) => Math.max(0, current - 1))}
                  disabled={effectiveIndex <= 0}
                  className="min-h-[44px] min-w-[44px] border border-zinc-300 bg-white px-3 py-2 text-sm uppercase tracking-[0.12em] disabled:opacity-40"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setLocalIndex((current) => Math.min(maxReachableIndex, current + 1))}
                  disabled={effectiveIndex >= maxReachableIndex}
                  className="min-h-[44px] min-w-[44px] border border-zinc-300 bg-white px-3 py-2 text-sm uppercase tracking-[0.12em] disabled:opacity-40"
                >
                  Next
                </button>
                <span className="ml-auto text-zinc-500">Unlocked: {maxReachableIndex + 1}/{blocks.length || 1}</span>
              </div>
            )}
            {offlineQueuedUpdates.length > 0 && (
              <div className="mb-3 border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <div>
                  {offlineQueuedUpdates.length} response update{offlineQueuedUpdates.length === 1 ? '' : 's'} queued.
                  {queueReplayState === 'replaying'
                    ? ` Replay attempt ${queueReplayAttempt} is in progress now.`
                    : ' They are stored on this device and will retry automatically once connection is restored.'}
                </div>
                {queueReplayState === 'pending' && (
                  <div className="mt-1 text-amber-700">Waiting for a stable connection before clearing the local queue.</div>
                )}
              </div>
            )}
            <LessonStage
              blocks={blocks}
              currentIndex={effectiveIndex}
              results={results}
              onCompleteBlock={handleComplete}
              onProgressBlock={handleProgress}
              emptyMessage="The teacher advanced to a block that is currently unavailable."
              taskOptions={liveTaskOptions}
            />
          </div>
        )}

        {phase === PHASE.FINISHED && (
          <div className="w-full max-w-md text-center">
            <div className="mb-2 text-3xl font-black">Well done!</div>
            <div className="mb-6 text-sm text-zinc-400">Lesson complete. Your responses are saved.</div>
            <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
              <div className="border border-zinc-800 bg-zinc-900 px-3 py-3">
                <div className="text-zinc-500">Answered</div>
                <div className="mt-1 text-lg font-bold text-white">{Object.keys(results).length}</div>
              </div>
              {studentBalance !== null ? (
                <div className="border border-zinc-800 bg-zinc-900 px-3 py-3">
                  <div className="text-zinc-500">Credits</div>
                  <div className={`mt-1 text-lg font-bold ${studentBalance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{studentBalance}</div>
                </div>
              ) : (
                <div className="border border-zinc-800 bg-zinc-900 px-3 py-3">
                  <div className="text-zinc-500">Blocks</div>
                  <div className="mt-1 text-lg font-bold text-white">{blocks.length}</div>
                </div>
              )}
            </div>
            {status === 'host-left' && (
              <div className="border border-zinc-800 bg-zinc-900 px-4 py-3 text-xs text-zinc-500">The host closed the live session.</div>
            )}
            <button type="button" onClick={onExit} className="mt-6 border border-zinc-700 px-6 py-2.5 text-sm text-zinc-300 hover:text-white">Back</button>
          </div>
        )}
      </main>
    </div>
  );
}
