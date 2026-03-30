import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LessonStage from './LessonStage';
import { getBlockLabel, getTaskBlocks, getTaskPoints, isGradableTask, validateLessonStructure } from '../utils/lesson';
import { recordDebugEvent } from '../utils/debug';
import { normalizeScore } from '../utils/grading';
import { buildLiveJoinUrl, buildLiveQrUrl, createLiveSessionId, getLiveSessionIdFromSearch, getLiveTransportLabel, supportsConfiguredLiveTransport } from '../utils/liveTransport';
import { createLiveChannel } from '../utils/liveChannel';
import { deleteManualScores, fetchManualScores, fetchSessionResponses, persistManualScore } from '../utils/liveSupabaseData';
import { ensureSession } from '../utils/accountAuth';

const PHASE = { LOBBY: 'lobby', RUNNING: 'running', FINISHED: 'finished' };

function normalizeAnswerForBucket(answer) {
  if (answer === null || answer === undefined || answer === '') return '(empty)';
  if (typeof answer === 'string' || typeof answer === 'number' || typeof answer === 'boolean') return String(answer);
  try {
    return JSON.stringify(answer);
  } catch {
    return String(answer);
  }
}

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
  const [hostTab, setHostTab] = useState('live');
  const [expandedStudentId, setExpandedStudentId] = useState('');
  const [manualPoints, setManualPoints] = useState({});
  const [transportStatus, setTransportStatus] = useState('connecting');
  const [transportMode, setTransportMode] = useState(() => (typeof window !== 'undefined' ? getLiveTransportLabel(window.location.search) : 'broadcast-local'));
  const [transportError, setTransportError] = useState('');
  const currentBlock = blocks[currentIndex] || null;

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
        answers,
      };
    });
  }, [students, allTaskBlocks, computeStudentStats]);

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
          <div className="ml-1 flex items-center gap-1 border border-zinc-700 bg-zinc-900 p-0.5">
            <button type="button" onClick={() => setHostTab('live')} className={`px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${hostTab === 'live' ? 'bg-white text-zinc-900' : 'text-zinc-400'}`}>
              Live
            </button>
            <button type="button" onClick={() => setHostTab('results')} className={`px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${hostTab === 'results' ? 'bg-white text-zinc-900' : 'text-zinc-400'}`}>
              Results
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-zinc-400">{transportMode}</span>
          <span className="text-xs text-zinc-400">{playerCount} player{playerCount !== 1 ? 's' : ''}</span>
          <button type="button" onClick={onExit} className="border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:text-white">Exit</button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center p-4 sm:p-6">
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
                          <td className="px-3 py-2">{answeredCount}/{allTaskBlocks.length}</td>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => setExpandedStudentId(isExpanded ? '' : row.studentId)} className="border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400 hover:text-white">
                              {isExpanded ? 'Hide' : 'Show'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-t border-zinc-800 bg-zinc-950/40">
                            <td colSpan={4} className="px-3 py-3">
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

        {hostTab === 'live' && phase === PHASE.RUNNING && (
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

        {hostTab === 'live' && phase === PHASE.FINISHED && (
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
