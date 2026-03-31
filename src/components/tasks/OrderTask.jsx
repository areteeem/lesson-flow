import { useMemo, useState, useRef, useEffect } from 'react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';
import { useShuffleSeed } from '../../hooks/useShuffleSeed';

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
  const [preferTap, setPreferTap] = useState(false);
  const dragNode = useRef(null);
  const listRef = useRef(null);
  const touchDrag = useRef(null);

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setPreferTap(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  const move = (index, direction) => {
    if (submitted) return;
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
    setDragIndex(index);
    dragNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
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

  /* ─── Sentence Builder: horizontal chips ─── */
  if (taskType === 'sentence_builder') {
    return (
      <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
        <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
        {!submitted && <div className="mb-3 text-xs text-zinc-500">Drag the words into the correct order to build a sentence.</div>}
        <div ref={listRef} className="flex flex-wrap gap-2">
          {items.map((item, index) => {
            const isDragging = dragIndex === index;
            const showBefore = insertBeforeIndex === index && dragIndex !== null && !submitted;
            return (
              <div key={`${item}-${index}`} className="relative flex items-center" data-order-idx={index}>
                {showBefore && <div className="absolute -left-1.5 top-0 bottom-0 z-10 w-0.5 bg-zinc-900" />}
                <div
                  {...dragHandlers(index)}
                  className={[
                    'cursor-grab select-none border px-4 py-2 text-sm font-medium transition-all',
                    isDragging ? 'opacity-40' : '',
                    isCorrect(index) ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : '',
                    isWrong(index) ? 'border-red-300 bg-red-50 text-red-800' : '',
                    !submitted ? 'border-zinc-300 bg-zinc-50 text-zinc-800 hover:border-zinc-500 hover:bg-white active:scale-95' : '',
                  ].join(' ')}
                >
                  <Md text={item} />
                </div>
              </div>
            );
          })}
        </div>
        {submitted && showCheckButton && (
          <div className="mt-3 text-sm text-zinc-600">
            Correct order: <span className="font-medium">{expected.join(' ')}</span>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={submit} disabled={submitted} className="border border-zinc-900 bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">{showCheckButton ? 'Check' : 'Save answer'}</button>
        </div>
      </div>
    );
  }

  /* ─── Timeline Order: vertical timeline with markers ─── */
  if (taskType === 'timeline_order') {
    return (
      <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
        <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
        {!submitted && <div className="mb-3 text-xs text-zinc-500">Arrange events in chronological order along the timeline.</div>}
        <div ref={listRef} className="relative ml-6 border-l-2 border-zinc-300 pl-6">
          {items.map((item, index) => {
            const isDragging = dragIndex === index;
            const showBefore = insertBeforeIndex === index && dragIndex !== null && !submitted;
            return (
              <div key={`${item}-${index}`} className="relative mb-4 last:mb-0" data-order-idx={index}>
                {showBefore && <div className="absolute -top-2 left-0 right-0 z-10 h-0.5 bg-zinc-900" />}
                {/* Timeline dot */}
                <div className={[
                  'absolute -left-[calc(1.5rem+5px)] top-3 h-3 w-3 rounded-full border-2',
                  isCorrect(index) ? 'border-emerald-500 bg-emerald-500' : isWrong(index) ? 'border-red-400 bg-red-400' : 'border-zinc-400 bg-white',
                ].join(' ')} />
                <div
                  {...dragHandlers(index)}
                  className={[
                    'cursor-grab select-none border p-4 transition-all',
                    isDragging ? 'opacity-40' : '',
                    isCorrect(index) ? 'border-emerald-400 bg-emerald-50' : '',
                    isWrong(index) ? 'border-red-300 bg-red-50' : '',
                    !submitted ? 'border-zinc-200 bg-white hover:border-zinc-400' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-zinc-200 text-[10px] font-semibold text-zinc-500">{index + 1}</span>
                    <div className="min-w-0 flex-1 text-sm text-zinc-800"><Md text={item} /></div>
                    {!submitted && (
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="h-9 w-9 border border-zinc-200 text-sm text-zinc-400 hover:text-zinc-700 disabled:opacity-30">↑</button>
                        <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} className="h-9 w-9 border border-zinc-200 text-sm text-zinc-400 hover:text-zinc-700 disabled:opacity-30">↓</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={submit} disabled={submitted} className="border border-zinc-900 bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">{showCheckButton ? 'Check' : 'Save answer'}</button>
        </div>
      </div>
    );
  }

  /* ─── Story Reconstruction: paragraph cards ─── */
  if (taskType === 'story_reconstruction') {
    return (
      <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
        <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
        {!submitted && <div className="mb-3 text-xs text-zinc-500">Rearrange the paragraphs to rebuild the story.</div>}
        <div ref={listRef} className="space-y-3">
          {items.map((item, index) => {
            const isDragging = dragIndex === index;
            const showBefore = insertBeforeIndex === index && dragIndex !== null && !submitted;
            return (
              <div key={`${item}-${index}`} className="relative" data-order-idx={index}>
                {showBefore && <div className="absolute -top-2 left-0 right-0 z-10 flex items-center"><div className="h-0.5 w-full bg-zinc-900" /><div className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-zinc-900" /></div>}
                <div
                  {...dragHandlers(index)}
                  className={[
                    'cursor-grab select-none border-l-4 border p-5 transition-all',
                    isDragging ? 'opacity-40' : '',
                    isCorrect(index) ? 'border-l-emerald-500 border-emerald-200 bg-emerald-50' : '',
                    isWrong(index) ? 'border-l-red-400 border-red-200 bg-red-50' : '',
                    !submitted ? 'border-l-zinc-400 border-zinc-200 bg-white hover:border-l-zinc-600 hover:shadow-sm' : '',
                  ].join(' ')}
                >
                  <div className="flex gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center bg-zinc-100 text-xs font-bold text-zinc-600">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm leading-relaxed text-zinc-800"><Md text={item} /></div>
                    </div>
                    {!submitted && (
                      <div className="flex shrink-0 flex-col gap-1">
                        <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="h-9 w-9 border border-zinc-200 text-sm text-zinc-400 hover:text-zinc-700 disabled:opacity-30">↑</button>
                        <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} className="h-9 w-9 border border-zinc-200 text-sm text-zinc-400 hover:text-zinc-700 disabled:opacity-30">↓</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={submit} disabled={submitted} className="border border-zinc-900 bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">{showCheckButton ? 'Check' : 'Save answer'}</button>
        </div>
      </div>
    );
  }

  /* ─── Default: vertical list (order, justify_order, etc.) ─── */
  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {items.length === 0 && (
        <div className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">This task has no items to order.</div>
      )}
      {!submitted && items.length > 0 && (
        <div className="mb-3 text-xs text-zinc-500">
          {preferTap ? 'Hold and drag, or use the arrows to reorder.' : 'Drag items to reorder, or use the arrows.'}
        </div>
      )}
      <div ref={listRef} className="space-y-2">
        {items.map((item, index) => {
          const isDragging = dragIndex === index;
          const showLineBefore = insertBeforeIndex === index && dragIndex !== null && !submitted;
          return (
            <div key={`${item}-${index}`} className="relative" data-order-idx={index}>
              {showLineBefore && <div className="absolute -top-1.5 left-0 right-0 z-10 flex items-center"><div className="h-0.5 w-full bg-zinc-900" /><div className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-zinc-900" /></div>}
              <div
                {...dragHandlers(index)}
                className={[
                  'flex items-center gap-3 border px-4 py-3 transition',
                  isDragging ? 'opacity-40 border-zinc-300' : '',
                  isCorrect(index) ? 'border-emerald-400 bg-emerald-50' : '',
                  isWrong(index) ? 'border-red-400 bg-red-50' : '',
                  !submitted && !isDragging ? 'border-zinc-200 bg-white cursor-grab active:cursor-grabbing' : '',
                ].join(' ')}
              >
                <div className={[
                  'flex h-8 w-8 shrink-0 items-center justify-center border text-xs font-medium',
                  isCorrect(index) ? 'border-emerald-300 text-emerald-700 bg-emerald-100' : '',
                  isWrong(index) ? 'border-red-300 text-red-700 bg-red-100' : '',
                  !submitted ? 'border-zinc-200 text-zinc-500' : '',
                ].join(' ')}>{index + 1}</div>
                <div className="min-w-0 flex-1 text-sm text-zinc-800"><Md text={item} /></div>
                {!submitted && (
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="border border-zinc-200 px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-30">&#9650;</button>
                    <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} className="border border-zinc-200 px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-30">&#9660;</button>
                  </div>
                )}
                {submitted && showCheckButton && (
                  <div className="shrink-0">
                    {isCorrect(index) && <span className="text-sm text-emerald-600">&#10003;</span>}
                    {isWrong(index) && <span className="text-xs text-red-600">Expected: <strong>{expected[index]}</strong></span>}
                  </div>
                )}
              </div>
              {index === items.length - 1 && insertBeforeIndex === items.length && dragIndex !== null && !submitted && (
                <div className="relative mt-0.5"><div className="flex items-center"><div className="h-0.5 w-full bg-zinc-900" /><div className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-zinc-900" /></div></div>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={submit} disabled={submitted} className="mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">{showCheckButton ? 'Check' : 'Save answer'}</button>
      {submitted && block.explanation && (
        <div className="mt-4 bg-blue-50 p-4 text-sm text-blue-900"><Md text={block.explanation} /></div>
      )}
    </div>
  );
}

