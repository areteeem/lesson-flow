import { useEffect, useMemo, useRef, useState } from 'react';
import LessonStage from './LessonStage';
import { normalizeVisibleBlocks } from '../utils/lesson';
import { recordDebugEvent } from '../utils/debug';
import { getLiveSessionIdFromSearch, getLiveTransportLabel, supportsConfiguredLiveTransport } from '../utils/liveTransport';
import { createLiveChannel } from '../utils/liveChannel';
import { ensureSession } from '../utils/accountAuth';
import { fetchStudentResponses } from '../utils/liveSupabaseData';

const PHASE = { WAITING: 'waiting', RUNNING: 'running', FINISHED: 'finished' };

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
    localStorage.setItem(getLocalResponseKey(sessionId, playerId), JSON.stringify(responses || {}));
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
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [phase, setPhase] = useState(PHASE.WAITING);
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('idle');
  const [results, setResults] = useState({});
  const [error, setError] = useState('');
  const [transportMode, setTransportMode] = useState(() => (typeof window !== 'undefined' ? getLiveTransportLabel(window.location.search) : 'broadcast-local'));

  const channelRef = useRef(null);
  const activeSessionRef = useRef('');
  const lastSignatureRef = useRef({});
  const lastSyncRef = useRef(0);
  const joinAckRef = useRef(false);
  const joinTimeoutRef = useRef(null);

  const blocks = useMemo(() => normalizeVisibleBlocks(session?.lesson?.blocks || []), [session]);

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
        setError('Connection to host was lost. In local mode, host and join must stay in the same browser environment.');
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

  const sendResponseUpdate = (sessionId, blockId, result, mode = 'submit') => {
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

    channelRef.current?.postMessage({
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
    });
  };

  const handleJoin = () => {
    if (!supportsConfiguredLiveTransport(typeof window !== 'undefined' ? window.location.search : '')) {
      setError('No compatible live transport is available. Configure Supabase transport with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, or use BroadcastChannel fallback.');
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
      setError('Unable to start live transport for this session.');
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

    void fetchStudentResponses(sessionId, playerId).then((remoteResponses) => {
      if (!remoteResponses || Object.keys(remoteResponses).length === 0) return;
      setResults((current) => {
        const merged = { ...remoteResponses, ...current };
        saveLocalResponses(sessionId, playerId, merged);
        return merged;
      });
    });

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
        setSession({ lesson: msg.lesson, currentIndex: msg.currentIndex, timestamp: msg.timestamp || Date.now() });
        setPhase(msg.phase === 'finished' ? PHASE.FINISHED : msg.phase === 'running' ? PHASE.RUNNING : PHASE.WAITING);
        setStatus('connected');
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
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-white">
        <div className="w-full max-w-xs">
          <div className="mb-6 text-center text-xl font-bold">Join Quiz</div>
          <input value={pin} onChange={(e) => setPin(e.target.value.trim().slice(0, 20))} placeholder="Session code" className="mb-3 w-full border border-zinc-700 bg-zinc-900 px-4 py-3 text-center text-2xl font-bold tracking-widest outline-none focus:border-white" maxLength={20} autoFocus />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="mb-4 w-full border border-zinc-700 bg-zinc-900 px-4 py-3 text-center text-sm outline-none focus:border-white" onKeyDown={(e) => e.key === 'Enter' && handleJoin()} />
          {error && <div className="mb-4 border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">{error}</div>}
          <button type="button" onClick={handleJoin} disabled={pin.length < 4 || !name.trim()} className="w-full border border-white bg-white px-4 py-3 text-sm font-bold text-zinc-900 disabled:opacity-30">
            Join
          </button>
          <button type="button" onClick={onExit} className="mt-3 w-full text-center text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{name}</span>
          <span className="border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-zinc-400">{transportMode}</span>
          <span className="border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-zinc-400">{status}</span>
        </div>
        <button type="button" onClick={onExit} className="text-xs text-zinc-500 hover:text-white">Leave</button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-6">
        {phase === PHASE.WAITING && (
          <div className="w-full max-w-xl text-center">
            <div className="text-lg font-semibold">You're in!</div>
            <div className="mt-2 text-sm text-zinc-400">Waiting for the host to start the live lesson…</div>
            <div className="mt-6 border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">As soon as the teacher advances, you will receive the same slide or task instantly. Current transport: <span className="font-medium text-zinc-200">{transportMode}</span>.</div>
          </div>
        )}

        {phase === PHASE.RUNNING && (
          <div className="w-full max-w-6xl">
            <div className="mb-4 text-sm text-zinc-400">Live block {Math.min((session?.currentIndex ?? 0) + 1, Math.max(blocks.length, 1))} / {blocks.length || 1}</div>
            <LessonStage blocks={blocks} currentIndex={session?.currentIndex || 0} results={results} onCompleteBlock={handleComplete} onProgressBlock={handleProgress} emptyMessage="The teacher advanced to a block that is currently unavailable." />
          </div>
        )}

        {phase === PHASE.FINISHED && (
          <div className="w-full max-w-md text-center">
            <div className="mb-2 text-2xl font-black">Lesson complete</div>
            <div className="mb-6 text-lg text-zinc-400">Your local responses are preserved for this session.</div>
            <div className="border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
              Completed interactions: <strong>{Object.keys(results).length}</strong>
              {status === 'host-left' && <div className="mt-2 text-xs text-zinc-500">The host closed the live session.</div>}
            </div>
            <button type="button" onClick={onExit} className="mt-6 border border-zinc-700 px-6 py-2 text-sm text-zinc-300 hover:text-white">Back</button>
          </div>
        )}
      </main>
    </div>
  );
}
