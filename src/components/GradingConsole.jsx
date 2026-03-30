import { useEffect, useMemo, useState } from 'react';
import { saveSession } from '../storage';
import { fetchSessionsFromCloud, getGradingCloudAvailability, syncSessionGradeToCloud } from '../utils/gradingCloud';

function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeEntry(session, entry) {
  return {
    sessionId: session.id,
    studentName: (session.studentName || 'Anonymous').trim(),
    lessonTitle: session.lessonTitle || 'Untitled Lesson',
    taskType: entry.taskType || 'unknown',
    label: entry.label || 'Untitled task',
    score: toNumber(entry.score, 0),
    correct: entry.correct,
    timestamp: toNumber(session.timestamp, 0),
  };
}

function toPercent(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(Math.max(0, Math.min(1, numeric)) * 100);
}

function recalculateSessionMetrics(session) {
  const breakdown = Array.isArray(session.breakdown) ? session.breakdown : [];
  const completedCount = breakdown.filter((entry) => entry.correct !== null).length;
  const correctCount = breakdown.filter((entry) => entry.correct === true).length;
  const total = breakdown.reduce((sum, entry) => sum + Math.max(1, Number(entry.points || 1)), 0);
  const earned = breakdown.reduce((sum, entry) => {
    const points = Math.max(1, Number(entry.points || 1));
    const score = Number(entry.score);
    return sum + (Number.isFinite(score) ? Math.max(0, Math.min(1, score)) * points : 0);
  }, 0);

  return {
    ...session,
    breakdown,
    completedCount,
    correctCount,
    total,
    earned,
    score: total > 0 ? Math.round((earned / total) * 100) : 0,
  };
}

function computeLessonRows(sessions) {
  const map = new Map();

  sessions.forEach((session) => {
    const title = (session.lessonTitle || 'Untitled Lesson').trim();
    const current = map.get(title) || {
      lessonTitle: title,
      sessions: 0,
      completedSessions: 0,
      totalScore: 0,
      totalEarned: 0,
      totalPossible: 0,
      firstSeen: Number.MAX_SAFE_INTEGER,
      lastSeen: 0,
    };

    const timestamp = Number(session.timestamp || 0);
    const sessionTotal = Number(session.total || 0);
    const sessionCompleted = Number(session.completedCount || 0);

    current.sessions += 1;
    if (sessionTotal > 0 && sessionCompleted >= sessionTotal) current.completedSessions += 1;
    current.totalScore += Number(session.score || 0);
    current.totalEarned += Number(session.earned || 0);
    current.totalPossible += sessionTotal;
    current.firstSeen = Math.min(current.firstSeen, timestamp || current.firstSeen);
    current.lastSeen = Math.max(current.lastSeen, timestamp || 0);

    map.set(title, current);
  });

  return [...map.values()]
    .map((row) => ({
      ...row,
      avgScore: row.sessions > 0 ? Math.round(row.totalScore / row.sessions) : 0,
      completionRate: row.sessions > 0 ? Math.round((row.completedSessions / row.sessions) * 100) : 0,
      accuracy: row.totalPossible > 0 ? Math.round((row.totalEarned / row.totalPossible) * 100) : 0,
      firstSeen: row.firstSeen === Number.MAX_SAFE_INTEGER ? 0 : row.firstSeen,
    }))
    .sort((left, right) => right.lastSeen - left.lastSeen);
}

function computeStudentRows(entries) {
  const map = new Map();
  entries.forEach((entry) => {
    const key = entry.studentName;
    const current = map.get(key) || {
      studentName: key,
      attempts: 0,
      correctCount: 0,
      gradedCount: 0,
      totalScore: 0,
      lessonTitles: new Set(),
      lastSeen: 0,
    };

    current.attempts += 1;
    if (entry.correct === true) current.correctCount += 1;
    if (entry.correct !== null) current.gradedCount += 1;
    current.totalScore += entry.score;
    current.lessonTitles.add(entry.lessonTitle);
    current.lastSeen = Math.max(current.lastSeen, entry.timestamp || 0);
    map.set(key, current);
  });

  return [...map.values()]
    .map((item) => ({
      ...item,
      avgScore: item.attempts > 0 ? Math.round((item.totalScore / item.attempts) * 100) : 0,
      accuracy: item.gradedCount > 0 ? Math.round((item.correctCount / item.gradedCount) * 100) : 0,
      lessons: item.lessonTitles.size,
    }))
    .sort((left, right) => right.lastSeen - left.lastSeen);
}

function computeQuestionRows(entries) {
  const map = new Map();
  entries.forEach((entry) => {
    const key = `${entry.taskType}::${entry.label}`;
    const current = map.get(key) || {
      id: key,
      label: entry.label,
      taskType: entry.taskType,
      attempts: 0,
      correctCount: 0,
      gradedCount: 0,
      totalScore: 0,
      students: new Set(),
      lastSeen: 0,
    };

    current.attempts += 1;
    if (entry.correct === true) current.correctCount += 1;
    if (entry.correct !== null) current.gradedCount += 1;
    current.totalScore += entry.score;
    current.students.add(entry.studentName);
    current.lastSeen = Math.max(current.lastSeen, entry.timestamp || 0);
    map.set(key, current);
  });

  return [...map.values()]
    .map((item) => ({
      ...item,
      avgScore: item.attempts > 0 ? Math.round((item.totalScore / item.attempts) * 100) : 0,
      accuracy: item.gradedCount > 0 ? Math.round((item.correctCount / item.gradedCount) * 100) : 0,
      studentCount: item.students.size,
    }))
    .sort((left, right) => right.attempts - left.attempts || right.lastSeen - left.lastSeen);
}

export default function GradingConsole({ sessions = [], onBack }) {
  const [view, setView] = useState('lessons');
  const [search, setSearch] = useState('');
  const [taskType, setTaskType] = useState('all');
  const [status, setStatus] = useState('all');
  const [minScore, setMinScore] = useState(0);
  const [selectedLesson, setSelectedLesson] = useState('all');
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionDraft, setSessionDraft] = useState(null);
  const [manualOverallScore, setManualOverallScore] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [localOverrides, setLocalOverrides] = useState({});
  const [cloudSessions, setCloudSessions] = useState([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudStatus, setCloudStatus] = useState('idle');
  const [cloudMessage, setCloudMessage] = useState('');

  const refreshCloudSessions = async () => {
    const availability = getGradingCloudAvailability();
    if (!availability.available) {
      setCloudStatus('unavailable');
      setCloudMessage(`Cloud: ${availability.reason}`);
      setCloudSessions([]);
      return;
    }

    setCloudLoading(true);
    setCloudStatus('loading');
    setCloudMessage('Loading cloud sessions...');
    const result = await fetchSessionsFromCloud();
    setCloudLoading(false);

    if (!result.ok) {
      setCloudStatus('error');
      setCloudMessage(`Cloud load failed: ${result.reason || 'unknown error'}`);
      return;
    }

    setCloudSessions(result.sessions || []);
    setCloudStatus('ready');
    setCloudMessage(`Cloud sessions: ${(result.sessions || []).length}`);
  };

  useEffect(() => {
    void refreshCloudSessions();
  }, []);

  const mergedSessions = useMemo(() => {
    const map = new Map();
    [...cloudSessions, ...sessions].forEach((session) => {
      const key = String(session.id || session.cloudSessionId || '');
      if (!key) return;
      const existing = map.get(key);
      if (!existing || Number(session.timestamp || 0) > Number(existing.timestamp || 0)) {
        map.set(key, session);
      }
    });
    Object.entries(localOverrides).forEach(([id, override]) => {
      map.set(id, override);
    });
    return [...map.values()]
      .map((session) => recalculateSessionMetrics(session))
      .sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0));
  }, [sessions, cloudSessions, localOverrides]);

  const lessonRows = useMemo(() => computeLessonRows(mergedSessions), [mergedSessions]);

  const lessonOptions = useMemo(() => ['all', ...lessonRows.map((row) => row.lessonTitle)], [lessonRows]);

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return mergedSessions.filter((session) => {
      if (selectedLesson !== 'all' && session.lessonTitle !== selectedLesson) return false;
      if ((Number(session.score || 0)) < minScore) return false;
      if (status === 'graded' && Number(session.completedCount || 0) === 0) return false;

      if (!query) return true;
      const haystack = `${session.studentName || ''} ${session.lessonTitle || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [mergedSessions, minScore, search, selectedLesson, status]);

  const selectedLessonStats = useMemo(() => {
    if (selectedLesson === 'all') return null;
    return lessonRows.find((row) => row.lessonTitle === selectedLesson) || null;
  }, [lessonRows, selectedLesson]);

  const entries = useMemo(() => mergedSessions.flatMap((session) => {
    const breakdown = Array.isArray(session.breakdown) ? session.breakdown : [];
    return breakdown.map((entry) => normalizeEntry(session, entry));
  }), [mergedSessions]);

  const taskTypes = useMemo(() => {
    const set = new Set(entries.map((entry) => entry.taskType).filter(Boolean));
    return ['all', ...[...set].sort((a, b) => a.localeCompare(b))];
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();

    return entries.filter((entry) => {
      if (taskType !== 'all' && entry.taskType !== taskType) return false;
      if (entry.score < (minScore / 100)) return false;

      if (status === 'graded' && entry.correct === null) return false;
      if (status === 'correct' && entry.correct !== true) return false;
      if (status === 'incorrect' && entry.correct !== false) return false;
      if (status === 'saved' && entry.correct !== null) return false;

      if (!query) return true;
      const haystack = `${entry.studentName} ${entry.lessonTitle} ${entry.label} ${entry.taskType}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [entries, search, taskType, status, minScore]);

  const studentRows = useMemo(() => computeStudentRows(filteredEntries), [filteredEntries]);
  const questionRows = useMemo(() => computeQuestionRows(filteredEntries), [filteredEntries]);

  const openSessionEditor = (session) => {
    const normalized = recalculateSessionMetrics(session);
    setActiveSessionId(normalized.id);
    setSessionDraft(normalized);
    setManualOverallScore(String(Number(normalized.score || 0)));
    setSaveMessage('');
  };

  const closeSessionEditor = () => {
    setActiveSessionId(null);
    setSessionDraft(null);
    setManualOverallScore('');
    setSaveMessage('');
  };

  const updateDraftEntry = (entryId, updater) => {
    setSessionDraft((current) => {
      if (!current) return current;
      const nextBreakdown = (current.breakdown || []).map((entry) => {
        if (entry.id !== entryId) return entry;
        return updater(entry);
      });
      return recalculateSessionMetrics({ ...current, breakdown: nextBreakdown });
    });
  };

  const handleSaveEditedSession = async () => {
    if (!sessionDraft) return;

    const base = recalculateSessionMetrics(sessionDraft);
    const requestedOverall = Number(manualOverallScore);
    const score = Number.isFinite(requestedOverall)
      ? Math.max(0, Math.min(100, requestedOverall))
      : Number(base.score || 0);
    const total = Number(base.total || 0);
    const earned = total > 0 ? (score / 100) * total : 0;

    const nextSession = {
      ...base,
      score,
      earned,
      timestamp: Date.now(),
    };

    const saved = saveSession(nextSession);
    setLocalOverrides((current) => ({ ...current, [saved.id]: saved }));
    setCloudSessions((current) => current.map((session) => (session.id === saved.id ? saved : session)));

    const cloudResult = await syncSessionGradeToCloud(saved);
    if (cloudResult.state === 'synced') {
      setSaveMessage('Saved locally and synced to cloud.');
    } else {
      setSaveMessage(`Saved locally. Cloud sync: ${cloudResult.reason || cloudResult.state || 'unavailable'}.`);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f7f5] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 border border-zinc-200 bg-white px-4 py-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Grading Console</div>
            <div className="mt-1 text-xl font-semibold text-zinc-950">By-student and by-question analytics</div>
            <div className="mt-1 text-[11px] text-zinc-500">{cloudMessage || 'Cloud status: idle'}</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={refreshCloudSessions} disabled={cloudLoading} className="border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-900 disabled:opacity-60">{cloudLoading ? 'Refreshing...' : 'Refresh Cloud'}</button>
            <button type="button" onClick={onBack} className="border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-900">Back</button>
          </div>
        </header>

        <section className="border border-zinc-200 bg-white p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_160px_140px_180px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student, lesson, task"
              className="border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
            />
            <select value={selectedLesson} onChange={(event) => setSelectedLesson(event.target.value)} className="border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
              {lessonOptions.map((lesson) => <option key={lesson} value={lesson}>{lesson === 'all' ? 'All lessons' : lesson}</option>)}
            </select>
            <select value={taskType} onChange={(event) => setTaskType(event.target.value)} className="border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
              {taskTypes.map((type) => <option key={type} value={type}>{type === 'all' ? 'All task types' : type}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
              <option value="all">All statuses</option>
              <option value="graded">Graded only</option>
              <option value="correct">Correct only</option>
              <option value="incorrect">Incorrect only</option>
              <option value="saved">Saved-only</option>
            </select>
            <div className="border border-zinc-200 px-3 py-2 text-sm text-zinc-700">Min score: {minScore}%</div>
            <input type="range" min={0} max={100} step={5} value={minScore} onChange={(event) => setMinScore(Number(event.target.value))} />
          </div>

          <div className="mt-4 inline-flex border border-zinc-200 bg-white p-0.5">
            <button type="button" onClick={() => setView('lessons')} className={view === 'lessons' ? 'bg-zinc-900 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-white' : 'px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-600 hover:bg-zinc-50'}>By lesson</button>
            <button type="button" onClick={() => setView('students')} className={view === 'students' ? 'bg-zinc-900 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-white' : 'px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-600 hover:bg-zinc-50'}>By student</button>
            <button type="button" onClick={() => setView('questions')} className={view === 'questions' ? 'bg-zinc-900 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-white' : 'px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-600 hover:bg-zinc-50'}>By question</button>
          </div>
          <div className="mt-3 text-[11px] text-zinc-500">Source: local {sessions.length} + cloud {cloudSessions.length} → merged {mergedSessions.length}</div>
        </section>

        {view === 'lessons' && (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="border border-zinc-200 bg-white px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Lessons</div>
                <div className="mt-1 text-xl font-semibold text-zinc-900">{lessonRows.length}</div>
              </div>
              <div className="border border-zinc-200 bg-white px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Sessions</div>
                <div className="mt-1 text-xl font-semibold text-zinc-900">{filteredSessions.length}</div>
              </div>
              <div className="border border-zinc-200 bg-white px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Avg score</div>
                <div className="mt-1 text-xl font-semibold text-zinc-900">{selectedLessonStats ? `${selectedLessonStats.avgScore}%` : '—'}</div>
              </div>
              <div className="border border-zinc-200 bg-white px-4 py-3">
                <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Completion rate</div>
                <div className="mt-1 text-xl font-semibold text-zinc-900">{selectedLessonStats ? `${selectedLessonStats.completionRate}%` : '—'}</div>
              </div>
            </div>

            <div className="border border-zinc-200 bg-white p-4">
              <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Lesson Stats</div>
              <div className="space-y-2">
                {(selectedLesson === 'all' ? lessonRows : lessonRows.filter((row) => row.lessonTitle === selectedLesson)).map((row) => (
                  <div key={row.lessonTitle} className="grid gap-2 border border-zinc-200 px-3 py-3 sm:grid-cols-[1fr_110px_120px_120px_120px_140px]">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">{row.lessonTitle}</div>
                      <div className="text-[11px] text-zinc-500">Records: {row.sessions} • Completions: {row.completedSessions}</div>
                    </div>
                    <div className="text-sm text-zinc-700">Avg: {row.avgScore}%</div>
                    <div className="text-sm text-zinc-700">Accuracy: {row.accuracy}%</div>
                    <div className="text-sm text-zinc-700">Complete: {row.completionRate}%</div>
                    <div className="text-sm text-zinc-700">First: {row.firstSeen ? new Date(row.firstSeen).toLocaleDateString() : 'n/a'}</div>
                    <div className="text-sm text-zinc-500">Last: {row.lastSeen ? new Date(row.lastSeen).toLocaleDateString() : 'n/a'}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-zinc-200 bg-white p-4">
              <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Completion Records</div>
              <div className="space-y-2">
                {filteredSessions.map((session) => (
                  <button key={session.id} type="button" onClick={() => openSessionEditor(session)} className={`grid w-full gap-2 border px-3 py-3 text-left transition hover:border-zinc-900 sm:grid-cols-[1fr_120px_120px_140px_120px] ${activeSessionId === session.id ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 bg-white'}`}>
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">{session.lessonTitle}</div>
                      <div className="text-[11px] text-zinc-500">{session.studentName || 'Anonymous'}</div>
                    </div>
                    <div className="text-sm text-zinc-700">Score: {Math.round(Number(session.score || 0))}%</div>
                    <div className="text-sm text-zinc-700">Done: {session.completedCount}/{session.total || (session.breakdown || []).length}</div>
                    <div className="text-sm text-zinc-700">Date: {session.timestamp ? new Date(session.timestamp).toLocaleString() : 'n/a'}</div>
                    <div className="text-sm text-zinc-600">Questions: {(session.breakdown || []).length}</div>
                  </button>
                ))}
                {filteredSessions.length === 0 && <div className="border border-dashed border-zinc-200 px-4 py-5 text-sm text-zinc-500">No completion records for the selected lesson.</div>}
              </div>
            </div>

            {sessionDraft && (
              <div className="border border-zinc-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Edit Session</div>
                    <div className="text-sm font-semibold text-zinc-900">{sessionDraft.lessonTitle} • {sessionDraft.studentName}</div>
                  </div>
                  <button type="button" onClick={closeSessionEditor} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:border-zinc-900">Close</button>
                </div>

                <div className="mb-3 grid gap-3 sm:grid-cols-4">
                  <div className="border border-zinc-200 px-3 py-2 text-sm text-zinc-700">Correct: {sessionDraft.correctCount}</div>
                  <div className="border border-zinc-200 px-3 py-2 text-sm text-zinc-700">Completed: {sessionDraft.completedCount}</div>
                  <div className="border border-zinc-200 px-3 py-2 text-sm text-zinc-700">Auto score: {Math.round(Number(sessionDraft.score || 0))}%</div>
                  <label className="border border-zinc-200 px-3 py-2 text-sm text-zinc-700">
                    Overall grade %
                    <input type="number" min={0} max={100} value={manualOverallScore} onChange={(event) => setManualOverallScore(event.target.value)} className="mt-1 w-full border border-zinc-200 px-2 py-1 text-sm outline-none focus:border-zinc-900" />
                  </label>
                </div>

                <div className="space-y-2">
                  {(sessionDraft.breakdown || []).map((entry) => (
                    <div key={entry.id} className="grid gap-2 border border-zinc-200 px-3 py-3 sm:grid-cols-[1fr_160px_120px_110px]">
                      <div>
                        <div className="text-sm font-medium text-zinc-900">{entry.label}</div>
                        <div className="text-[11px] text-zinc-500">{entry.taskType}</div>
                      </div>
                      <select
                        value={entry.correct === true ? 'correct' : entry.correct === false ? 'incorrect' : 'ungraded'}
                        onChange={(event) => {
                          const next = event.target.value;
                          updateDraftEntry(entry.id, (current) => ({
                            ...current,
                            correct: next === 'correct' ? true : next === 'incorrect' ? false : null,
                            score: next === 'correct' ? 1 : next === 'incorrect' ? 0 : current.score,
                          }));
                        }}
                        className="border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                      >
                        <option value="ungraded">Ungraded</option>
                        <option value="correct">Correct</option>
                        <option value="incorrect">Incorrect</option>
                      </select>
                      <label className="text-xs text-zinc-500">
                        Score %
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={toPercent(entry.score)}
                          onChange={(event) => {
                            const next = Math.max(0, Math.min(100, Number(event.target.value) || 0));
                            updateDraftEntry(entry.id, (current) => ({
                              ...current,
                              score: next / 100,
                            }));
                          }}
                          className="mt-1 w-full border border-zinc-200 px-2 py-1 text-sm outline-none focus:border-zinc-900"
                        />
                      </label>
                      <div className="text-sm text-zinc-700">Weighted: {Math.round((Number(entry.score || 0) * 100))}%</div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <button type="button" onClick={handleSaveEditedSession} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm text-white">Save edits</button>
                  {saveMessage && <div className="text-xs text-zinc-600">{saveMessage}</div>}
                </div>
              </div>
            )}
          </section>
        )}

        {view === 'students' ? (
          <section className="border border-zinc-200 bg-white p-4">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Students ({studentRows.length})</div>
            <div className="space-y-2">
              {studentRows.map((row) => (
                <div key={row.studentName} className="grid gap-2 border border-zinc-200 px-3 py-3 sm:grid-cols-[1fr_120px_120px_120px_130px]">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">{row.studentName}</div>
                    <div className="text-[11px] text-zinc-500">Lessons: {row.lessons} • Attempts: {row.attempts}</div>
                  </div>
                  <div className="text-sm text-zinc-700">Avg: {row.avgScore}%</div>
                  <div className="text-sm text-zinc-700">Accuracy: {row.accuracy}%</div>
                  <div className="text-sm text-zinc-700">Graded: {row.gradedCount}</div>
                  <div className="text-sm text-zinc-500">{row.lastSeen ? new Date(row.lastSeen).toLocaleDateString() : 'n/a'}</div>
                </div>
              ))}
              {studentRows.length === 0 && <div className="border border-dashed border-zinc-200 px-4 py-5 text-sm text-zinc-500">No student rows match the selected filters.</div>}
            </div>
          </section>
        ) : (
          <section className="border border-zinc-200 bg-white p-4">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Questions ({questionRows.length})</div>
            <div className="space-y-2">
              {questionRows.map((row) => (
                <div key={row.id} className="grid gap-2 border border-zinc-200 px-3 py-3 sm:grid-cols-[1fr_140px_120px_120px_120px]">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">{row.label}</div>
                    <div className="text-[11px] text-zinc-500">{row.taskType}</div>
                  </div>
                  <div className="text-sm text-zinc-700">Attempts: {row.attempts}</div>
                  <div className="text-sm text-zinc-700">Avg: {row.avgScore}%</div>
                  <div className="text-sm text-zinc-700">Accuracy: {row.accuracy}%</div>
                  <div className="text-sm text-zinc-700">Students: {row.studentCount}</div>
                </div>
              ))}
              {questionRows.length === 0 && <div className="border border-dashed border-zinc-200 px-4 py-5 text-sm text-zinc-500">No question rows match the selected filters.</div>}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
