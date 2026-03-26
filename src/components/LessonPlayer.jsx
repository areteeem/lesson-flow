import { useEffect, useMemo, useRef, useState } from 'react';
import { findLinkedBlock, getBlockLabel, getVisibleBlocks } from '../utils/lesson';
import GradingScreen from './GradingScreen';
import GroupBlock from './GroupBlock';
import GenericSlide from './GenericSlide';
import RichSlide from './RichSlide';
import Slide from './Slide';
import SplitView from './SplitView';
import StructureSlide from './StructureSlide';
import TableSlide from './TableSlide';
import TaskRenderer from './TaskRenderer';
import { HamburgerIcon, FullscreenIcon, ExitFullscreenIcon } from './Icons';
import FontSettingsPanel, { loadFontSettings, getFontCSSVars } from './FontSettingsPanel';

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

function normalizeBlocks(blocks = []) {
  return getVisibleBlocks(blocks)
    .map((block) => (block.type === 'group' || block.type === 'split_group') ? { ...block, children: normalizeBlocks(block.children || []) } : block)
    .filter((block) => (block.type !== 'group' && block.type !== 'split_group') || block.children.length > 0);
}

export default function LessonPlayer({ lesson, onExit }) {
  const blocks = useMemo(() => normalizeBlocks(lesson?.blocks || []), [lesson]);
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

  const current = blocks[currentIndex] || null;
  const linkedBlock = current ? findLinkedBlock(blocks, current) : null;

  const isComplete = (block) => {
    if (!block) return false;
    if (block.type === 'group') {
      return block.children.every((child) => Boolean(results[child.id]));
    }
    if (block.type !== 'task') return true;
    return Boolean(results[block.id]);
  };

  const canAdvance = blocks.length > 0;

  const goNext = () => { if (currentIndex === blocks.length - 1) setShowGrading(true); else setCurrentIndex((v) => Math.min(blocks.length - 1, v + 1)); };
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
    setResults((currentResults) => ({ ...currentResults, [blockId]: result }));
  };

  const renderStandalone = (block) => {
    if (!block) return null;
    if (block.type === 'slide') return <Slide block={block} />;
    if (block.type === 'rich') return <RichSlide block={block} />;
    if (block.type === 'structure') return <StructureSlide block={block} />;
    if (block.type === 'table') return <TableSlide block={block} />;
    if (!['slide', 'rich', 'structure', 'table', 'group', 'split_group', 'task'].includes(block.type)) return <GenericSlide block={block} />;
    if (block.type === 'group' || block.type === 'split_group') return <GroupBlock block={block} results={results} onCompleteChild={saveResult} />;
    if (block.type === 'task') return <TaskRenderer block={block} onComplete={(result) => saveResult(block.id, result)} existingResult={results[block.id]} />;
    return null;
  };

  if (!current) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] text-sm text-zinc-500">This lesson has no visible blocks.</div>;
  }

  if (showGrading) {
    return <GradingScreen lesson={lesson} blocks={blocks} results={results} studentName={studentName} onStudentNameChange={setStudentName} onRestart={() => { setResults({}); setCurrentIndex(0); setShowGrading(false); }} onExit={handleExit} />;
  }

  const shouldSplitView = linkedBlock && current.type !== 'group' && current.type !== 'split_group' && (
    (current.type === 'task' && linkedBlock.type !== 'task') ||
    (current.type !== 'task' && linkedBlock.type === 'task')
  );

  const content = shouldSplitView ? (
    current.type === 'task'
      ? <SplitView left={renderStandalone(linkedBlock)} right={renderStandalone(current)} />
      : <SplitView left={renderStandalone(current)} right={renderStandalone(linkedBlock)} />
  ) : (
    renderStandalone(current)
  );

  const completedCount = blocks.filter(isComplete).length;

  return (
    <div ref={shellRef} className="player-shell flex min-h-screen bg-[#f7f7f5]" style={getFontCSSVars(fontSettings)}>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex">
          <button type="button" onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-black/20" />
          <aside className="relative z-10 h-full w-[min(24rem,88vw)] overflow-y-auto border-r border-zinc-200 bg-white p-4 md:w-96 md:p-5">
            <div className="mb-1 text-sm font-semibold text-zinc-900">Lesson Map</div>
            <div className="mb-4 text-xs text-zinc-500">{completedCount} of {blocks.length} completed</div>
            <div className="space-y-1.5">
              {blocks.map((block, index) => (
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
              ))}
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
                <div className="h-full bg-zinc-900 transition-all duration-500" style={{ width: `${(completedCount / blocks.length) * 100}%` }} />
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
          <div key={currentIndex} className="player-frame mx-auto animate-soft-rise">{content}</div>
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
