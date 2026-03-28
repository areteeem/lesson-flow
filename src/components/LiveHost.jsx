import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LessonStage from './LessonStage';
import { getBlockLabel, getTaskBlocks, getTaskPoints, isGradableTask, validateLessonStructure } from '../utils/lesson';
import { recordDebugEvent } from '../utils/debug';
import { normalizeScore } from '../utils/grading';
import { buildLiveJoinUrl, buildLiveQrUrl, createLiveSessionId, getLiveSessionIdFromSearch, getLiveTransportLabel, supportsConfiguredLiveTransport } from '../utils/liveTransport';
import { createLiveChannel } from '../utils/liveChannel';
import { deleteManualScores, fetchManualScores, persistManualScore } from '../utils/liveSupabaseData';

const PHASE = { LOBBY: 'lobby', RUNNING: 'running', FINISHED: 'finished' };

export default function LiveHost({ lesson, onExit }) {
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
  const stateRef = useRef({ phase: PHASE.LOBBY, currentIndex: 0, lessonPayload: null });

  const blocks = validation.blocks;
  const lessonPayload = useMemo(() => ({
    id: lesson?.id || 'live-lesson',
    title: lesson?.title || 'Live Lesson',
    settings: lesson?.settings || {},
    blocks,
  }), [blocks, lesson?.id, lesson?.settings, lesson?.title]);

  const [phase, setPhase] = useState(PHASE.LOBBY);
  const [students, setStudents] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [reviewStudentId, setReviewStudentId] = useState('');
  const [manualPoints, setManualPoints] = useState({});
  const [transportStatus, setTransportStatus] = useState('connecting');
  const [transportMode, setTransportMode] = useState(() => (typeof window !== 'undefined' ? getLiveTransportLabel(window.location.search) : 'broadcast-local'));
  const [transportError, setTransportError] = useState('');
  const currentBlock = blocks[currentIndex] || null;

  const joinUrl = useMemo(() => buildLiveJoinUrl(sessionId), [sessionId]);
  const qrUrl = useMemo(() => buildLiveQrUrl(joinUrl), [joinUrl]);
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
    stateRef.current = { phase, currentIndex, lessonPayload };
  }, [phase, currentIndex, lessonPayload]);

  const broadcast = useCallback((msg) => {
    channelRef.current?.postMessage(msg);
  }, []);

  const broadcastSnapshot = useCallback((nextPhase = phase, nextIndex = currentIndex) => {
    broadcast({
      type: 'sync',
      phase: nextPhase,
      currentIndex: nextIndex,
      lesson: lessonPayload,
      timestamp: Date.now(),
    });
  }, [broadcast, currentIndex, lessonPayload, phase]);

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
        ch.postMessage({ type: 'sync', sessionId, phase: snapshot.phase, currentIndex: snapshot.currentIndex, lesson: snapshot.lessonPayload, timestamp: Date.now() });
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
        ch.postMessage({ type: 'sync', sessionId, playerId: hostPlayerId, phase: snapshot.phase, currentIndex: snapshot.currentIndex, lesson: snapshot.lessonPayload, timestamp: Date.now() });
      }
      if (msg.type === 'student_heartbeat' && msg.playerId) {
        updateStudent(msg.playerId, (current) => ({ ...current, lastSeen: Date.now() }));
      }
      if (msg.type === 'response_update' && msg.playerId && msg.blockId) {
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
    setPhase(PHASE.RUNNING);
  };

  const finishSession = () => {
    recordDebugEvent('live_host_finish', { pin, lessonId: lesson?.id || null, totalBlocks: blocks.length });
    setPhase(PHASE.FINISHED);
  };

  const goPrev = () => setCurrentIndex((value) => Math.max(0, value - 1));
  const goNext = () => {
    if (currentIndex >= blocks.length - 1) {
      finishSession();
      return;
    }
    setCurrentIndex((value) => Math.min(blocks.length - 1, value + 1));
  };

  const playerCount = Object.keys(students).length;
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
    });
    return () => {
      cancelled = true;
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

  if (!supportsLive || validation.issues.length > 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white">
        <div className="text-xl font-bold">Live mode pre-check failed</div>
        <div className="mt-2 max-w-xl px-6 text-center text-sm text-zinc-400">The app stayed stable and refused to start a broken live session.</div>
        <div className="mt-5 w-full max-w-2xl space-y-2 px-6">
          {!supportsLive && <div className="border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">No compatible live transport is available. Configure `VITE_LIVE_TRANSPORT=supabase` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, or use local BroadcastChannel mode.</div>}
          {transportError && <div className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{transportError}</div>}
          {validation.issues.map((issue) => <div key={issue} className="border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{issue}</div>)}
        </div>
        <button type="button" onClick={onExit} className="mt-6 border border-zinc-700 px-4 py-2 text-sm">Back</button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="text-sm font-semibold">{lesson?.title || 'Live Lesson'}</div>
          <span className="border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-mono tracking-wider">PIN: {pin}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-zinc-400">{transportMode}</span>
          <span className="text-xs text-zinc-400">{playerCount} player{playerCount !== 1 ? 's' : ''}</span>
          <button type="button" onClick={onExit} className="border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:text-white">Exit</button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-6">
        {phase === PHASE.LOBBY && (
          <div className="w-full max-w-lg text-center">
            <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Game PIN</div>
            <div className="mt-2 text-5xl font-black tracking-wider sm:text-6xl">{pin}</div>
            <div className="mt-4 text-sm text-zinc-400">Share this PIN with your students. Current transport: <span className="font-medium text-zinc-200">{transportMode}</span> ({transportStatus}).</div>
            <div className="mt-6 grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-start">
              <img src={qrUrl} alt="Join QR" className="mx-auto h-[220px] w-[220px] border border-zinc-700 bg-white p-2" />
              <div className="space-y-2 text-left">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Join Link</div>
                <div className="break-all border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">{joinUrl}</div>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(joinUrl)}
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
            <button type="button" onClick={startSession} disabled={playerCount === 0} className="mt-8 border border-white bg-white px-8 py-3 text-sm font-bold text-zinc-900 disabled:opacity-30">
              Start live lesson
            </button>
          </div>
        )}

        {phase === PHASE.RUNNING && (
          <div className="w-full max-w-6xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Teacher Control</div>
                <div className="mt-1 text-sm text-zinc-300">Block {currentIndex + 1} of {blocks.length}: {currentBlock ? getBlockLabel(currentBlock, currentIndex) : 'Unavailable block'}</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={goPrev} disabled={currentIndex === 0} className="border border-zinc-700 px-4 py-2 text-sm text-zinc-200 disabled:opacity-30">Back</button>
                <button type="button" onClick={goNext} className="border border-white bg-white px-4 py-2 text-sm font-bold text-zinc-900">{currentIndex === blocks.length - 1 ? 'Finish' : 'Next'}</button>
              </div>
            </div>
            <LessonStage blocks={blocks} currentIndex={currentIndex} results={{}} onCompleteBlock={() => {}} emptyMessage="The live session stayed connected, but this block is unavailable." />
          </div>
        )}

        {phase === PHASE.FINISHED && (
          <div className="w-full max-w-md text-center">
            <div className="mb-6 text-2xl font-black">Live lesson complete</div>
            <div className="mb-4 text-sm text-zinc-400">Students have reached the safe final state. The host can exit cleanly at any time.</div>
            <div className="mb-4 grid grid-cols-3 gap-2 text-xs">
              <div className="border border-zinc-700 bg-zinc-900 px-3 py-2"><div className="text-zinc-500">Avg Score</div><div className="mt-1 text-sm text-white">{classStats.avgPct}%</div></div>
              <div className="border border-zinc-700 bg-zinc-900 px-3 py-2"><div className="text-zinc-500">Completion</div><div className="mt-1 text-sm text-white">{classStats.avgCompleted}%</div></div>
              <div className="border border-zinc-700 bg-zinc-900 px-3 py-2"><div className="text-zinc-500">Responses</div><div className="mt-1 text-sm text-white">{classStats.submissions}</div></div>
            </div>
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
