import { useMemo, useRef, useState } from 'react';
import { exportSession, importLesson, printSessionReport } from '../storage';
import { generateDSL } from '../parser';

function previewText(lesson) {
  if (lesson.dsl) {
    return lesson.dsl.split('\n').find((line) => !line.startsWith('#') && !line.startsWith('Title:') && line.trim()) || 'Interactive lesson';
  }
  return generateDSL(lesson).split('\n').find((line) => !line.startsWith('#') && !line.startsWith('Title:') && line.trim()) || 'Interactive lesson';
}

function SessionPreviewModal({ session, onClose }) {
  if (!session) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/30 p-4">
      <button type="button" onClick={onClose} className="absolute inset-0" />
      <div className="relative mx-auto max-w-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Recent Session</div>
            <div className="mt-1 text-xl font-semibold text-zinc-950">{session.lessonTitle}</div>
            <div className="mt-2 text-sm text-zinc-600">{session.studentName || 'Unknown student'} | {new Date(session.timestamp).toLocaleString()} | {session.score}%</div>
          </div>
          <button type="button" onClick={onClose} className="border border-zinc-200 px-3 py-2 text-xs text-zinc-700">Close</button>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Score</div>
            <div className="mt-1 text-lg font-semibold text-zinc-950">{session.score}%</div>
          </div>
          <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Correct</div>
            <div className="mt-1 text-lg font-semibold text-zinc-950">{session.correctCount ?? '-'}</div>
          </div>
          <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Reviewed</div>
            <div className="mt-1 text-lg font-semibold text-zinc-950">{session.completedCount ?? '-'}</div>
          </div>
          <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Graded</div>
            <div className="mt-1 text-lg font-semibold text-zinc-950">{session.total ?? '-'}</div>
          </div>
        </div>
        <div className="mt-5 border border-zinc-200 bg-zinc-50 p-4 text-sm leading-7 text-zinc-700 whitespace-pre-wrap">{session.lessonPreview || 'No saved lesson preview for this session.'}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => exportSession(session)} className="border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700">Export JSON</button>
          <button type="button" onClick={() => printSessionReport(session)} className="border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700">Print Report</button>
        </div>
      </div>
    </div>
  );
}

const LESSON_CATEGORIES = [
  { id: 'all', label: 'All Lessons' },
  { id: 'general', label: 'General English' },
  { id: 'business', label: 'Business English' },
  { id: 'ielts', label: 'IELTS / TOEFL' },
  { id: 'kids', label: 'Kids & Young Learners' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'exam', label: 'Exam Practice' },
  { id: 'grammar', label: 'Grammar' },
  { id: 'vocabulary', label: 'Vocabulary' },
  { id: 'reading', label: 'Reading' },
];

export default function RecentLessons({ lessons, sessions, onCreate, onSelect, onDelete, onImport }) {
  const inputRef = useRef(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const activeSession = useMemo(() => sessions.find((session) => session.id === activeSessionId) || null, [activeSessionId, sessions]);
  const sessionStats = useMemo(() => {
    const averageScore = sessions.length ? Math.round(sessions.reduce((sum, session) => sum + (session.score || 0), 0) / sessions.length) : 0;
    const uniqueStudents = new Set(sessions.map((session) => session.studentName).filter(Boolean)).size;
    return { averageScore, uniqueStudents, totalSessions: sessions.length };
  }, [sessions]);

  const filteredLessons = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return lessons.filter((lesson) => {
      if (q && !(lesson.title || '').toLowerCase().includes(q)) return false;
      if (selectedCategory !== 'all' && lesson.category && lesson.category !== selectedCategory) return false;
      return true;
    });
  }, [lessons, searchQuery, selectedCategory]);

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const lesson = await importLesson(file);
      onImport(lesson);
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f7f7f5]">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-3">
        <div>
          <div className="text-lg font-semibold tracking-tight text-zinc-950">Lesson Flow</div>
        </div>
        <div className="flex items-center gap-2">
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search lessons…" className="w-full sm:w-56 border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-zinc-900" />
          <button type="button" onClick={() => inputRef.current?.click()} className="border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-900">Import</button>
          <input ref={inputRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar — stats + quick create + categories */}
        <aside className="hidden w-[260px] shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex">
          <div className="border-b border-zinc-200 p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="border border-zinc-200 bg-zinc-50 px-2 py-2">
                <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">Score</div>
                <div className="mt-0.5 text-sm font-semibold text-zinc-950">{sessionStats.averageScore}%</div>
              </div>
              <div className="border border-zinc-200 bg-zinc-50 px-2 py-2">
                <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">Students</div>
                <div className="mt-0.5 text-sm font-semibold text-zinc-950">{sessionStats.uniqueStudents}</div>
              </div>
              <div className="border border-zinc-200 bg-zinc-50 px-2 py-2">
                <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">Sessions</div>
                <div className="mt-0.5 text-sm font-semibold text-zinc-950">{sessionStats.totalSessions}</div>
              </div>
            </div>
          </div>
          <div className="border-b border-zinc-200 p-4">
            <button type="button" onClick={() => onCreate('blank')} className="mb-2 w-full border border-zinc-900 bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white">
              + New Lesson
            </button>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button type="button" onClick={() => onCreate('grammar')} className="border border-zinc-200 px-2 py-1.5 text-zinc-600 hover:border-zinc-900">Grammar</button>
              <button type="button" onClick={() => onCreate('vocabulary')} className="border border-zinc-200 px-2 py-1.5 text-zinc-600 hover:border-zinc-900">Vocabulary</button>
              <button type="button" onClick={() => onCreate('reading')} className="border border-zinc-200 px-2 py-1.5 text-zinc-600 hover:border-zinc-900">Reading</button>
              <button type="button" onClick={() => onCreate('catalog')} className="border border-zinc-200 px-2 py-1.5 text-zinc-600 hover:border-zinc-900">All Types</button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">Categories</div>
            <div className="space-y-0.5">
              {LESSON_CATEGORIES.map((cat) => (
                <button key={cat.id} type="button" onClick={() => setSelectedCategory(cat.id)} className={selectedCategory === cat.id ? 'w-full bg-zinc-900 px-3 py-1.5 text-left text-xs font-medium text-white' : 'w-full px-3 py-1.5 text-left text-xs text-zinc-600 hover:bg-zinc-50'}>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Main content area */}
        <main className="min-h-0 flex-1 overflow-auto p-5">
          {/* Lesson grid */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              {filteredLessons.length} lesson{filteredLessons.length !== 1 ? 's' : ''}
              {selectedCategory !== 'all' && ` in ${LESSON_CATEGORIES.find((c) => c.id === selectedCategory)?.label}`}
            </div>
            {/* Mobile create button */}
            <button type="button" onClick={() => onCreate('blank')} className="border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white lg:hidden">+ New</button>
          </div>

          {filteredLessons.length === 0 && (
            <div className="border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
              <div className="text-sm text-zinc-500">{searchQuery ? 'No lessons match your search.' : 'No lessons yet. Create your first one!'}</div>
              {!searchQuery && <button type="button" onClick={() => onCreate('blank')} className="mt-4 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white">Create Lesson</button>}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{filteredLessons.map((lesson) => (
            <div key={lesson.id} className="group flex flex-col border border-zinc-200 bg-white transition hover:border-zinc-900">
              <button type="button" onClick={() => onSelect(lesson)} className="flex-1 p-4 text-left">
                <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">{lesson.category || 'general'}</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{lesson.title || 'Untitled lesson'}</div>
                <div className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{previewText(lesson)}</div>
              </button>
              <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2">
                <div className="text-[10px] text-zinc-400">{lesson.updatedAt ? new Date(lesson.updatedAt).toLocaleDateString() : ''}</div>
                <button type="button" onClick={() => onDelete(lesson.id)} className="text-[10px] text-zinc-400 opacity-0 transition hover:text-red-600 group-hover:opacity-100">Delete</button>
              </div>
            </div>
          ))}</div>

          {/* Recent sessions section */}
          {sessions.length > 0 && (
            <div className="mt-8">
              <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Recent Sessions</div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {sessions.slice(0, 6).map((session) => (
                  <button key={session.id} type="button" onClick={() => setActiveSessionId(session.id)} className="border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-900">
                    <div className="text-xs font-medium text-zinc-900">{session.lessonTitle}</div>
                    <div className="mt-1 text-[10px] text-zinc-500">{session.studentName || 'Unknown'} · {new Date(session.timestamp).toLocaleDateString()} · {session.score}%</div>
                  </button>
              ))}
              </div>
            </div>
          )}
        </main>

        {/* Right sidebar — session detail on wider screens */}
        {sessions.length > 0 && (
          <aside className="hidden w-[260px] shrink-0 border-l border-zinc-200 bg-white xl:block">
            <div className="border-b border-zinc-200 px-4 py-3">
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">Latest Session</div>
            </div>
            <div className="p-4">
              {sessions[0] && (
                <div>
                  <div className="text-sm font-medium text-zinc-900">{sessions[0].lessonTitle}</div>
                  <div className="mt-1 text-xs text-zinc-500">{sessions[0].studentName || 'Unknown'} · {sessions[0].score}%</div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="border border-zinc-200 bg-zinc-50 px-2 py-2 text-center">
                      <div className="text-[9px] uppercase text-zinc-500">Correct</div>
                      <div className="text-sm font-semibold">{sessions[0].correctCount ?? '-'}</div>
                    </div>
                    <div className="border border-zinc-200 bg-zinc-50 px-2 py-2 text-center">
                      <div className="text-[9px] uppercase text-zinc-500">Total</div>
                      <div className="text-sm font-semibold">{sessions[0].total ?? '-'}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      <SessionPreviewModal session={activeSession} onClose={() => setActiveSessionId(null)} />
    </div>
  );
}
