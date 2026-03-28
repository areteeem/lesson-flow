import { lazy, Suspense, useState, useCallback, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from './context/AppContext';
import { createLessonTemplate, createPromptPresetLesson } from './utils/builder';
import ErrorBoundary from './components/ErrorBoundary';
import { PersonIcon, GearIcon, QuestionIcon } from './components/Icons';
import DebugPanel from './components/DebugPanel';
import { recordDebugEvent } from './utils/debug';

const Editor = lazy(() => import('./components/Editor'));
const GuidePanel = lazy(() => import('./components/GuidePanel'));
const LessonPlayer = lazy(() => import('./components/LessonPlayer'));
const RecentLessons = lazy(() => import('./components/RecentLessons'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const StudentProfiles = lazy(() => import('./components/StudentProfiles'));
const LiveHost = lazy(() => import('./components/LiveHost'));
const LiveJoin = lazy(() => import('./components/LiveJoin'));

function ScreenFallback({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f7f7f5]">
      <div className="w-full max-w-2xl space-y-4 px-6">
        <div className="h-8 w-48 animate-pulse bg-zinc-200" />
        <div className="h-4 w-full animate-pulse bg-zinc-100" />
        <div className="h-4 w-3/4 animate-pulse bg-zinc-100" />
        <div className="h-32 w-full animate-pulse bg-zinc-100" />
        <div className="h-4 w-1/2 animate-pulse bg-zinc-100" />
      </div>
      <div className="mt-6 text-xs text-zinc-400">{label}</div>
    </div>
  );
}

function MissingSessionScreen({ title, description, onBack }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-6">
      <div className="max-w-lg border border-zinc-200 bg-white p-8 text-center">
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Session missing</div>
        <div className="mt-3 text-2xl font-semibold text-zinc-950">{title}</div>
        <div className="mt-3 text-sm text-zinc-500">{description}</div>
        <button type="button" onClick={onBack} className="mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white">Back to lessons</button>
      </div>
    </div>
  );
}

function persistCurrentLesson(lesson) {
  try {
    sessionStorage.setItem('lf_current_lesson', JSON.stringify(lesson));
  } catch {
    recordDebugEvent('storage_write_failed', { key: 'lf_current_lesson', scope: 'session' }, 'warn');
  }
}

function HomePage() {
  const { lessons, sessions, deleteLesson, deleteSession, saveLesson, folders, saveFolders } = useAppContext();
  const navigate = useNavigate();

  return (
    <ErrorBoundary message="Failed to load lessons.">
      <Suspense fallback={<ScreenFallback label="Loading lessons…" />}>
        <RecentLessons
          lessons={lessons}
          sessions={sessions}
          onCreate={(template) => {
            const lesson = createLessonTemplate(template);
            persistCurrentLesson(lesson);
            navigate('/editor/new');
          }}
          onSelect={(lesson) => {
            persistCurrentLesson(lesson);
            navigate(`/editor/${lesson.id}`);
          }}
          onDelete={(id) => deleteLesson(id)}
          onDeleteSession={(id) => deleteSession(id)}
          onSave={(lesson) => saveLesson(lesson)}
          folders={folders}
          onSaveFolders={saveFolders}
          onImport={(lesson) => {
            persistCurrentLesson(lesson);
            navigate('/editor/new');
          }}
        />
      </Suspense>
    </ErrorBoundary>
  );
}

function EditorPage() {
  const { saveLesson, refresh } = useAppContext();
  const navigate = useNavigate();
  const [showGuide, setShowGuide] = useState(false);

  const [currentLesson, setCurrentLesson] = useState(() => {
    try {
      const stored = sessionStorage.getItem('lf_current_lesson');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  const handleSave = useCallback((lesson) => {
    const saved = saveLesson(lesson);
    try {
      sessionStorage.setItem('lf_current_lesson', JSON.stringify(saved));
    } catch {
      // Ignore session storage write failures.
    }
    return saved;
  }, [saveLesson]);

  const handlePlay = useCallback((lesson) => {
    const saved = saveLesson(lesson);
    setCurrentLesson(saved);
    try {
      sessionStorage.setItem('lf_current_lesson', JSON.stringify(saved));
    } catch {
      // Ignore session storage write failures.
    }
    navigate(`/play/${saved.id}`);
  }, [saveLesson, navigate]);

  const handleApplyGuidePreset = useCallback((config) => {
    const nextLesson = createPromptPresetLesson(config, currentLesson);
    setCurrentLesson(nextLesson);
    try {
      sessionStorage.setItem('lf_current_lesson', JSON.stringify(nextLesson));
    } catch {
      // Ignore session storage write failures.
    }
    setShowGuide(false);
  }, [currentLesson]);

  return (
    <ErrorBoundary message="Editor crashed. Your latest save is preserved.">
      <Suspense fallback={<ScreenFallback label="Loading editor…" />}>
        <Editor
          lesson={currentLesson}
          onSave={handleSave}
          onPlay={handlePlay}
          onGoLive={(lesson) => {
            const saved = saveLesson(lesson);
            setCurrentLesson(saved);
            try {
              sessionStorage.setItem('lf_current_lesson', JSON.stringify(saved));
            } catch {
              // Ignore session storage write failures.
            }
            navigate('/live/host');
          }}
          onBack={() => { refresh(); navigate('/'); }}
          onOpenGuide={() => setShowGuide(true)}
        />
      </Suspense>
      {showGuide && (
        <Suspense fallback={<ScreenFallback label="Loading guide…" />}>
          <GuidePanel onClose={() => setShowGuide(false)} onApplyPreset={handleApplyGuidePreset} />
        </Suspense>
      )}
    </ErrorBoundary>
  );
}

function PlayPage() {
  const { refresh } = useAppContext();
  const navigate = useNavigate();

  const [lesson] = useState(() => {
    try {
      const stored = sessionStorage.getItem('lf_current_lesson');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  if (!lesson) return <MissingSessionScreen title="Lesson not found" description="The player session is missing or expired. Reload the lesson from the home screen." onBack={() => navigate('/')} />;

  return (
    <ErrorBoundary message="Player crashed.">
      <Suspense fallback={<ScreenFallback label="Loading lesson player…" />}>
        <LessonPlayer lesson={lesson} onExit={() => { refresh(); navigate('/'); }} />
      </Suspense>
    </ErrorBoundary>
  );
}

function SettingsRoute() {
  const navigate = useNavigate();
  return (
    <ErrorBoundary message="Settings crashed.">
      <Suspense fallback={<ScreenFallback label="Loading settings…" />}>
        <SettingsPage onBack={() => navigate('/')} />
      </Suspense>
    </ErrorBoundary>
  );
}

function ProfilesRoute() {
  const { sessions, deleteSession } = useAppContext();
  const navigate = useNavigate();
  return (
    <ErrorBoundary message="Profiles crashed.">
      <Suspense fallback={<ScreenFallback label="Loading profiles…" />}>
        <StudentProfiles sessions={sessions} onDeleteSession={deleteSession} onBack={() => navigate('/')} />
      </Suspense>
    </ErrorBoundary>
  );
}

function LiveHostPage() {
  const { refresh } = useAppContext();
  const navigate = useNavigate();
  const [lesson] = useState(() => {
    try {
      const stored = sessionStorage.getItem('lf_current_lesson');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  if (!lesson) return <MissingSessionScreen title="Live lesson not found" description="The live host session is missing or expired. Re-open the lesson from the editor." onBack={() => navigate('/')} />;
  return (
    <ErrorBoundary message="Live host crashed.">
      <Suspense fallback={<ScreenFallback label="Starting live quiz…" />}>
        <LiveHost lesson={lesson} onExit={() => { refresh(); navigate('/'); }} />
      </Suspense>
    </ErrorBoundary>
  );
}

function LiveJoinPage() {
  const navigate = useNavigate();
  return (
    <ErrorBoundary message="Live join crashed.">
      <Suspense fallback={<ScreenFallback label="Joining quiz…" />}>
        <LiveJoin onExit={() => navigate('/')} />
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isPlaying = location.pathname.startsWith('/play');
  const isEditor = location.pathname.startsWith('/editor');
  const isJoinMode = location.pathname.startsWith('/live/join');
  const isHome = location.pathname === '/';
  const [showGuide, setShowGuide] = useState(false);

  const handleApplyGuidePresetFromHome = useCallback((config) => {
    const nextLesson = createPromptPresetLesson(config, null);
    persistCurrentLesson(nextLesson);
    setShowGuide(false);
    navigate('/editor/new');
  }, [navigate]);

  useEffect(() => {
    const onError = (event) => {
      recordDebugEvent('window_error', {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack || null,
      }, 'error');
    };
    const onUnhandledRejection = (event) => {
      recordDebugEvent('unhandled_rejection', {
        reason: event.reason?.message || String(event.reason),
        stack: event.reason?.stack || null,
      }, 'error');
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/editor/:lessonId" element={<EditorPage />} />
        <Route path="/play/:lessonId" element={<PlayPage />} />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="/profiles" element={<ProfilesRoute />} />
        <Route path="/live/host" element={<LiveHostPage />} />
        <Route path="/live/join" element={<LiveJoinPage />} />
      </Routes>

      {!isPlaying && !isEditor && (
        <div className="fixed bottom-20 right-6 z-30 flex gap-2 sm:bottom-6">
          {isHome && (
            <>
              <button
                type="button"
                onClick={() => navigate('/live/join')}
                className="flex h-12 items-center justify-center rounded-full border border-red-600 bg-red-600 px-4 text-xs font-bold uppercase tracking-wider text-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition hover:bg-red-500"
                title="Join Live Quiz"
                aria-label="Join Live Quiz"
              >
                Join Quiz
              </button>
              <button
                type="button"
                onClick={() => navigate('/profiles')}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-white text-lg text-zinc-700 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition hover:border-zinc-900"
                title="Student Profiles"
                aria-label="Student Profiles"
              >
                <PersonIcon />
              </button>
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-white text-lg text-zinc-700 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition hover:border-zinc-900"
                title="Settings"
                aria-label="Settings"
              >
                <GearIcon />
              </button>
            </>
          )}
          {!isJoinMode && (
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-900 bg-zinc-900 text-lg text-white shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition hover:scale-[1.02] hover:bg-zinc-800"
              aria-label="Open guide"
            >
              <QuestionIcon />
            </button>
          )}
        </div>
      )}

      {showGuide && !location.pathname.startsWith('/editor') && (
        <Suspense fallback={<ScreenFallback label="Loading guide…" />}>
          <GuidePanel onClose={() => setShowGuide(false)} onApplyPreset={handleApplyGuidePresetFromHome} />
        </Suspense>
      )}
      <DebugPanel />
    </>
  );
}
