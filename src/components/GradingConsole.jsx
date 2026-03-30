import { useEffect, useMemo, useState } from 'react';
import { fetchSessionsFromCloud, getGradingCloudAvailability } from '../utils/gradingCloud';

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
  const [view, setView] = useState('students');
  const [search, setSearch] = useState('');
  const [taskType, setTaskType] = useState('all');
  const [status, setStatus] = useState('all');
  const [minScore, setMinScore] = useState(0);
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
    return [...map.values()].sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0));
  }, [sessions, cloudSessions]);

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
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_160px_140px_180px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student, lesson, task"
              className="border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
            />
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
            <button type="button" onClick={() => setView('students')} className={view === 'students' ? 'bg-zinc-900 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-white' : 'px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-600 hover:bg-zinc-50'}>By student</button>
            <button type="button" onClick={() => setView('questions')} className={view === 'questions' ? 'bg-zinc-900 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-white' : 'px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-600 hover:bg-zinc-50'}>By question</button>
          </div>
          <div className="mt-3 text-[11px] text-zinc-500">Source: local {sessions.length} + cloud {cloudSessions.length} → merged {mergedSessions.length}</div>
        </section>

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
