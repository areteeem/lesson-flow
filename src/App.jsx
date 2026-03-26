import { lazy, Suspense, useState, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from './context/AppContext';
import { createLessonTemplate, createPromptPresetLesson } from './utils/builder';
import ErrorBoundary from './components/ErrorBoundary';
import { PersonIcon, GearIcon, QuestionIcon } from './components/Icons';

const Editor = lazy(() => import('./components/Editor'));
const GuidePanel = lazy(() => import('./components/GuidePanel'));
const LessonPlayer = lazy(() => import('./components/LessonPlayer'));
const RecentLessons = lazy(() => import('./components/RecentLessons'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const StudentProfiles = lazy(() => import('./components/StudentProfiles'));

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

function HomePage() {
  const { lessons, sessions, deleteLesson } = useAppContext();
  const navigate = useNavigate();

  return (
    <ErrorBoundary message="Failed to load lessons.">
      <Suspense fallback={<ScreenFallback label="Loading lessons…" />}>
        <RecentLessons
          lessons={lessons}
          sessions={sessions}
          onCreate={(template) => {
            const lesson = createLessonTemplate(template);
            sessionStorage.setItem('lf_current_lesson', JSON.stringify(lesson));
            navigate('/editor/new');
          }}
          onSelect={(lesson) => {
            sessionStorage.setItem('lf_current_lesson', JSON.stringify(lesson));
            navigate(`/editor/${lesson.id}`);
          }}
          onDelete={(id) => deleteLesson(id)}
          onImport={(lesson) => {
            sessionStorage.setItem('lf_current_lesson', JSON.stringify(lesson));
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
    setCurrentLesson(saved);
    try { sessionStorage.setItem('lf_current_lesson', JSON.stringify(saved)); } catch {}
  }, [saveLesson]);

  const handlePlay = useCallback((lesson) => {
    const saved = saveLesson(lesson);
    setCurrentLesson(saved);
    try { sessionStorage.setItem('lf_current_lesson', JSON.stringify(saved)); } catch {}
    navigate(`/play/${saved.id}`);
  }, [saveLesson, navigate]);

  const handleApplyGuidePreset = useCallback((config) => {
    const nextLesson = createPromptPresetLesson(config, currentLesson);
    setCurrentLesson(nextLesson);
    try { sessionStorage.setItem('lf_current_lesson', JSON.stringify(nextLesson)); } catch {}
    setShowGuide(false);
  }, [currentLesson]);

  return (
    <ErrorBoundary message="Editor crashed. Your latest save is preserved.">
      <Suspense fallback={<ScreenFallback label="Loading editor…" />}>
        <Editor
          lesson={currentLesson}
          onSave={handleSave}
          onPlay={handlePlay}
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

  if (!lesson) {
    navigate('/');
    return null;
  }

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
  const { sessions } = useAppContext();
  const navigate = useNavigate();
  return (
    <ErrorBoundary message="Profiles crashed.">
      <Suspense fallback={<ScreenFallback label="Loading profiles…" />}>
        <StudentProfiles sessions={sessions} onBack={() => navigate('/')} />
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isPlaying = location.pathname.startsWith('/play');
  const isEditor = location.pathname.startsWith('/editor');
  const isHome = location.pathname === '/';
  const [showGuide, setShowGuide] = useState(false);

  const handleApplyGuidePresetFromHome = useCallback((config) => {
    const nextLesson = createPromptPresetLesson(config, null);
    sessionStorage.setItem('lf_current_lesson', JSON.stringify(nextLesson));
    setShowGuide(false);
    navigate('/editor/new');
  }, [navigate]);

  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/editor/:lessonId" element={<EditorPage />} />
        <Route path="/play/:lessonId" element={<PlayPage />} />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="/profiles" element={<ProfilesRoute />} />
      </Routes>

      {!isPlaying && !isEditor && (
        <div className="fixed bottom-20 right-6 z-30 flex gap-2 sm:bottom-6">
          {isHome && (
            <>
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
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-900 bg-zinc-900 text-lg text-white shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition hover:scale-[1.02] hover:bg-zinc-800"
            aria-label="Open guide"
          >
            <QuestionIcon />
          </button>
        </div>
      )}

      {showGuide && !location.pathname.startsWith('/editor') && (
        <Suspense fallback={<ScreenFallback label="Loading guide…" />}>
          <GuidePanel onClose={() => setShowGuide(false)} onApplyPreset={handleApplyGuidePresetFromHome} />
        </Suspense>
      )}
    </>
  );
}
