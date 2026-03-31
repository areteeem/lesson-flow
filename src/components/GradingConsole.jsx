import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSessionsFromCloud, getGradingCloudAvailability } from '../utils/gradingCloud';
import { fetchAssignmentSubmissionsForOwner } from '../utils/lessonAssignments';
import { createResultShareLink } from '../utils/resultSharing';

function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, toNumber(value, 0)));
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

  return {
    id: String(session?.id || session?.cloudSessionId || `session-${crypto.randomUUID()}`),
    lessonId: session?.lessonId ? String(session.lessonId) : null,
    lessonTitle: String(session?.lessonTitle || 'Untitled Lesson'),
    studentName: String(session?.studentName || 'Anonymous').trim() || 'Anonymous',
    timestamp: toNumber(session?.timestamp, Date.now()),
    origin: String(session?.origin || session?.sourceType || 'local'),
    score,
    total,
    earned,
    breakdown,
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

  const columns = [...columnMap.values()];
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
        cellMap,
      };
    });

  return { columns, rows };
}

function StudentAnswerCard({ entry }) {
  const tone = entry.correct === true
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : entry.correct === false
      ? 'border-red-200 bg-red-50 text-red-900'
      : 'border-zinc-200 bg-zinc-50 text-zinc-700';

  return (
    <div className={`border px-3 py-2 text-xs ${tone}`}>
      <div className="font-medium">{entry.label}</div>
      <div className="mt-1 text-[11px] opacity-80">{entry.taskType}</div>
      <div className="mt-2 whitespace-pre-wrap">{formatAnswer(entry.result)}</div>
    </div>
  );
}

export default function GradingConsole({
  sessions = [],
  onBack,
  initialLessonId = null,
  initialLessonTitle = null,
  requireLessonSelection = true,
}) {
  const [view, setView] = useState('students');
  const [selectedLessonKey, setSelectedLessonKey] = useState(() => keyFromInitialLesson(initialLessonId, initialLessonTitle));
  const [selectedStudent, setSelectedStudent] = useState('all');
  const [selectedQuestion, setSelectedQuestion] = useState('all');
  const [expandedStudent, setExpandedStudent] = useState('');
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudMessage, setCloudMessage] = useState('');
  const [cloudSessions, setCloudSessions] = useState([]);
  const [assignmentSessions, setAssignmentSessions] = useState([]);
  const [boardShareState, setBoardShareState] = useState('idle');
  const [boardShareLink, setBoardShareLink] = useState('');

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

    return [...byId.values()].sort((left, right) => right.timestamp - left.timestamp);
  }, [sessions, cloudSessions, assignmentSessions]);

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
    setView('students');
    setBoardShareState('idle');
    setBoardShareLink('');
  }, [selectedLessonKey]);

  const filteredSessions = useMemo(() => {
    return lessonSessions.filter((session) => selectedStudent === 'all' || session.studentName === selectedStudent);
  }, [lessonSessions, selectedStudent]);

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
        .map((entry) => ({
          sessionId: session.id,
          studentName: session.studentName,
          timestamp: session.timestamp,
          questionLabel: entry.label,
          taskType: entry.taskType,
          correct: entry.correct,
          score: Math.round(entry.score * 100),
          answer: formatAnswer(entry.result),
        }));
    }).sort((left, right) => right.timestamp - left.timestamp);
  }, [filteredSessions, selectedQuestion]);

  const board = useMemo(() => buildBoardFromSessions(filteredSessions), [filteredSessions]);

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
        studentName: row.studentName,
        origin: row.origin,
        overallScore: row.score,
        timestamp: row.timestamp,
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
              <button type="button" onClick={refreshCloudSessions} disabled={cloudLoading} className="border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-900 disabled:opacity-60">{cloudLoading ? 'Refreshing...' : 'Refresh'}</button>
              <button type="button" onClick={onBack} className="border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-900">Back</button>
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
            <button type="button" onClick={refreshCloudSessions} disabled={cloudLoading} className="border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-900 disabled:opacity-60">{cloudLoading ? 'Refreshing...' : 'Refresh'}</button>
            <button type="button" onClick={() => setSelectedLessonKey(null)} className="border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-900">Change lesson</button>
            <button type="button" onClick={onBack} className="border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-900">Back</button>
          </div>
        </header>

        <section className="border border-zinc-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Filter by student</span>
              <select value={selectedStudent} onChange={(event) => setSelectedStudent(event.target.value)} className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
                {studentOptions.map((student) => (
                  <option key={student} value={student}>{student === 'all' ? 'All students' : student}</option>
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
          </div>

          <div className="mt-4 inline-flex border border-zinc-200 bg-white p-0.5">
            <button type="button" onClick={() => setView('students')} className={view === 'students' ? 'bg-zinc-900 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-white' : 'px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-600 hover:bg-zinc-50'}>Students</button>
            <button type="button" onClick={() => setView('questions')} className={view === 'questions' ? 'bg-zinc-900 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-white' : 'px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-600 hover:bg-zinc-50'}>Questions</button>
            <button type="button" onClick={() => setView('board')} className={view === 'board' ? 'bg-zinc-900 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-white' : 'px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-600 hover:bg-zinc-50'}>Published board</button>
          </div>
        </section>

        {view === 'students' && (
          <section className="border border-zinc-200 bg-white p-4">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Students ({studentRows.length})</div>
            <div className="space-y-2">
              {studentRows.map((session) => {
                const expanded = expandedStudent === session.id;
                return (
                  <div key={session.id} className="border border-zinc-200">
                    <button type="button" onClick={() => setExpandedStudent(expanded ? '' : session.id)} className="grid w-full gap-2 px-3 py-3 text-left sm:grid-cols-[1fr_120px_150px_90px]">
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{session.studentName}</div>
                        <div className="text-[11px] text-zinc-500">{new Date(session.timestamp).toLocaleString()}</div>
                      </div>
                      <div className="text-sm text-zinc-700">Score: {session.score}%</div>
                      <div className="text-sm text-zinc-700">Questions: {session.breakdown.length}</div>
                      <div className="text-xs text-zinc-500">{expanded ? 'Hide' : 'View'}</div>
                    </button>
                    {expanded && (
                      <div className="border-t border-zinc-200 bg-zinc-50 p-3">
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {session.breakdown
                            .filter((entry) => selectedQuestion === 'all' || `${entry.taskType}::${entry.label}` === selectedQuestion)
                            .map((entry) => <StudentAnswerCard key={`${session.id}-${entry.id}`} entry={entry} />)}
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
            <div className="space-y-2">
              {questionRows.map((row, index) => {
                const tone = row.correct === true
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : row.correct === false
                    ? 'border-red-200 bg-red-50 text-red-900'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-700';
                return (
                  <div key={`${row.sessionId}-${index}`} className={`border px-3 py-3 ${tone}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold">{row.studentName}</div>
                      <div className="text-xs">{row.score}%</div>
                    </div>
                    <div className="mt-1 text-[11px] opacity-80">{row.questionLabel} ({row.taskType})</div>
                    <div className="mt-2 whitespace-pre-wrap text-sm">{row.answer}</div>
                  </div>
                );
              })}
              {questionRows.length === 0 && <div className="border border-dashed border-zinc-200 px-4 py-5 text-sm text-zinc-500">No question responses for current filters.</div>}
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
                <button type="button" onClick={() => window.print()} className="border border-zinc-200 px-3 py-2 text-xs text-zinc-700 hover:border-zinc-900">Print</button>
                <button type="button" onClick={handleCreateBoardShare} disabled={boardShareState === 'creating'} className="border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs text-white disabled:opacity-50">{boardShareState === 'creating' ? 'Creating...' : 'Publish board'}</button>
                {boardShareLink && <button type="button" onClick={handleCopyBoardShareLink} className="border border-zinc-200 px-3 py-2 text-xs text-zinc-700 hover:border-zinc-900">Copy link</button>}
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
                          <div className="text-zinc-700">{column.label}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {board.rows.map((row) => (
                      <tr key={row.sessionId} className="border-t border-zinc-200 align-top">
                        <td className="sticky left-0 z-10 border-r border-zinc-200 bg-white px-3 py-2 font-semibold text-zinc-900">#{row.rank}</td>
                        <td className="sticky left-[58px] z-10 border-r border-zinc-200 bg-white px-3 py-2 font-medium text-zinc-900">{row.studentName}</td>
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
