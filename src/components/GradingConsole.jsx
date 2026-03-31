import { useCallback, useEffect, useMemo, useState } from 'react';
import { saveSession } from '../storage';
import { fetchSessionsFromCloud, getGradingCloudAvailability, syncSessionGradeToCloud } from '../utils/gradingCloud';
import { fetchAssignmentSubmissionsForOwner, updateAssignmentSubmissionGrade } from '../utils/lessonAssignments';
import { createResultShareLink } from '../utils/resultSharing';

function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeEntry(session, entry) {
  return {
    sessionId: session.id,
    studentName: (session.studentName || 'Anonymous').trim(),
    lessonTitle: session.lessonTitle || 'Untitled Lesson',
    origin: session.origin || session.sourceType || 'local',
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

function computeHardestTaskByLesson(sessions) {
  const lessonBuckets = new Map();

  sessions.forEach((session) => {
    const lessonTitle = session.lessonTitle || 'Untitled Lesson';
    const breakdown = Array.isArray(session.breakdown) ? session.breakdown : [];
    breakdown.forEach((entry) => {
      const key = `${entry.taskType || 'unknown'}::${entry.label || 'Untitled task'}`;
      if (!lessonBuckets.has(lessonTitle)) lessonBuckets.set(lessonTitle, new Map());
      const taskMap = lessonBuckets.get(lessonTitle);
      const current = taskMap.get(key) || {
        label: entry.label || 'Untitled task',
        taskType: entry.taskType || 'unknown',
        attempts: 0,
        earned: 0,
      };
      current.attempts += 1;
      current.earned += Number(entry.score || 0);
      taskMap.set(key, current);
    });
  });

  const result = new Map();
  lessonBuckets.forEach((taskMap, lessonTitle) => {
    const hardest = [...taskMap.values()]
      .map((row) => ({
        ...row,
        avgScore: row.attempts > 0 ? row.earned / row.attempts : 0,
      }))
      .sort((left, right) => left.avgScore - right.avgScore || right.attempts - left.attempts)[0] || null;
    if (hardest) result.set(lessonTitle, hardest);
  });

  return result;
}

function formatResponsePreview(result) {
  const response = result?.response;
  if (response === null || response === undefined) return 'No answer submitted';
  if (typeof response === 'string') return response;
  if (typeof response === 'number' || typeof response === 'boolean') return String(response);
  if (Array.isArray(response)) return response.join(' | ');
  if (typeof response === 'object') {
    if (Array.isArray(response.points)) return response.points.join(' | ');
    try {
      return JSON.stringify(response);
    } catch {
      return 'Structured response';
    }
  }
  return 'Unsupported response';
}

function toTaskColumnKey(entry) {
  return `${entry?.taskType || 'unknown'}::${entry?.label || 'Untitled task'}`;
}

function buildPublishedBoard(sessions, selectedLesson) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return { lessonTitle: null, columns: [], rows: [] };
  }

  const resolvedLesson = selectedLesson !== 'all'
    ? selectedLesson
    : (sessions[0]?.lessonTitle || null);

  if (!resolvedLesson) {
    return { lessonTitle: null, columns: [], rows: [] };
  }

  const scopedSessions = sessions.filter((session) => (session.lessonTitle || 'Untitled Lesson') === resolvedLesson);
  const columnMap = new Map();

  scopedSessions.forEach((session) => {
    const breakdown = Array.isArray(session.breakdown) ? session.breakdown : [];
    breakdown.forEach((entry) => {
      const key = toTaskColumnKey(entry);
      if (columnMap.has(key)) return;
      columnMap.set(key, {
        id: key,
        label: entry.label || 'Untitled task',
        taskType: entry.taskType || 'unknown',
      });
    });
  });

  const columns = [...columnMap.values()];
  const rows = scopedSessions
    .map((session) => {
      const cellMap = new Map();
      const breakdown = Array.isArray(session.breakdown) ? session.breakdown : [];
      breakdown.forEach((entry) => {
        const key = toTaskColumnKey(entry);
        cellMap.set(key, {
          correct: entry.correct,
          score: toPercent(entry.score),
        });
      });

      return {
        sessionId: String(session.id || ''),
        studentName: (session.studentName || 'Anonymous').trim(),
        timestamp: Number(session.timestamp || 0),
        overallScore: Math.round(Number(session.score || 0)),
        submissionState: session.submissionState || '',
        origin: session.origin || 'local',
        cellMap,
      };
    })
    .sort((left, right) => right.timestamp - left.timestamp);

  return {
    lessonTitle: resolvedLesson,
    columns,
    rows,
  };
}

export default function GradingConsole({ sessions = [], onBack }) {
  const [view, setView] = useState('lessons');
  const [search, setSearch] = useState('');
  const [sourceType, setSourceType] = useState('all');
  const [taskType, setTaskType] = useState('all');
  const [status, setStatus] = useState('all');
  const [minScore, setMinScore] = useState(0);
  const [selectedLesson, setSelectedLesson] = useState('all');
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [sessionDraft, setSessionDraft] = useState(null);
  const [manualOverallScore, setManualOverallScore] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [draftCheckState, setDraftCheckState] = useState({ checked: false, level: 'idle', message: '' });
  const [expandedDraftRows, setExpandedDraftRows] = useState(() => new Set());
  const [selectedQuestionId, setSelectedQuestionId] = useState('all');
  const [localOverrides, setLocalOverrides] = useState({});
  const [cloudSessions, setCloudSessions] = useState([]);
  const [assignmentSessions, setAssignmentSessions] = useState([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [_cloudStatus, setCloudStatus] = useState('idle');
  const [cloudMessage, setCloudMessage] = useState('');
  const [boardShareLink, setBoardShareLink] = useState('');
  const [boardShareState, setBoardShareState] = useState('idle');

  const refreshCloudSessions = useCallback(async () => {
    const availability = getGradingCloudAvailability();
    if (!availability.available) {
      setCloudStatus('unavailable');
      setCloudMessage(`Cloud: ${availability.reason}`);
      setCloudSessions([]);
      setAssignmentSessions([]);
      return;
    }

    setCloudLoading(true);
    setCloudStatus('loading');
    setCloudMessage('Loading cloud sessions and homework submissions...');

    const [gradeResult, assignmentResult] = await Promise.all([
      fetchSessionsFromCloud(),
      fetchAssignmentSubmissionsForOwner(),
    ]);

    setCloudLoading(false);

    if (!gradeResult.ok && !assignmentResult.ok) {
      setCloudStatus('error');
      setCloudMessage(`Cloud load failed: ${gradeResult.reason || assignmentResult.reason || 'unknown error'}`);
      return;
    }

    if (gradeResult.ok) {
      setCloudSessions(gradeResult.sessions || []);
    } else {
      setCloudSessions([]);
    }

    if (assignmentResult.ok) {
      setAssignmentSessions(assignmentResult.sessions || []);
    } else {
      setAssignmentSessions([]);
    }

    setCloudStatus('ready');
    const gradeCount = gradeResult.ok ? (gradeResult.sessions || []).length : 0;
    const assignmentCount = assignmentResult.ok ? (assignmentResult.sessions || []).length : 0;
    const gradeSuffix = gradeResult.ok ? '' : ` (grade: ${gradeResult.reason || 'failed'})`;
    const assignmentSuffix = assignmentResult.ok ? '' : ` (homework: ${assignmentResult.reason || 'failed'})`;
    setCloudMessage(`Cloud sessions: ${gradeCount}${gradeSuffix} • Homework submissions: ${assignmentCount}${assignmentSuffix}`);
  }, []);

  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      void refreshCloudSessions();
    }, 0);
    return () => window.clearTimeout(kickoff);
  }, [refreshCloudSessions]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void refreshCloudSessions();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [refreshCloudSessions]);

  const mergedSessions = useMemo(() => {
    const map = new Map();
    [...assignmentSessions, ...cloudSessions, ...sessions].forEach((session) => {
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
  }, [sessions, cloudSessions, assignmentSessions, localOverrides]);

  const mergedSessionsById = useMemo(() => {
    const map = new Map();
    mergedSessions.forEach((session) => {
      map.set(String(session.id || ''), session);
    });
    return map;
  }, [mergedSessions]);

  const lessonRows = useMemo(() => computeLessonRows(mergedSessions), [mergedSessions]);
  const hardestTasksByLesson = useMemo(() => computeHardestTaskByLesson(mergedSessions), [mergedSessions]);

  const lessonOptions = useMemo(() => ['all', ...lessonRows.map((row) => row.lessonTitle)], [lessonRows]);

  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return mergedSessions.filter((session) => {
      if (selectedLesson !== 'all' && session.lessonTitle !== selectedLesson) return false;
      const sessionOrigin = session.origin || session.sourceType || 'local';
      if (sourceType !== 'all' && sessionOrigin !== sourceType) return false;
      if ((Number(session.score || 0)) < minScore) return false;
      if (status === 'graded' && Number(session.completedCount || 0) === 0) return false;

      if (!query) return true;
      const haystack = `${session.studentName || ''} ${session.lessonTitle || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [mergedSessions, minScore, search, selectedLesson, sourceType, status]);

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
      if (sourceType !== 'all' && entry.origin !== sourceType) return false;
      if (entry.score < (minScore / 100)) return false;

      if (status === 'graded' && entry.correct === null) return false;
      if (status === 'correct' && entry.correct !== true) return false;
      if (status === 'incorrect' && entry.correct !== false) return false;
      if (status === 'saved' && entry.correct !== null) return false;

      if (!query) return true;
      const haystack = `${entry.studentName} ${entry.lessonTitle} ${entry.label} ${entry.taskType}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [entries, search, taskType, status, minScore, sourceType]);

  const studentRows = useMemo(() => computeStudentRows(filteredEntries), [filteredEntries]);
  const questionRows = useMemo(() => computeQuestionRows(filteredEntries), [filteredEntries]);
  const publishedBoard = useMemo(() => buildPublishedBoard(filteredSessions, selectedLesson), [filteredSessions, selectedLesson]);

  const questionResponseRows = useMemo(() => {
    if (selectedQuestionId === 'all') return [];
    const [selectedTaskType, selectedLabel] = selectedQuestionId.split('::');

    return mergedSessions.flatMap((session) => {
      const breakdown = Array.isArray(session.breakdown) ? session.breakdown : [];
      return breakdown
        .filter((entry) => (entry.taskType || 'unknown') === selectedTaskType && (entry.label || 'Untitled task') === selectedLabel)
        .map((entry) => {
          const points = Math.max(1, Number(entry.points || 1));
          const score = Number(entry.score || 0);
          const grade = Math.round(Math.max(0, Math.min(1, score)) * points * 100) / 100;
          return {
            sessionId: session.id,
            entryId: entry.id,
            studentName: (session.studentName || 'Anonymous').trim(),
            questionName: entry.label || 'Untitled task',
            status: entry.correct === true ? 'correct' : entry.correct === false ? 'incorrect' : 'ungraded',
            answer: formatResponsePreview(entry.result),
            grade,
            maxGrade: points,
            handedInAt: Number(session.timestamp || 0),
          };
        });
    }).sort((left, right) => right.handedInAt - left.handedInAt);
  }, [mergedSessions, selectedQuestionId]);

  const openSessionEditor = (session) => {
    const normalized = recalculateSessionMetrics(session);
    setActiveSessionId(normalized.id);
    setSessionDraft(normalized);
    setManualOverallScore(String(Number(normalized.score || 0)));
    setSaveMessage('');
    setDraftCheckState({ checked: false, level: 'idle', message: '' });
    setExpandedDraftRows(new Set());
  };

  const closeSessionEditor = () => {
    setActiveSessionId(null);
    setSessionDraft(null);
    setManualOverallScore('');
    setSaveMessage('');
    setDraftCheckState({ checked: false, level: 'idle', message: '' });
    setExpandedDraftRows(new Set());
  };

  const invalidateDraftCheck = () => {
    setDraftCheckState((current) => {
      if (!current.checked && current.level === 'idle') return current;
      return {
        checked: false,
        level: 'idle',
        message: 'Edits changed. Run Check grading before saving.',
      };
    });
  };

  const toggleDraftRow = (entryId) => {
    setExpandedDraftRows((current) => {
      const next = new Set(current);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
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
    invalidateDraftCheck();
  };

  const handleCheckDraft = () => {
    if (!sessionDraft) return;
    const breakdown = Array.isArray(sessionDraft.breakdown) ? sessionDraft.breakdown : [];
    const ungradedCount = breakdown.filter((entry) => entry.correct === null).length;

    if (ungradedCount > 0) {
      setDraftCheckState({
        checked: false,
        level: 'error',
        message: `${ungradedCount} task(s) are still ungraded. Mark each row before saving.`,
      });
      return;
    }

    setDraftCheckState({
      checked: true,
      level: 'ready',
      message: 'Check complete. Save edits is now enabled.',
    });
  };

  const handleSaveEditedSession = async () => {
    if (!sessionDraft) return;
    if (!draftCheckState.checked) {
      setSaveMessage('Run Check grading first to verify all rows.');
      return;
    }

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
      submissionState: (Array.isArray(base.breakdown) && base.breakdown.some((entry) => entry.correct === null)) ? 'awaiting_review' : 'graded',
      timestamp: Date.now(),
    };

    const saved = saveSession(nextSession);
    setLocalOverrides((current) => ({ ...current, [saved.id]: saved }));
    setCloudSessions((current) => current.map((session) => (session.id === saved.id ? saved : session)));

    const cloudResult = await syncSessionGradeToCloud(saved);
    let message = cloudResult.state === 'synced'
      ? 'Saved locally and synced to cloud.'
      : `Saved locally. Cloud sync: ${cloudResult.reason || cloudResult.state || 'unavailable'}.`;

    if (saved.submissionId) {
      const assignmentSave = await updateAssignmentSubmissionGrade(saved.submissionId, saved);
      if (assignmentSave.ok) {
        message += ' Homework submission updated.';
      } else {
        message += ` Homework update failed: ${assignmentSave.reason || 'unknown error'}.`;
      }
    }

    setSaveMessage(message);
    setDraftCheckState({ checked: false, level: 'idle', message: '' });
  };

  const handleCreateBoardShareLink = async () => {
    if (!publishedBoard?.lessonTitle || publishedBoard.rows.length === 0 || publishedBoard.columns.length === 0) {
      setBoardShareState('empty');
      return;
    }

    setBoardShareState('creating');
    const payload = {
      shareType: 'published_board',
      lessonTitle: publishedBoard.lessonTitle,
      createdAt: Date.now(),
      columns: publishedBoard.columns,
      rows: publishedBoard.rows.map((row) => ({
        sessionId: row.sessionId,
        studentName: row.studentName,
        origin: row.origin,
        overallScore: row.overallScore,
        timestamp: row.timestamp,
        submissionState: row.submissionState || '',
        cells: publishedBoard.columns.map((column) => {
          const cell = row.cellMap.get(column.id);
          return {
            columnId: column.id,
            score: cell ? Number(cell.score || 0) : null,
            correct: cell ? cell.correct : null,
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
      window.setTimeout(() => setBoardShareState('ready'), 1400);
    } catch {
      setBoardShareState('copy-error');
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f7f5] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 border border-zinc-200 bg-white px-4 py-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Grading Console</div>
            <div className="mt-1 text-xl font-semibold text-zinc-950">Lesson and response grading analytics</div>
            <div className="mt-1 text-[11px] text-zinc-500">{cloudMessage || 'Cloud status: idle'}</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={refreshCloudSessions} disabled={cloudLoading} className="border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-900 disabled:opacity-60">{cloudLoading ? 'Refreshing...' : 'Refresh Cloud'}</button>
            <button type="button" onClick={onBack} className="border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-900">Back</button>
          </div>
        </header>

        <section className="border border-zinc-200 bg-white p-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_170px_160px_170px_160px_140px_180px]">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search student, lesson, task"
              className="border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
            />
            <select value={selectedLesson} onChange={(event) => setSelectedLesson(event.target.value)} className="border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
              {lessonOptions.map((lesson) => <option key={lesson} value={lesson}>{lesson === 'all' ? 'All lessons' : lesson}</option>)}
            </select>
            <select value={sourceType} onChange={(event) => setSourceType(event.target.value)} className="border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
              <option value="all">All sources</option>
              <option value="homework">Homework</option>
              <option value="live">Live</option>
              <option value="practice">Practice</option>
              <option value="local">Lesson local</option>
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
            <button type="button" onClick={() => setView('board')} className={view === 'board' ? 'bg-zinc-900 px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-white' : 'px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-zinc-600 hover:bg-zinc-50'}>Published board</button>
          </div>
          <div className="mt-3 text-[11px] text-zinc-500">Source: local {sessions.length} + grade cloud {cloudSessions.length} + homework {assignmentSessions.length} → merged {mergedSessions.length}</div>
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
                      {hardestTasksByLesson.get(row.lessonTitle) && (
                        <div className="mt-1 text-[11px] text-amber-700">
                          Hardest: {hardestTasksByLesson.get(row.lessonTitle).label} ({Math.round(hardestTasksByLesson.get(row.lessonTitle).avgScore * 100)}%)
                        </div>
                      )}
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
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-500">{session.origin || 'local'}</span>
                        {session.submissionState && <span className="border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-amber-700">{session.submissionState}</span>}
                      </div>
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
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={manualOverallScore}
                      onChange={(event) => {
                        setManualOverallScore(event.target.value);
                        invalidateDraftCheck();
                      }}
                      className="mt-1 w-full border border-zinc-200 px-2 py-1 text-sm outline-none focus:border-zinc-900"
                    />
                  </label>
                </div>

                <div className="space-y-2">
                  {(sessionDraft.breakdown || []).map((entry) => {
                    const expanded = expandedDraftRows.has(entry.id);
                    const verdict = entry.correct === true ? 'correct' : entry.correct === false ? 'incorrect' : 'ungraded';
                    return (
                      <div key={entry.id} className="border border-zinc-200">
                        <div className="grid gap-2 px-3 py-3 sm:grid-cols-[1fr_270px_120px_90px]">
                          <button type="button" onClick={() => toggleDraftRow(entry.id)} className="text-left">
                            <div className="text-sm font-medium text-zinc-900">{entry.label}</div>
                            <div className="text-[11px] text-zinc-500">{entry.taskType}</div>
                          </button>
                          <div className="inline-flex w-full border border-zinc-200 bg-white p-0.5 text-xs">
                            <button
                              type="button"
                              onClick={() => updateDraftEntry(entry.id, (current) => ({ ...current, correct: true, score: 1 }))}
                              className={verdict === 'correct' ? 'flex-1 bg-emerald-600 px-2 py-1.5 text-white' : 'flex-1 px-2 py-1.5 text-zinc-600 hover:bg-zinc-50'}
                            >
                              Correct
                            </button>
                            <button
                              type="button"
                              onClick={() => updateDraftEntry(entry.id, (current) => ({ ...current, correct: false, score: 0 }))}
                              className={verdict === 'incorrect' ? 'flex-1 bg-red-600 px-2 py-1.5 text-white' : 'flex-1 px-2 py-1.5 text-zinc-600 hover:bg-zinc-50'}
                            >
                              Incorrect
                            </button>
                            <button
                              type="button"
                              onClick={() => updateDraftEntry(entry.id, (current) => ({ ...current, correct: null }))}
                              className={verdict === 'ungraded' ? 'flex-1 bg-zinc-700 px-2 py-1.5 text-white' : 'flex-1 px-2 py-1.5 text-zinc-600 hover:bg-zinc-50'}
                            >
                              Ungraded
                            </button>
                          </div>
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
                          <button type="button" onClick={() => toggleDraftRow(entry.id)} className="text-xs text-zinc-500 hover:text-zinc-900">{expanded ? 'Hide' : 'Preview'}</button>
                        </div>
                        {expanded && (
                          <div className="border-t border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-700">
                            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Question Preview</div>
                            <div className="mt-1">{entry?.block?.question || entry?.block?.instruction || entry.label}</div>
                            <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Student Answer</div>
                            <div className="mt-1 whitespace-pre-wrap">{formatResponsePreview(entry.result)}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center gap-3">
                  <button type="button" onClick={handleCheckDraft} className="border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:border-zinc-900">Check grading</button>
                  <button type="button" onClick={handleSaveEditedSession} disabled={!draftCheckState.checked} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40">Save edits</button>
                  {draftCheckState.message && (
                    <div className={`text-xs ${draftCheckState.level === 'error' ? 'text-red-600' : draftCheckState.level === 'ready' ? 'text-emerald-700' : 'text-zinc-600'}`}>
                      {draftCheckState.message}
                    </div>
                  )}
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
        ) : view === 'questions' ? (
          <section className="border border-zinc-200 bg-white p-4">
            <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Question Responses</div>
            <div className="mb-3 grid gap-3 sm:grid-cols-[1fr_200px]">
              <select value={selectedQuestionId} onChange={(event) => setSelectedQuestionId(event.target.value)} className="border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
                <option value="all">Select question</option>
                {questionRows.map((row) => <option key={row.id} value={row.id}>{row.label} ({row.taskType})</option>)}
              </select>
              <div className="border border-zinc-200 px-3 py-2 text-sm text-zinc-700">Responses: {questionResponseRows.length}</div>
            </div>
            <div className="space-y-2">
              {questionResponseRows.map((row) => (
                <div key={`${row.sessionId}-${row.entryId}`} className="border border-zinc-200 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-zinc-900">{row.studentName}</div>
                    <div className={`border px-2 py-0.5 text-xs ${row.status === 'correct' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : row.status === 'incorrect' ? 'border-red-300 bg-red-50 text-red-700' : 'border-zinc-300 bg-zinc-50 text-zinc-600'}`}>{row.status}</div>
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-500">{row.questionName}</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{row.answer}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                    <span>{row.grade}/{row.maxGrade}</span>
                    <span>{row.handedInAt ? new Date(row.handedInAt).toLocaleString() : 'n/a'}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const target = mergedSessionsById.get(String(row.sessionId || ''));
                        if (target) openSessionEditor(target);
                      }}
                      className="border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600 hover:border-zinc-900"
                    >
                      Open student work
                    </button>
                  </div>
                </div>
              ))}
              {selectedQuestionId === 'all' && <div className="border border-dashed border-zinc-200 px-4 py-5 text-sm text-zinc-500">Select one question to view all student responses.</div>}
              {selectedQuestionId !== 'all' && questionResponseRows.length === 0 && <div className="border border-dashed border-zinc-200 px-4 py-5 text-sm text-zinc-500">No responses found for this question.</div>}
            </div>
          </section>
        ) : view === 'board' ? (
          <section className="border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Published Results Board</div>
                <div className="mt-1 text-sm text-zinc-700">Lesson: {publishedBoard.lessonTitle || 'No lesson selected'}</div>
              </div>
              <div className="text-xs text-zinc-500">Rows: {publishedBoard.rows.length} • Columns: {publishedBoard.columns.length}</div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCreateBoardShareLink}
                className="border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
                disabled={boardShareState === 'creating'}
              >
                {boardShareState === 'creating' ? 'Creating board link...' : 'Create board share link'}
              </button>
              {boardShareLink && (
                <button type="button" onClick={handleCopyBoardShareLink} className="border border-zinc-200 px-3 py-2 text-xs text-zinc-700 hover:border-zinc-900">Copy link</button>
              )}
              {boardShareState === 'empty' && <span className="text-xs text-amber-700">Board is empty for current filters.</span>}
              {boardShareState === 'error' && <span className="text-xs text-red-700">Failed to create board share link.</span>}
              {boardShareState === 'copied' && <span className="text-xs text-emerald-700">Link copied.</span>}
              {boardShareState === 'copy-error' && <span className="text-xs text-amber-700">Clipboard unavailable. Copy manually.</span>}
            </div>

            {boardShareLink && (
              <div className="mb-3">
                <input readOnly value={boardShareLink} className="w-full border border-zinc-200 px-3 py-2 text-xs text-zinc-700" />
              </div>
            )}

            {selectedLesson === 'all' && publishedBoard.lessonTitle && (
              <div className="mb-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Showing the latest lesson by default. Pick a specific lesson in the lesson filter to publish a stable board.
              </div>
            )}

            {publishedBoard.rows.length === 0 || publishedBoard.columns.length === 0 ? (
              <div className="border border-dashed border-zinc-200 px-4 py-5 text-sm text-zinc-500">No board data for the current filters.</div>
            ) : (
              <div className="overflow-auto border border-zinc-200">
                <table className="min-w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-zinc-50 text-left text-[11px] uppercase tracking-[0.12em] text-zinc-500">
                      <th className="sticky left-0 z-10 border-b border-r border-zinc-200 bg-zinc-50 px-3 py-2">Student</th>
                      <th className="border-b border-r border-zinc-200 px-3 py-2">Origin</th>
                      <th className="border-b border-r border-zinc-200 px-3 py-2">Overall</th>
                      <th className="border-b border-r border-zinc-200 px-3 py-2">Submitted</th>
                      {publishedBoard.columns.map((column) => (
                        <th key={column.id} className="min-w-[120px] border-b border-r border-zinc-200 px-3 py-2">
                          <div className="text-zinc-700">{column.label}</div>
                          <div className="mt-0.5 text-[10px] font-normal uppercase tracking-[0.08em] text-zinc-400">{column.taskType}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {publishedBoard.rows.map((row) => (
                      <tr key={row.sessionId} className="border-t border-zinc-200 align-top">
                        <td className="sticky left-0 z-10 border-r border-zinc-200 bg-white px-3 py-2 font-medium text-zinc-900">{row.studentName}</td>
                        <td className="border-r border-zinc-200 px-3 py-2 text-xs text-zinc-600">{row.origin}</td>
                        <td className="border-r border-zinc-200 px-3 py-2 text-zinc-700">{row.overallScore}%</td>
                        <td className="border-r border-zinc-200 px-3 py-2 text-xs text-zinc-500">{row.timestamp ? new Date(row.timestamp).toLocaleString() : 'n/a'}</td>
                        {publishedBoard.columns.map((column) => {
                          const cell = row.cellMap.get(column.id);
                          const tone = cell?.correct === true
                            ? 'bg-emerald-50 text-emerald-700'
                            : cell?.correct === false
                              ? 'bg-red-50 text-red-700'
                              : 'bg-zinc-50 text-zinc-500';
                          return (
                            <td key={`${row.sessionId}-${column.id}`} className={`border-r border-zinc-200 px-3 py-2 text-center text-xs ${tone}`}>
                              {cell ? `${cell.score}%` : '—'}
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
        ) : null}
      </div>
    </div>
  );
}
