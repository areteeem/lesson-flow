import { lazy, Suspense, useEffect, useState } from 'react';
import { deleteLesson, loadLessons, loadSessions, saveLesson } from './storage';
import { createLessonTemplate, createPromptPresetLesson } from './utils/builder';

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

export default function App() {
  const [screen, setScreen] = useState('home');
  const [lessons, setLessons] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [showGuide, setShowGuide] = useState(false);

  const refresh = () => {
    setLessons(loadLessons());
    setSessions(loadSessions());
  };

  useEffect(() => {
    refresh();
  }, []);

  const openEditor = (lesson = null) => {
    setCurrentLesson(lesson);
    setScreen('editor');
  };

  const handleSave = (lesson) => {
    const saved = saveLesson(lesson);
    setCurrentLesson(saved);
    refresh();
  };

  const handlePlay = (lesson) => {
    const saved = saveLesson(lesson);
    setCurrentLesson(saved);
    refresh();
    setScreen('play');
  };

  const handleApplyGuidePreset = (config) => {
    const nextLesson = createPromptPresetLesson(config, screen === 'editor' ? currentLesson : null);
    setCurrentLesson(nextLesson);
    setScreen('editor');
    setShowGuide(false);
  };

  return (
    <>
      {screen === 'home' && (
        <Suspense fallback={<ScreenFallback label="Loading lessons…" />}>
          <RecentLessons
            lessons={lessons}
            sessions={sessions}
            onCreate={(template) => openEditor(createLessonTemplate(template))}
            onSelect={(lesson) => openEditor(lesson)}
            onDelete={(id) => {
              deleteLesson(id);
              refresh();
            }}
            onImport={(lesson) => openEditor(lesson)}
          />
        </Suspense>
      )}

      {screen === 'editor' && (
        <Suspense fallback={<ScreenFallback label="Loading editor…" />}>
          <Editor
            lesson={currentLesson}
            onSave={handleSave}
            onPlay={handlePlay}
            onBack={() => {
              refresh();
              setScreen('home');
            }}
          />
        </Suspense>
      )}

      {screen === 'play' && currentLesson && (
        <Suspense fallback={<ScreenFallback label="Loading lesson player…" />}>
          <LessonPlayer
            lesson={currentLesson}
            onExit={() => {
              refresh();
              setScreen('home');
            }}
          />
        </Suspense>
      )}

      {screen === 'settings' && (
        <Suspense fallback={<ScreenFallback label="Loading settings…" />}>
          <SettingsPage onBack={() => setScreen('home')} />
        </Suspense>
      )}

      {screen === 'profiles' && (
        <Suspense fallback={<ScreenFallback label="Loading profiles…" />}>
          <StudentProfiles sessions={sessions} onBack={() => setScreen('home')} />
        </Suspense>
      )}

      {screen !== 'play' && (
        <div className="fixed bottom-6 right-6 z-30 flex gap-2">
          {screen === 'home' && (
            <>
              <button
                type="button"
                onClick={() => setScreen('profiles')}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-white text-lg text-zinc-700 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition hover:border-zinc-900"
                title="Student Profiles"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="9" cy="6" r="3"/><path d="M3 16c0-3 2.7-5.5 6-5.5s6 2.5 6 5.5"/></svg>
              </button>
              <button
                type="button"
                onClick={() => setScreen('settings')}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-200 bg-white text-lg text-zinc-700 shadow-[0_8px_24px_rgba(0,0,0,0.08)] transition hover:border-zinc-900"
                title="Settings"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 2.75 10.12 4.3l1.9.3.63 1.82 1.72 1.03-.35 1.9.35 1.9-1.72 1.03-.63 1.82-1.9.3L9 15.25l-1.12-1.55-1.9-.3-.63-1.82-1.72-1.03.35-1.9-.35-1.9 1.72-1.03.63-1.82 1.9-.3L9 2.75Z"/><circle cx="9" cy="9" r="2.2"/></svg>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-900 bg-zinc-900 text-lg text-white shadow-[0_8px_24px_rgba(0,0,0,0.15)] transition hover:scale-[1.02] hover:bg-zinc-800"
          >
            ?
          </button>
        </div>
      )}

      {showGuide && (
        <Suspense fallback={<ScreenFallback label="Loading guide…" />}>
          <GuidePanel onClose={() => setShowGuide(false)} onApplyPreset={handleApplyGuidePreset} />
        </Suspense>
      )}
    </>
  );
}
