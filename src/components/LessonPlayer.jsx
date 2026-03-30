import { useEffect, useMemo, useRef, useState } from 'react';
import { getBlockLabel, normalizeVisibleBlocks, validateLessonStructure } from '../utils/lesson';
import GradingScreen from './GradingScreen';
import LessonStage from './LessonStage';
import { HamburgerIcon, FullscreenIcon, ExitFullscreenIcon } from './Icons';
import FontSettingsPanel, { loadFontSettings, getFontCSSVars } from './FontSettingsPanel';
import { recordDebugEvent } from '../utils/debug';

function useSwipe(onSwipeLeft, onSwipeRight) {
  const touchRef = useRef(null);
  const handlers = useMemo(() => ({
    onTouchStart: (e) => {
      const t = e.touches[0];
      touchRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
    },
    onTouchEnd: (e) => {
      if (!touchRef.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchRef.current.x;
      const dy = t.clientY - touchRef.current.y;
      const dt = Date.now() - touchRef.current.time;
      touchRef.current = null;
      if (dt > 500 || Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    },
  }), [onSwipeLeft, onSwipeRight]);
  return handlers;
}

export default function LessonPlayer({ lesson, onExit }) {
  const SIDEBAR_ITEM_HEIGHT = 76;
  const SIDEBAR_OVERSCAN = 6;
  const validation = useMemo(() => validateLessonStructure(lesson), [lesson]);
  const blocks = useMemo(() => normalizeVisibleBlocks(lesson?.blocks || []), [lesson]);
  const sessionKey = lesson?.id ? `lf-player-${lesson.id}` : null;
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (!sessionKey) return 0;
    try { return Number(sessionStorage.getItem(`${sessionKey}-idx`)) || 0; } catch { return 0; }
  });
  const [results, setResults] = useState(() => {
    if (!sessionKey) return {};
    try { return JSON.parse(sessionStorage.getItem(sessionKey)) || {}; } catch { return {}; }
  });
  const [showGrading, setShowGrading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSettings, setFontSettings] = useState(loadFontSettings);
  const [showFontPanel, setShowFontPanel] = useState(false);
  const shellRef = useRef(null);
  const sidebarViewportRef = useRef(null);
  const [sidebarScrollTop, setSidebarScrollTop] = useState(0);
  const [sidebarHeight, setSidebarHeight] = useState(560);

  useEffect(() => {
    if (!sidebarOpen || !sidebarViewportRef.current) return undefined;
    const viewport = sidebarViewportRef.current;
    const updateHeight = () => setSidebarHeight(viewport.clientHeight || 560);
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [sidebarOpen]);

  useEffect(() => {
    if (blocks.length === 0) {
      recordDebugEvent('lesson_player_empty', {
        lessonId: lesson?.id || null,
        title: lesson?.title || null,
        issues: validation.issues,
      }, validation.issues.length > 0 ? 'warn' : 'info');
    }
  }, [blocks.length, lesson?.id, lesson?.title, validation.issues]);

  // Enter fullscreen on mount
  useEffect(() => {
    const el = shellRef.current || document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    }
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      const el = shellRef.current || document.documentElement;
      el.requestFullscreen?.().catch(() => {});
    }
  };

  const handleExit = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    recordDebugEvent('lesson_player_exit', { lessonId: lesson?.id || null, currentIndex, totalBlocks: blocks.length });
    onExit();
  };

  // Persist results + index to sessionStorage so navigating back/forward preserves answers
  useEffect(() => {
    if (!sessionKey) return;
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify(results));
      sessionStorage.setItem(`${sessionKey}-idx`, String(currentIndex));
    } catch { /* quota exceeded — ignore */ }
  }, [results, currentIndex, sessionKey]);

  useEffect(() => {
    if (blocks.length === 0) return;
    if (currentIndex > blocks.length - 1) setCurrentIndex(blocks.length - 1);
  }, [blocks.length, currentIndex]);

  // Preload next block's media (audio/video/image)
  useEffect(() => {
    const next = blocks[currentIndex + 1];
    if (!next) return;
    const collectMedia = (b) => {
      const urls = [];
      const src = b?.media || b?.image || b?.video || b?.audio || b?.src || '';
      if (src && !src.startsWith('data:')) urls.push(src);
      if (b?.children) b.children.forEach((c) => urls.push(...collectMedia(c)));
      return urls;
    };
    const urls = collectMedia(next);
    const links = urls.map((url) => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      document.head.appendChild(link);
      return link;
    });
    return () => links.forEach((l) => l.remove());
  }, [currentIndex, blocks]);

  const isComplete = (block) => {
    if (!block) return false;
    if (block.type === 'group') {
      return block.children.every((child) => Boolean(results[child.id]));
    }
    if (block.type !== 'task') return true;
    return Boolean(results[block.id]);
  };

  const canAdvance = blocks.length > 0;

  const goNext = () => {
    if (blocks.length === 0) {
      setShowGrading(true);
      return;
    }
    if (currentIndex >= blocks.length - 1) {
      recordDebugEvent('lesson_complete', {
        lessonId: lesson?.id || null,
        totalBlocks: blocks.length,
        answered: Object.keys(results).length,
      });
      setShowGrading(true);
      return;
    }
    setCurrentIndex((value) => Math.min(blocks.length - 1, value + 1));
  };
  const goPrev = () => setCurrentIndex((v) => Math.max(0, v - 1));
  const swipeHandlers = useSwipe(goNext, goPrev);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT') return;
      if (event.key === 'ArrowLeft') setCurrentIndex((value) => Math.max(0, value - 1));
      if (event.key === 'ArrowRight' && canAdvance) {
        setCurrentIndex((value) => Math.min(blocks.length - 1, value + 1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [blocks.length, canAdvance]);

  const saveResult = (blockId, result) => {
    recordDebugEvent('task_complete', { lessonId: lesson?.id || null, blockId, correct: result?.correct ?? null, score: result?.score ?? null });
    setResults((currentResults) => ({ ...currentResults, [blockId]: result }));
  };

  const effectiveFontSettings = useMemo(() => {
    const s = lesson?.settings || {};
    return {
      fontId: s.fontFamily || fontSettings.fontId,
      sizeId: s.fontSize || fontSettings.sizeId,
      lineHeightId: s.lineHeight || fontSettings.lineHeightId,
    };
  }, [lesson?.settings, fontSettings]);

  if (blocks.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-6 text-center">
        <div className="max-w-xl border border-zinc-200 bg-white p-8">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Lesson complete</div>
          <div className="mt-3 text-2xl font-semibold text-zinc-950">No playable blocks available</div>
          <div className="mt-3 text-sm text-zinc-500">The player did not crash. The lesson has no visible slides or tasks, so there is nothing to render.</div>
          {validation.issues.length > 0 && (
            <div className="mt-4 border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
              {validation.issues.map((issue) => <div key={issue}>{issue}</div>)}
            </div>
          )}
          <button type="button" onClick={handleExit} className="mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white">Back to lessons</button>
        </div>
      </div>
    );
  }

  if (showGrading) {
    return <GradingScreen lesson={lesson} blocks={blocks} results={results} studentName={studentName} onStudentNameChange={setStudentName} onRestart={() => { setResults({}); setCurrentIndex(0); setShowGrading(false); }} onExit={handleExit} />;
  }

  const completedCount = blocks.filter(isComplete).length;
  const progressWidth = blocks.length > 0 ? `${(completedCount / blocks.length) * 100}%` : '0%';
  const current = blocks[currentIndex] || null;
  const virtualWindow = useMemo(() => {
    const total = blocks.length;
    if (total <= 60) {
      return {
        topPadding: 0,
        bottomPadding: 0,
        start: 0,
        end: total,
      };
    }

    const visible = Math.max(8, Math.ceil(sidebarHeight / SIDEBAR_ITEM_HEIGHT));
    const start = Math.max(0, Math.floor(sidebarScrollTop / SIDEBAR_ITEM_HEIGHT) - SIDEBAR_OVERSCAN);
    const end = Math.min(total, start + visible + SIDEBAR_OVERSCAN * 2);
    return {
      topPadding: start * SIDEBAR_ITEM_HEIGHT,
      bottomPadding: (total - end) * SIDEBAR_ITEM_HEIGHT,
      start,
      end,
    };
  }, [blocks.length, sidebarHeight, sidebarScrollTop, SIDEBAR_ITEM_HEIGHT, SIDEBAR_OVERSCAN]);

  const visibleBlocks = useMemo(() => {
    if (blocks.length <= 60) return blocks;
    return blocks.slice(virtualWindow.start, virtualWindow.end);
  }, [blocks, virtualWindow]);

  return (
    <div ref={shellRef} className="player-shell flex min-h-screen bg-[#f7f7f5]" style={getFontCSSVars(effectiveFontSettings)}>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex">
          <button type="button" onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-black/20" />
          <aside
            ref={sidebarViewportRef}
            onScroll={(event) => setSidebarScrollTop(event.currentTarget.scrollTop)}
            className="relative z-10 h-full w-[min(24rem,88vw)] overflow-y-auto border-r border-zinc-200 bg-white p-4 md:w-96 md:p-5"
          >
            <div className="mb-1 text-sm font-semibold text-zinc-900">Lesson Map</div>
            <div className="mb-4 text-xs text-zinc-500">{completedCount} of {blocks.length} completed</div>
            <div className="space-y-1.5">
              {virtualWindow.topPadding > 0 && <div style={{ height: `${virtualWindow.topPadding}px` }} />}
              {visibleBlocks.map((block, offset) => {
                const index = blocks.length <= 60 ? offset : virtualWindow.start + offset;
                return (
                <button key={block.id} type="button" onClick={() => { setCurrentIndex(index); setSidebarOpen(false); }} className={[
                  'w-full border px-3 py-2.5 text-left transition',
                  index === currentIndex ? 'border-zinc-900 bg-zinc-950 text-white' : isComplete(block) ? 'border-zinc-200 bg-zinc-50 text-zinc-500' : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
                ].join(' ')}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.18em] opacity-60">{block.taskType || block.type}</div>
                      <div className="mt-0.5 truncate text-sm font-medium">{getBlockLabel(block, index)}</div>
                    </div>
                    {isComplete(block) && <span className="shrink-0 text-base">✓</span>}
                  </div>
                </button>
              );
              })}
              {virtualWindow.bottomPadding > 0 && <div style={{ height: `${virtualWindow.bottomPadding}px` }} />}
            </div>
          </aside>
        </div>
      )}
      <div className="flex min-h-screen w-full flex-col">
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-4 md:px-5">
          <div className="player-frame mx-auto flex items-center gap-2 md:gap-3">
            <button type="button" onClick={() => setSidebarOpen(true)} className="player-nav-button border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50" title="Lesson map"><HamburgerIcon /></button>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-sm font-semibold text-zinc-900 md:text-base">{lesson.title}</span>
                <span className="shrink-0 text-xs text-zinc-400">{currentIndex + 1}/{blocks.length}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden bg-zinc-100">
                <div className="h-full bg-zinc-900 transition-all duration-500" style={{ width: progressWidth }} />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="relative">
                <button type="button" onClick={() => setShowFontPanel(v => !v)} className="border border-zinc-200 px-2.5 py-2 text-xs font-bold text-zinc-600 transition hover:bg-zinc-50" title="Font settings">Aa</button>
                {showFontPanel && <FontSettingsPanel settings={fontSettings} onChange={setFontSettings} onClose={() => setShowFontPanel(false)} />}
              </div>
              <button type="button" onClick={toggleFullscreen} className="hidden border border-zinc-200 px-2.5 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50 sm:block" title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>{isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}</button>
              <button type="button" onClick={handleExit} className="player-nav-button border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50">Exit</button>
            </div>
          </div>
        </header>

        {current && (
          <div className="border-b border-zinc-100 bg-white px-3 py-2 sm:px-4 md:px-5">
            <div className="player-frame mx-auto">
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-400">{current.taskType || current.type}</span>
              {current.type === 'task' && !results[current.id] && (
                <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full dot-round bg-amber-400" title="Not answered yet" />
              )}
            </div>
          </div>
        )}

        <main className="flex-1 px-3 py-4 sm:px-4 sm:py-5 md:px-5 md:py-7 lg:px-6 lg:py-8 xl:py-10" {...swipeHandlers}>
          <div key={currentIndex} className="player-frame mx-auto animate-soft-rise">
            <LessonStage blocks={blocks} currentIndex={currentIndex} results={results} onCompleteBlock={saveResult} emptyMessage="This lesson ended safely because the current block is missing." />
          </div>
        </main>

        <footer className="sticky bottom-0 z-20 border-t border-zinc-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-4 md:px-5 [padding-bottom:calc(env(safe-area-inset-bottom)+0.75rem)]">
          <div className="player-frame mx-auto flex items-center justify-between gap-3 md:gap-4">
            <button type="button" onClick={goPrev} disabled={currentIndex === 0} className="player-nav-button border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-30">← Back</button>
            <div className="hidden items-center gap-1.5 lg:flex">
              {blocks.map((block, index) => (
                <button key={block.id} type="button" onClick={() => setCurrentIndex(index)} title={getBlockLabel(block, index)} className={[
                  'h-2 transition-all',
                  index === currentIndex ? 'w-6 bg-zinc-900' : isComplete(block) ? 'w-2 bg-zinc-500' : 'w-2 bg-zinc-200 hover:bg-zinc-300',
                ].join(' ')} />
              ))}
            </div>
            <button type="button" onClick={goNext} className="player-nav-button border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800">{currentIndex === blocks.length - 1 ? 'Finish ✓' : 'Next →'}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
