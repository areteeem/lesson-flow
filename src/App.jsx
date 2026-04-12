import { lazy, Suspense, useState, useCallback, useEffect, useMemo } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAppContext } from './context/AppContext';
import { createLessonTemplate, createPromptPresetLesson } from './utils/builder';
import ErrorBoundary from './components/ErrorBoundary';
import { PersonIcon, GearIcon, QuestionIcon } from './components/Icons';
import DebugPanel from './components/DebugPanel';
import { recordDebugEvent } from './utils/debug';
import { applyThemePreference, getThemePreference } from './utils/theme';
import { getSessionUser, subscribeSessionUser } from './utils/accountAuth';
import { applyCompactMode, readCompactModeFromSettings } from './utils/appSettings';

const Editor = lazy(() => import('./components/Editor'));
const GuidePanel = lazy(() => import('./components/GuidePanel'));
const LessonPlayer = lazy(() => import('./components/LessonPlayer'));
const RecentLessons = lazy(() => import('./components/RecentLessons'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const StudentProfiles = lazy(() => import('./components/StudentProfiles'));
const GradingConsole = lazy(() => import('./components/GradingConsole'));
const LiveHost = lazy(() => import('./components/LiveHost'));
const LiveJoin = lazy(() => import('./components/LiveJoin'));
const SharedLessonPreview = lazy(() => import('./components/SharedLessonPreview'));
const TeacherAuthScreen = lazy(() => import('./components/TeacherAuthScreen'));
const AssignmentPlayerPage = lazy(() => import('./components/AssignmentPlayerPage'));
const SharedResultPage = lazy(() => import('./components/SharedResultPage'));

const EDITOR_MODES = ['dsl', 'builder', 'preview', 'grading', 'ai'];

function normalizeEditorMode(value) {
  return EDITOR_MODES.includes(value) ? value : 'builder';
}

function slugifyLessonSegment(value = '') {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function extractLessonIdFromRef(value = '') {
  return String(value || '').trim().split('-')[0] || '';
}

function buildEditorPath(lesson, mode = 'builder', hash = '') {
  const normalizedMode = normalizeEditorMode(mode);
  const lessonId = lesson?.id ? String(lesson.id) : 'new';
  const lessonSlug = slugifyLessonSegment(lesson?.title || '');
  const lessonRef = lessonId === 'new' ? 'new' : lessonSlug ? `${lessonId}-${lessonSlug}` : lessonId;
  const normalizedHash = String(hash || '').replace(/^#/, '').trim();
  return `/editor/${normalizedMode}/${lessonRef}${normalizedHash ? `#${normalizedHash}` : ''}`;
}

function readStoredCurrentLesson() {
  try {
    const stored = sessionStorage.getItem('lf_current_lesson');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function resolveLessonFromRoute(lessons, lessonId, lessonRef) {
  const ref = lessonRef && lessonRef !== 'new' ? String(lessonRef) : lessonId && lessonId !== 'new' ? String(lessonId) : '';
  if (!ref) return null;

  const directId = extractLessonIdFromRef(ref);
  const routeSlug = ref.includes('-') ? ref.slice(ref.indexOf('-') + 1) : '';

  return (lessons || []).find((lesson) => {
    if (!lesson) return false;
    if (String(lesson.id || '') === directId) return true;
    return routeSlug && slugifyLessonSegment(lesson.title || '') === routeSlug;
  }) || null;
}

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
          onCreate={(payload) => {
            const template = typeof payload === 'string' ? payload : payload?.template;
            const customTitle = typeof payload === 'object' ? payload?.title : '';
            const lesson = createLessonTemplate(template || 'blank');
            if (customTitle?.trim()) lesson.title = customTitle.trim();
            persistCurrentLesson(lesson);
            navigate(buildEditorPath(lesson, 'builder'));
          }}
          onSelect={(lesson) => {
            persistCurrentLesson(lesson);
            navigate(buildEditorPath(lesson, 'builder'));
          }}
          onPractice={(lesson) => {
            persistCurrentLesson(lesson);
            navigate(`/play/${lesson.id}?mode=practice`);
          }}
          onDelete={(id) => deleteLesson(id)}
          onDeleteSession={(id) => deleteSession(id)}
          onSave={(lesson) => saveLesson(lesson)}
          folders={folders}
          onSaveFolders={saveFolders}
          onImport={(lesson) => {
            persistCurrentLesson(lesson);
            navigate(buildEditorPath(lesson, 'builder'));
          }}
        />
      </Suspense>
    </ErrorBoundary>
  );
}

function EditorPage({ forcedMode = '' }) {
  const { lessons, saveLesson, saveLessonSilent, refresh } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const { lessonId, editorMode, lessonRef } = useParams();
  const [showGuide, setShowGuide] = useState(false);
  const routeMode = normalizeEditorMode(forcedMode || editorMode);
  const requestedOverlay = String(location.hash || '').replace(/^#/, '').trim().toLowerCase();
  const routedLesson = useMemo(() => resolveLessonFromRoute(lessons, lessonId, lessonRef), [lessonId, lessonRef, lessons]);
  const [currentLesson, setCurrentLesson] = useState(() => routedLesson || readStoredCurrentLesson());

  useEffect(() => {
    if (routedLesson) {
      setCurrentLesson(routedLesson);
      persistCurrentLesson(routedLesson);
      return;
    }

    if (lessonRef === 'new' || lessonId === 'new' || (!lessonId && !lessonRef)) {
      const stored = readStoredCurrentLesson();
      if (stored) setCurrentLesson(stored);
    }
  }, [lessonId, lessonRef, routedLesson]);

  const syncEditorLocation = useCallback((nextMode, lesson, hashValue = requestedOverlay) => {
    const targetLesson = lesson || currentLesson || routedLesson || readStoredCurrentLesson();
    const nextPath = buildEditorPath(targetLesson, nextMode, hashValue);
    if (`${location.pathname}${location.hash}` !== nextPath) {
      navigate(nextPath, { replace: true });
    }
  }, [currentLesson, location.hash, location.pathname, navigate, requestedOverlay, routedLesson]);

  const handleSave = useCallback((lesson) => {
    const saved = saveLesson(lesson);
    setCurrentLesson(saved);
    try {
      sessionStorage.setItem('lf_current_lesson', JSON.stringify(saved));
    } catch {
      // Ignore session storage write failures.
    }
    syncEditorLocation(routeMode, saved);
    return saved;
  }, [routeMode, saveLesson, syncEditorLocation]);

  const handleSaveSilent = useCallback((lesson) => {
    const saved = saveLessonSilent(lesson);
    setCurrentLesson(saved);
    try {
      sessionStorage.setItem('lf_current_lesson', JSON.stringify(saved));
    } catch {
      // Ignore session storage write failures.
    }
    return saved;
  }, [saveLessonSilent]);

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

  const handleNavigateMode = useCallback((nextMode, lesson) => {
    syncEditorLocation(nextMode, lesson);
  }, [syncEditorLocation]);

  const handleNavigateOverlay = useCallback((nextHash, nextMode, lesson) => {
    syncEditorLocation(nextMode || routeMode, lesson, nextHash || '');
  }, [routeMode, syncEditorLocation]);

  return (
    <ErrorBoundary message="Editor crashed. Your latest save is preserved.">
      <Suspense fallback={<ScreenFallback label="Loading editor…" />}>
        <Editor
          lesson={currentLesson}
          routeMode={routeMode}
          requestedOverlay={requestedOverlay}
          onNavigateMode={handleNavigateMode}
          onNavigateOverlay={handleNavigateOverlay}
          onSave={handleSave}
          onSaveSilent={handleSaveSilent}
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
  const location = useLocation();

  const [lesson] = useState(() => {
    try {
      const stored = sessionStorage.getItem('lf_current_lesson');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  if (!lesson) return <MissingSessionScreen title="Lesson not found" description="The player session is missing or expired. Reload the lesson from the home screen." onBack={() => navigate('/')} />;

  const isPracticeMode = new URLSearchParams(location.search).get('mode') === 'practice';

  return (
    <ErrorBoundary message="Player crashed.">
      <Suspense fallback={<ScreenFallback label="Loading lesson player…" />}>
        <LessonPlayer lesson={lesson} mode={isPracticeMode ? 'practice' : 'default'} onExit={() => { refresh(); navigate('/'); }} />
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

function GradingRoute() {
  const { sessions, refresh } = useAppContext();
  const navigate = useNavigate();
  return (
    <ErrorBoundary message="Grading console crashed.">
      <Suspense fallback={<ScreenFallback label="Loading grading console…" />}>
        <GradingConsole sessions={sessions} onBack={() => navigate('/')} onSessionsChanged={refresh} requireLessonSelection />
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

function SharePreviewPage() {
  const navigate = useNavigate();
  return (
    <ErrorBoundary message="Shared lesson preview crashed.">
      <Suspense fallback={<ScreenFallback label="Loading shared lesson…" />}>
        <SharedLessonPreview
          onMakeCopy={(lesson) => {
            persistCurrentLesson(lesson);
            navigate(buildEditorPath(lesson, 'builder'));
          }}
          onBack={() => navigate('/')}
        />
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
  const isSharePreview = location.pathname.startsWith('/share/');
  const isAssignmentMode = location.pathname.startsWith('/assign/') || location.pathname.startsWith('/assignment/');
  const isSharedResult = location.pathname.startsWith('/result/');
  const isHome = location.pathname === '/';
  const [showGuide, setShowGuide] = useState(false);
  const [sessionUser, setSessionUser] = useState(getSessionUser);

  const teacherRoutesLocked = !isJoinMode && !isSharePreview && !isAssignmentMode && !isSharedResult;
  const needsTeacherAuth = teacherRoutesLocked && (!sessionUser || sessionUser.isAnonymous);

  const handleApplyGuidePresetFromHome = useCallback((config) => {
    const nextLesson = createPromptPresetLesson(config, null);
    persistCurrentLesson(nextLesson);
    setShowGuide(false);
    navigate(buildEditorPath(nextLesson, 'builder'));
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

  useEffect(() => {
    applyThemePreference(getThemePreference());
    applyCompactMode(readCompactModeFromSettings());
  }, []);

  useEffect(() => subscribeSessionUser((user) => {
    setSessionUser(user);
    applyCompactMode(readCompactModeFromSettings());
  }), []);

  if (needsTeacherAuth) {
    return (
      <Suspense fallback={<ScreenFallback label="Loading teacher authentication…" />}>
        <TeacherAuthScreen />
      </Suspense>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/editor/new" element={<EditorPage />} />
        <Route path="/editor/dsl" element={<EditorPage forcedMode="dsl" />} />
        <Route path="/editor/builder" element={<EditorPage forcedMode="builder" />} />
        <Route path="/editor/preview" element={<EditorPage forcedMode="preview" />} />
        <Route path="/editor/grading" element={<EditorPage forcedMode="grading" />} />
        <Route path="/editor/ai" element={<EditorPage forcedMode="ai" />} />
        <Route path="/editor/:editorMode/:lessonRef" element={<EditorPage />} />
        <Route path="/editor/:lessonId" element={<EditorPage />} />
        <Route path="/play/:lessonId" element={<PlayPage />} />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="/profiles" element={<ProfilesRoute />} />
        <Route path="/grading" element={<GradingRoute />} />
        <Route path="/live/host" element={<LiveHostPage />} />
        <Route path="/live/join" element={<LiveJoinPage />} />
        <Route path="/share/:shareId" element={<SharePreviewPage />} />
        <Route path="/assign/:assignmentId" element={<AssignmentPlayerPage />} />
        <Route path="/assignment/:assignmentId" element={<AssignmentPlayerPage />} />
        <Route path="/result/:shareId" element={<SharedResultPage />} />
      </Routes>

      {!isPlaying && !isEditor && !isSharePreview && !isAssignmentMode && !isSharedResult && (
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
                onClick={() => navigate('/grading')}
                className="flex h-12 items-center justify-center rounded-full border border-zinc-200 bg-white px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-700 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition hover:border-zinc-900"
                title="Grading Console"
                aria-label="Grading Console"
              >
                Grades
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
