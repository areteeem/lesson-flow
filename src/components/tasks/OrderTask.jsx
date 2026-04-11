import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';
import { useShuffleSeed } from '../../hooks/useShuffleSeed';
import { useSmoothDrag } from '../../hooks/useSmoothDrag';
import { InsertionIndicator, VerdictIcon, DragHint } from '../dnd/DndAnimations';

function toList(value, taskType = 'order') {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined).map((item) => String(item));
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    const splitByLine = trimmed.includes('\n');
    const splitByPipe = trimmed.includes('|');
    if (splitByLine || splitByPipe) {
      return trimmed
        .split(splitByLine ? /\r?\n/ : /\|/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    if (taskType === 'sentence_builder') {
      return trimmed.split(/\s+/).filter(Boolean);
    }
    return [trimmed];
  }
  return [];
}

export default function OrderTask({ block, onComplete, existingResult, showCheckButton = true }) {
  const taskType = block.taskType || 'order';
  const shuffleSeed = useShuffleSeed();
  const sourceItems = useMemo(() => toList(block.items, taskType), [block.items, taskType]);
  const initial = useMemo(() => (block.shuffle === false ? [...sourceItems] : stableShuffle(sourceItems, `${block.id || block.question}-${shuffleSeed}-order`)), [block.id, block.question, block.shuffle, sourceItems, shuffleSeed]);
  const [items, setItems] = useState(() => {
    const existing = toList(existingResult?.response, taskType);
    return existing.length > 0 ? existing : initial;
  });
  const [submitted, setSubmitted] = useState(() => Boolean(existingResult?.submitted));
  const [dragIndex, setDragIndex] = useState(null);
  const [insertBeforeIndex, setInsertBeforeIndex] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const listRef = useRef(null);
  const touchDrag = useRef(null);
  const hasInteracted = useRef(false);

  const { preferTap, reducedMotion, setupMediaListeners, springConfig, gentleSpring } = useSmoothDrag({ disabled: submitted });

  useEffect(() => setupMediaListeners(), [setupMediaListeners]);

  // Show drag hint for first-time users
  useEffect(() => {
    if (!submitted && !hasInteracted.current && items.length > 1) {
      const timer = setTimeout(() => {
        if (!hasInteracted.current) setShowHint(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [submitted, items.length]);

  const dismissHint = useCallback(() => {
    setShowHint(false);
    hasInteracted.current = true;
  }, []);

  const move = (index, direction) => {
    if (submitted) return;
    hasInteracted.current = true;
    setShowHint(false);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const handleDragStart = (e, index) => {
    if (submitted) return;
    hasInteracted.current = true;
    setShowHint(false);
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    try { const c = document.createElement('canvas'); c.width = 1; c.height = 1; e.dataTransfer.setDragImage(c, 0, 0); } catch { /* ok */ }
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndex === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const isHorizontal = taskType === 'sentence_builder';
    const mid = isHorizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    const pos = isHorizontal ? e.clientX : e.clientY;
    const insertAt = pos < mid ? index : index + 1;
    if (insertAt === dragIndex || insertAt === dragIndex + 1) { setInsertBeforeIndex(null); return; }
    setInsertBeforeIndex(insertAt);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (dragIndex === null || insertBeforeIndex === null) { setDragIndex(null); setInsertBeforeIndex(null); return; }
    setItems((current) => {
      const next = [...current];
      const [moved] = next.splice(dragIndex, 1);
      const adjustedIndex = insertBeforeIndex > dragIndex ? insertBeforeIndex - 1 : insertBeforeIndex;
      next.splice(adjustedIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
    setInsertBeforeIndex(null);
  };

  const handleDragEnd = () => { setDragIndex(null); setInsertBeforeIndex(null); };

  const handleTouchStart = (e, index) => {
    if (submitted) return;
    const touch = e.touches[0];
    touchDrag.current = { index, startY: touch.clientY, startX: touch.clientX, moved: false };
  };

  const handleTouchMove = (e) => {
    if (!touchDrag.current || submitted) return;
    const touch = e.touches[0];
    const dy = Math.abs(touch.clientY - touchDrag.current.startY);
    const dx = Math.abs(touch.clientX - touchDrag.current.startX);
    if (dy > 8 || dx > 8) {
      touchDrag.current.moved = true;
      hasInteracted.current = true;
      setShowHint(false);
      e.preventDefault();
    }
    if (!touchDrag.current.moved) return;
    setDragIndex(touchDrag.current.index);
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!el || !listRef.current) return;
    const itemEl = el.closest('[data-order-idx]');
    if (!itemEl) return;
    const overIdx = Number(itemEl.dataset.orderIdx);
    const rect = itemEl.getBoundingClientRect();
    const isHorizontal = taskType === 'sentence_builder';
    const mid = isHorizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    const pos = isHorizontal ? touch.clientX : touch.clientY;
    const insertAt = pos < mid ? overIdx : overIdx + 1;
    if (insertAt === touchDrag.current.index || insertAt === touchDrag.current.index + 1) {
      setInsertBeforeIndex(null);
    } else {
      setInsertBeforeIndex(insertAt);
    }
  };

  const handleTouchEnd = () => {
    if (!touchDrag.current) return;
    if (touchDrag.current.moved && dragIndex !== null && insertBeforeIndex !== null) {
      setItems((current) => {
        const next = [...current];
        const [moved] = next.splice(dragIndex, 1);
        const adj = insertBeforeIndex > dragIndex ? insertBeforeIndex - 1 : insertBeforeIndex;
        next.splice(adj, 0, moved);
        return next;
      });
    }
    touchDrag.current = null;
    setDragIndex(null);
    setInsertBeforeIndex(null);
  };

  const submit = () => {
    const expected = toList(block.correct, taskType).length > 0 ? toList(block.correct, taskType) : toList(block.items, taskType);
    const correctCount = items.filter((item, i) => item === expected[i]).length;
    const allCorrect = correctCount === expected.length && items.length === expected.length;
    const score = correctCount / Math.max(expected.length, 1);
    setSubmitted(true);
    onComplete?.({ submitted: true, correct: allCorrect, score, response: items, correctAnswer: expected });
  };

  const expected = useMemo(() => {
    const fromCorrect = toList(block.correct, taskType);
    if (fromCorrect.length > 0) return fromCorrect;
    return toList(block.items, taskType);
  }, [block.correct, block.items, taskType]);

  const dragHandlers = (index) => ({
    draggable: !submitted,
    onDragStart: (e) => handleDragStart(e, index),
    onDragOver: (e) => handleDragOver(e, index),
    onDrop: handleDrop,
    onDragEnd: handleDragEnd,
    onTouchStart: (e) => handleTouchStart(e, index),
    onTouchMove: (e) => handleTouchMove(e, index),
    onTouchEnd: handleTouchEnd,
  });

  const isCorrect = (index) => submitted && showCheckButton && items[index] === expected[index];
  const isWrong = (index) => submitted && showCheckButton && items[index] !== expected[index];

  const gripIcon = (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="shrink-0 opacity-40">
      <circle cx="3.5" cy="2" r="1.2"/><circle cx="8.5" cy="2" r="1.2"/>
      <circle cx="3.5" cy="6" r="1.2"/><circle cx="8.5" cy="6" r="1.2"/>
      <circle cx="3.5" cy="10" r="1.2"/><circle cx="8.5" cy="10" r="1.2"/>
    </svg>
  );

  /* ─── Sentence Builder: horizontal chips ─── */
  if (taskType === 'sentence_builder') {
    return (
      <div className="task-shell relative border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
        <DragHint show={showHint && !submitted} onDismiss={dismissHint} />
        <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
        {!submitted && <div className="task-helper-text mb-3 text-xs text-zinc-500">Drag the words into the correct order to build a sentence.</div>}
        <LayoutGroup>
          <div ref={listRef} className="flex flex-wrap gap-2">
            {items.map((item, index) => {
              const isDragging = dragIndex === index;
              const showBefore = insertBeforeIndex === index && dragIndex !== null && !submitted;
              return (
                <div key={`${item}-${index}`} className="relative flex items-center" data-order-idx={index}>
                  <AnimatePresence>{showBefore && <InsertionIndicator horizontal />}</AnimatePresence>
                  <motion.div
                    layout={!reducedMotion}
                    layoutId={reducedMotion ? undefined : `sentence-${index}`}
                    {...dragHandlers(index)}
                    animate={{
                      opacity: isDragging ? 0.4 : 1,
                      scale: isDragging ? 0.95 : 1,
                      y: isCorrect(index) ? [0, -3, 0] : isWrong(index) ? 0 : 0,
                      x: isWrong(index) ? [0, -4, 4, -2, 2, 0] : 0,
                    }}
                    transition={springConfig}
                    whileHover={!submitted ? { y: -2, scale: 1.03 } : undefined}
                    whileTap={!submitted ? { scale: 0.96 } : undefined}
                    className={[
                      'cursor-grab select-none border px-4 py-2 text-sm font-medium transition-colors',
                      isCorrect(index) ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : '',
                      isWrong(index) ? 'border-red-300 bg-red-50 text-red-800' : '',
                      !submitted ? 'border-zinc-300 bg-zinc-50 text-zinc-800 hover:border-zinc-500 hover:bg-white' : '',
                    ].join(' ')}
                  >
                    <Md text={item} />
                  </motion.div>
                </div>
              );
            })}
          </div>
        </LayoutGroup>
        {submitted && showCheckButton && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={gentleSpring} className="mt-3 text-sm text-zinc-600">
            Correct order: <span className="font-medium">{expected.join(' ')}</span>
          </motion.div>
        )}
        <div className="mt-4 flex justify-end">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button" onClick={submit} disabled={submitted} className="border border-zinc-900 bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">{showCheckButton ? 'Check' : 'Save answer'}</motion.button>
        </div>
      </div>
    );
  }

  /* ─── Timeline Order: vertical timeline with markers ─── */
  if (taskType === 'timeline_order') {
    return (
      <div className="task-shell relative border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
        <DragHint show={showHint && !submitted} onDismiss={dismissHint} />
        <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
        {!submitted && <div className="task-helper-text mb-3 text-xs text-zinc-500">Arrange events in chronological order along the timeline.</div>}
        <div ref={listRef} className="relative ml-6 border-l-2 border-zinc-300 pl-6">
          <AnimatePresence>
            {items.map((item, index) => {
              const isDragging = dragIndex === index;
              const showBefore = insertBeforeIndex === index && dragIndex !== null && !submitted;
              return (
                <motion.div
                  key={`${item}-${index}`}
                  layout={!reducedMotion}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={springConfig}
                  className="relative mb-4 last:mb-0"
                  data-order-idx={index}
                >
                  <AnimatePresence>{showBefore && <InsertionIndicator />}</AnimatePresence>
                  {/* Timeline dot */}
                  <motion.div
                    animate={{
                      scale: isCorrect(index) ? [1, 1.4, 1] : 1,
                      backgroundColor: isCorrect(index) ? '#10b981' : isWrong(index) ? '#f87171' : '#ffffff',
                      borderColor: isCorrect(index) ? '#10b981' : isWrong(index) ? '#f87171' : '#a1a1aa',
                    }}
                    transition={springConfig}
                    className="absolute -left-[calc(1.5rem+5px)] top-3 h-3 w-3 rounded-full border-2"
                  />
                  <motion.div
                    {...dragHandlers(index)}
                    animate={{
                      opacity: isDragging ? 0.4 : 1,
                      scale: isDragging ? 0.97 : 1,
                      y: isCorrect(index) ? [0, -2, 0] : 0,
                      x: isWrong(index) ? [0, -4, 4, -2, 2, 0] : 0,
                    }}
                    transition={springConfig}
                    whileHover={!submitted ? { scale: 1.01, boxShadow: '0 4px 12px rgba(0,0,0,0.06)' } : undefined}
                    className={[
                      'cursor-grab select-none border p-4 transition-colors',
                      isCorrect(index) ? 'border-emerald-400 bg-emerald-50' : '',
                      isWrong(index) ? 'border-red-300 bg-red-50' : '',
                      !submitted ? 'border-zinc-200 bg-white hover:border-zinc-400' : '',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-3">
                      {!submitted && <span className="text-zinc-400">{gripIcon}</span>}
                      <motion.span
                        animate={{
                          backgroundColor: isCorrect(index) ? '#d1fae5' : isWrong(index) ? '#fee2e2' : '#f4f4f5',
                          color: isCorrect(index) ? '#065f46' : isWrong(index) ? '#991b1b' : '#71717a',
                        }}
                        className="flex h-6 w-6 shrink-0 items-center justify-center border border-zinc-200 text-[10px] font-semibold"
                      >
                        {index + 1}
                      </motion.span>
                      <div className="min-w-0 flex-1 text-sm text-zinc-800"><Md text={item} /></div>
                      {!submitted && (
                        <div className="flex shrink-0 gap-1">
                          <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="h-9 w-9 border border-zinc-200 text-sm text-zinc-400 hover:text-zinc-700 disabled:opacity-30">↑</button>
                          <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} className="h-9 w-9 border border-zinc-200 text-sm text-zinc-400 hover:text-zinc-700 disabled:opacity-30">↓</button>
                        </div>
                      )}
                      <VerdictIcon isCorrect={isCorrect(index)} isWrong={isWrong(index)} />
                    </div>
                  </motion.div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        <div className="mt-4 flex justify-end">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button" onClick={submit} disabled={submitted} className="border border-zinc-900 bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">{showCheckButton ? 'Check' : 'Save answer'}</motion.button>
        </div>
      </div>
    );
  }

  /* ─── Story Reconstruction: paragraph cards ─── */
  if (taskType === 'story_reconstruction') {
    return (
      <div className="task-shell relative border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
        <DragHint show={showHint && !submitted} onDismiss={dismissHint} />
        <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
        {!submitted && <div className="task-helper-text mb-3 text-xs text-zinc-500">Rearrange the paragraphs to rebuild the story.</div>}
        <div ref={listRef} className="space-y-3">
          <AnimatePresence>
            {items.map((item, index) => {
              const isDragging = dragIndex === index;
              const showBefore = insertBeforeIndex === index && dragIndex !== null && !submitted;
              return (
                <motion.div
                  key={`${item}-${index}`}
                  layout={!reducedMotion}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={springConfig}
                  className="relative"
                  data-order-idx={index}
                >
                  <AnimatePresence>
                    {showBefore && (
                      <motion.div
                        initial={{ opacity: 0, scaleX: 0 }}
                        animate={{ opacity: 1, scaleX: 1 }}
                        exit={{ opacity: 0, scaleX: 0 }}
                        transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                        className="absolute -top-2 left-0 right-0 z-10 flex items-center"
                      >
                        <div className="h-0.5 w-full bg-zinc-900" />
                        <motion.div
                          animate={{ scale: [1, 1.3, 1] }}
                          transition={{ repeat: Infinity, duration: 1.2 }}
                          className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-zinc-900"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <motion.div
                    {...dragHandlers(index)}
                    animate={{
                      opacity: isDragging ? 0.4 : 1,
                      scale: isDragging ? 0.97 : 1,
                      y: isCorrect(index) ? [0, -2, 0] : 0,
                      x: isWrong(index) ? [0, -5, 5, -3, 3, 0] : 0,
                    }}
                    transition={springConfig}
                    whileHover={!submitted ? { scale: 1.005, boxShadow: '0 6px 16px rgba(0,0,0,0.06)' } : undefined}
                    whileTap={!submitted ? { scale: 0.99 } : undefined}
                    className={[
                      'cursor-grab select-none border-l-4 border p-5 transition-colors',
                      isCorrect(index) ? 'border-l-emerald-500 border-emerald-200 bg-emerald-50' : '',
                      isWrong(index) ? 'border-l-red-400 border-red-200 bg-red-50' : '',
                      !submitted ? 'border-l-zinc-400 border-zinc-200 bg-white hover:border-l-zinc-600 hover:shadow-sm' : '',
                    ].join(' ')}
                  >
                    <div className="flex gap-3">
                      {!submitted && <span className="mt-1 text-zinc-400">{gripIcon}</span>}
                      <motion.span
                        animate={{
                          backgroundColor: isCorrect(index) ? '#d1fae5' : isWrong(index) ? '#fee2e2' : '#f4f4f5',
                          color: isCorrect(index) ? '#065f46' : isWrong(index) ? '#991b1b' : '#52525b',
                        }}
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-xs font-bold"
                      >
                        {index + 1}
                      </motion.span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm leading-relaxed text-zinc-800"><Md text={item} /></div>
                      </div>
                      {!submitted && (
                        <div className="flex shrink-0 flex-col gap-1">
                          <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="h-9 w-9 border border-zinc-200 text-sm text-zinc-400 hover:text-zinc-700 disabled:opacity-30">↑</button>
                          <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} className="h-9 w-9 border border-zinc-200 text-sm text-zinc-400 hover:text-zinc-700 disabled:opacity-30">↓</button>
                        </div>
                      )}
                      <VerdictIcon isCorrect={isCorrect(index)} isWrong={isWrong(index)} className="text-sm" />
                    </div>
                  </motion.div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
        <div className="mt-4 flex justify-end">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button" onClick={submit} disabled={submitted} className="border border-zinc-900 bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">{showCheckButton ? 'Check' : 'Save answer'}</motion.button>
        </div>
      </div>
    );
  }

  /* ─── Default: vertical list (order, justify_order, etc.) ─── */
  return (
    <div className="task-shell relative border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <DragHint show={showHint && !submitted} onDismiss={dismissHint} />
      <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {items.length === 0 && (
        <div className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">This task has no items to order.</div>
      )}
      {!submitted && items.length > 0 && (
        <div className="task-helper-text mb-3 text-xs text-zinc-500">
          {preferTap ? 'Hold and drag, or use the arrows to reorder.' : 'Drag items to reorder, or use the arrows.'}
        </div>
      )}
      <div ref={listRef} className="space-y-2">
        <AnimatePresence>
          {items.map((item, index) => {
            const isDragging = dragIndex === index;
            const showLineBefore = insertBeforeIndex === index && dragIndex !== null && !submitted;
            return (
              <motion.div
                key={`${item}-${index}`}
                layout={!reducedMotion}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={springConfig}
                className="relative"
                data-order-idx={index}
              >
                <AnimatePresence>
                  {showLineBefore && (
                    <motion.div
                      initial={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      exit={{ opacity: 0, scaleX: 0 }}
                      transition={{ type: 'spring', stiffness: 600, damping: 30 }}
                      className="absolute -top-1.5 left-0 right-0 z-10 flex items-center"
                    >
                      <div className="h-0.5 w-full bg-zinc-900" />
                      <motion.div
                        animate={{ scale: [1, 1.3, 1] }}
                        transition={{ repeat: Infinity, duration: 1.2 }}
                        className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-zinc-900"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                <motion.div
                  {...dragHandlers(index)}
                  animate={{
                    opacity: isDragging ? 0.4 : 1,
                    scale: isDragging ? 0.97 : 1,
                    y: isCorrect(index) ? [0, -3, 0] : 0,
                    x: isWrong(index) ? [0, -5, 5, -3, 3, 0] : 0,
                    boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.1)' : '0 0 0 rgba(0,0,0,0)',
                  }}
                  transition={springConfig}
                  whileHover={!submitted ? { scale: 1.005, boxShadow: '0 4px 12px rgba(0,0,0,0.04)' } : undefined}
                  whileTap={!submitted ? { scale: 0.99 } : undefined}
                  className={[
                    'flex items-center gap-3 border px-4 py-3 transition-colors',
                    isDragging ? 'border-zinc-400' : '',
                    isCorrect(index) ? 'border-emerald-400 bg-emerald-50' : '',
                    isWrong(index) ? 'border-red-400 bg-red-50' : '',
                    !submitted && !isDragging ? 'border-zinc-200 bg-white cursor-grab active:cursor-grabbing' : '',
                  ].join(' ')}
                >
                  {!submitted && <span className="text-zinc-400">{gripIcon}</span>}
                  <motion.div
                    animate={{
                      backgroundColor: isCorrect(index) ? '#d1fae5' : isWrong(index) ? '#fee2e2' : '#f4f4f5',
                      borderColor: isCorrect(index) ? '#6ee7b7' : isWrong(index) ? '#fca5a5' : '#e4e4e7',
                      color: isCorrect(index) ? '#065f46' : isWrong(index) ? '#991b1b' : '#71717a',
                    }}
                    className="flex h-8 w-8 shrink-0 items-center justify-center border text-xs font-medium"
                  >
                    {index + 1}
                  </motion.div>
                  <div className="min-w-0 flex-1 text-sm text-zinc-800"><Md text={item} /></div>
                  {!submitted && (
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="border border-zinc-200 px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-30">&#9650;</button>
                      <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} className="border border-zinc-200 px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-30">&#9660;</button>
                    </div>
                  )}
                  {submitted && showCheckButton && (
                    <div className="shrink-0 flex items-center gap-2">
                      <VerdictIcon isCorrect={isCorrect(index)} isWrong={isWrong(index)} />
                      {isWrong(index) && <span className="text-xs text-red-600">Expected: <strong>{expected[index]}</strong></span>}
                    </div>
                  )}
                </motion.div>
                {index === items.length - 1 && insertBeforeIndex === items.length && dragIndex !== null && !submitted && (
                  <AnimatePresence>
                    <motion.div
                      initial={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      exit={{ opacity: 0 }}
                      className="relative mt-0.5"
                    >
                      <div className="flex items-center"><div className="h-0.5 w-full bg-zinc-900" /><div className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-zinc-900" /></div>
                    </motion.div>
                  </AnimatePresence>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button" onClick={submit} disabled={submitted} className="task-primary-button mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">{showCheckButton ? 'Check' : 'Save answer'}</motion.button>
      {submitted && block.explanation && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={gentleSpring} className="task-muted-panel mt-4 border p-4 text-sm text-blue-900"><Md text={block.explanation} /></motion.div>
      )}
    </div>
  );
}

