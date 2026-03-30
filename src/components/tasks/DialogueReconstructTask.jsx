import { useMemo, useState, useRef, useEffect } from 'react';
import { Md } from '../FormattedText';
import { SPEAKER_COLORS } from '../../config/constants';
import { useShuffleSeed } from '../../hooks/useShuffleSeed';

function parseLines(text) {
  if (!text) return [];
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line, i) => {
    const m = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.+)$/);
    return m ? { speaker: m[1], content: m[2], index: i } : { speaker: '', content: line, index: i };
  });
}

function getSpeakerIdx(speaker, map) {
  if (!speaker) return 0;
  if (map.has(speaker)) return map.get(speaker);
  const idx = map.size;
  map.set(speaker, idx);
  return idx;
}

function stableShuffleLocal(arr, seed) {
  const copy = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  for (let i = copy.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const j = h % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function DialogueReconstructTask({ block, onComplete, onProgress }) {
  const correctOrder = useMemo(() => parseLines(block.text), [block.text]);
  const speakerMap = useMemo(() => {
    const map = new Map();
    correctOrder.forEach((l) => { if (l.speaker) getSpeakerIdx(l.speaker, map); });
    return map;
  }, [correctOrder]);

  const fixedIndices = useMemo(() => {
    const fixed = new Set();
    const fixedItems = block.fixed || block.targets || [];
    fixedItems.forEach((f) => {
      const idx = Number(f);
      if (!isNaN(idx) && idx >= 0 && idx < correctOrder.length) fixed.add(idx);
    });
    if (correctOrder.length > 0) fixed.add(0);
    return fixed;
  }, [block.fixed, block.targets, correctOrder]);

  const seed = useShuffleSeed();
  const [items, setItems] = useState(() => {
    const movable = correctOrder.filter((_, i) => !fixedIndices.has(i));
    const shuffled = stableShuffleLocal(movable, seed);
    const result = [];
    let mi = 0;
    for (let i = 0; i < correctOrder.length; i++) {
      if (fixedIndices.has(i)) result.push({ ...correctOrder[i], fixed: true, originalIndex: i });
      else result.push({ ...shuffled[mi++], fixed: false, originalIndex: correctOrder.indexOf(shuffled[mi - 1]) });
    }
    return result;
  });
  const [submitted, setSubmitted] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);
  const [insertBefore, setInsertBefore] = useState(null);
  const [preferTap, setPreferTap] = useState(false);
  const listRef = useRef(null);
  const touchDrag = useRef(null);

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setPreferTap(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  const moveItem = (from, to) => {
    if (submitted || items[from].fixed) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      const adj = to > from ? to - 1 : to;
      next.splice(adj, 0, moved);
      onProgress?.({ submitted: false, response: next.map((line) => `${line.speaker}: ${line.content}`) });
      return next;
    });
  };

  const handleDragStart = (e, idx) => {
    if (submitted || items[idx].fixed) return;
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const pos = e.clientY < mid ? idx : idx + 1;
    if (pos === dragIdx || pos === dragIdx + 1) { setInsertBefore(null); return; }
    setInsertBefore(pos);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (dragIdx !== null && insertBefore !== null) moveItem(dragIdx, insertBefore);
    setDragIdx(null);
    setInsertBefore(null);
  };

  const handleTouchStart = (e, idx) => {
    if (submitted || items[idx].fixed) return;
    touchDrag.current = { index: idx, startY: e.touches[0].clientY, moved: false };
  };

  const handleTouchMove = (e) => {
    if (!touchDrag.current || submitted) return;
    const dy = Math.abs(e.touches[0].clientY - touchDrag.current.startY);
    if (dy > 8) { touchDrag.current.moved = true; e.preventDefault(); }
    if (!touchDrag.current.moved) return;
    setDragIdx(touchDrag.current.index);
    const el = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
    if (!el || !listRef.current) return;
    const itemEl = el.closest('[data-dlg-idx]');
    if (!itemEl) return;
    const overIdx = Number(itemEl.dataset.dlgIdx);
    const rect = itemEl.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    const pos = e.touches[0].clientY < mid ? overIdx : overIdx + 1;
    setInsertBefore(pos === touchDrag.current.index || pos === touchDrag.current.index + 1 ? null : pos);
  };

  const handleTouchEnd = () => {
    if (touchDrag.current?.moved && dragIdx !== null && insertBefore !== null) moveItem(dragIdx, insertBefore);
    touchDrag.current = null;
    setDragIdx(null);
    setInsertBefore(null);
  };

  const moveArrow = (idx, dir) => {
    if (submitted || items[idx].fixed) return;
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    if (items[target].fixed) return;
    setItems((prev) => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      onProgress?.({ submitted: false, response: next.map((line) => `${line.speaker}: ${line.content}`) });
      return next;
    });
  };

  const submit = () => {
    const correctCount = items.filter((item, i) => {
      const expectedLine = correctOrder[i];
      return item.speaker === expectedLine.speaker && item.content === expectedLine.content;
    }).length;
    const score = correctCount / Math.max(correctOrder.length, 1);
    setSubmitted(true);
    onComplete?.({ submitted: true, correct: score === 1, score, response: items.map((i) => `${i.speaker}: ${i.content}`), correctAnswer: correctOrder.map((i) => `${i.speaker}: ${i.content}`) });
  };

  return (
    <div className="border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-4">
        <div className="text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction || 'Reconstruct the dialogue'} /></div>
        {block.hint && !submitted && <div className="mt-1 text-sm text-zinc-500">{block.hint}</div>}
        {!submitted && <div className="mt-2 text-xs text-zinc-500">{preferTap ? 'Use the ▲▼ arrows or drag messages to reorder. Pinned messages cannot be moved.' : 'Drag messages into the correct order. Pinned messages cannot be moved.'}</div>}
      </div>

      <div ref={listRef} className="space-y-2 px-4 py-5 sm:px-6">
        {items.map((line, idx) => {
          const sIdx = getSpeakerIdx(line.speaker, speakerMap);
          const colors = SPEAKER_COLORS[sIdx % SPEAKER_COLORS.length];
          const isLeft = sIdx % 2 === 0;
          const isDragging = dragIdx === idx;
          const showLine = insertBefore === idx && dragIdx !== null;
          const isCorrect = submitted && correctOrder[idx]?.speaker === line.speaker && correctOrder[idx]?.content === line.content;
          const isWrong = submitted && !isCorrect;

          return (
            <div key={`${line.speaker}-${line.content}-${idx}`} className="relative" data-dlg-idx={idx}>
              {showLine && <div className="absolute -top-1.5 left-0 right-0 z-10 flex items-center"><div className="h-0.5 w-full bg-zinc-900" /></div>}
              <div
                draggable={!submitted && !line.fixed}
                onDragStart={(e) => handleDragStart(e, idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={handleDrop}
                onDragEnd={() => { setDragIdx(null); setInsertBefore(null); }}
                onTouchStart={(e) => handleTouchStart(e, idx)}
                onTouchMove={(e) => handleTouchMove(e, idx)}
                onTouchEnd={handleTouchEnd}
                className={[
                  'flex items-center gap-2.5 transition',
                  isLeft ? '' : 'flex-row-reverse',
                  isDragging ? 'opacity-40' : '',
                  line.fixed ? 'cursor-default' : !submitted ? 'cursor-grab active:cursor-grabbing' : '',
                ].join(' ')}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center text-xs font-bold text-white ${colors.avatar}`}>
                  {line.speaker ? line.speaker[0].toUpperCase() : '?'}
                </div>
                <div className={[
                  'max-w-[70%] border px-4 py-2.5 text-sm',
                  colors.bg, colors.border, colors.text,
                  isLeft ? 'bubble-left' : 'bubble-right',
                  line.fixed ? 'ring-1 ring-zinc-300' : '',
                  isCorrect ? 'ring-2 ring-emerald-400' : '',
                  isWrong ? 'ring-2 ring-red-400' : '',
                ].join(' ')}>
                  {line.speaker && <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider opacity-60">{line.speaker}</div>}
                  <span>{line.content}</span>
                  {line.fixed && <span className="ml-2 text-[10px] text-zinc-400">📌</span>}
                </div>
                {!submitted && !line.fixed && (
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button type="button" onClick={() => moveArrow(idx, -1)} disabled={idx === 0} className="border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 disabled:opacity-30">▲</button>
                    <button type="button" onClick={() => moveArrow(idx, 1)} disabled={idx === items.length - 1} className="border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 disabled:opacity-30">▼</button>
                  </div>
                )}
              </div>
              {idx === items.length - 1 && insertBefore === items.length && dragIdx !== null && (
                <div className="mt-1"><div className="h-0.5 w-full bg-zinc-900" /></div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 sm:px-6">
        <div className="text-xs text-zinc-500">{submitted ? `${items.filter((item, i) => correctOrder[i]?.content === item.content).length}/${correctOrder.length} correct` : `${items.length} messages`}</div>
        {!submitted && (
          <button type="button" onClick={submit} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">Check Order</button>
        )}
      </div>

      {submitted && block.explanation && (
        <div className="border-t border-zinc-200 bg-blue-50 px-6 py-3 text-sm text-blue-900"><Md text={block.explanation} /></div>
      )}
    </div>
  );
}



