import { useMemo, useState } from 'react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';

export default function DragMatchTask({ block, onComplete, existingResult }) {
  const pairs = block.pairs || [];
  const [shuffleSeed] = useState(() => crypto.randomUUID());

  // Left items (draggable)
  const leftItems = useMemo(() => {
    const items = pairs.map((p, i) => ({ id: i, text: p.left }));
    return block.shuffle === false ? items : stableShuffle(items, `${block.id}-${shuffleSeed}-left`);
  }, [block.id, block.shuffle, pairs, shuffleSeed]);

  // Right targets (drop zones), shuffled independently
  const rightTargets = useMemo(() => {
    const targets = pairs.map((p, i) => ({ id: i, text: p.right, expectedLeft: p.left }));
    return block.shuffle === false ? targets : stableShuffle(targets, `${block.id}-${shuffleSeed}-right`);
  }, [block.id, block.shuffle, pairs, shuffleSeed]);

  // Track which left item is placed on which right target
  const [placements, setPlacements] = useState({});
  const [draggedId, setDraggedId] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const placedLeftIds = new Set(Object.values(placements));

  const handleDrop = (targetId, leftItemId) => {
    if (submitted) return;
    // If this target already has an item, release it
    setPlacements((prev) => {
      const next = { ...prev };
      // Remove leftItemId from any other target
      for (const [tId, lId] of Object.entries(next)) {
        if (lId === leftItemId) delete next[tId];
      }
      next[targetId] = leftItemId;
      return next;
    });
    setDraggedId(null);
  };

  const releaseFromTarget = (targetId) => {
    if (submitted) return;
    setPlacements((prev) => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
  };

  const submit = () => {
    setSubmitted(true);
    const correctCount = rightTargets.filter((target) => {
      const placedLeftId = placements[target.id];
      if (placedLeftId === undefined) return false;
      const leftItem = leftItems.find((l) => l.id === placedLeftId);
      return leftItem && leftItem.text === target.expectedLeft;
    }).length;
    const score = correctCount / Math.max(pairs.length, 1);
    onComplete?.({
      submitted: true,
      correct: score === 1,
      score,
      response: placements,
      correctAnswer: pairs,
    });
  };

  return (
    <div className="border border-zinc-200 bg-white p-8">
      <div className="mb-4 text-xl font-semibold text-zinc-950">
        <Md text={block.question || block.instruction || 'Drag each item to its match'} />
      </div>
      {block.hint && !submitted && <div className="mb-3 text-xs text-zinc-500">{block.hint}</div>}
      {pairs.length === 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">This task has no pairs to match.</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Left: draggable items */}
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Items</div>
          <div className="flex flex-wrap gap-2">
            {leftItems.map((item) => {
              const isPlaced = placedLeftIds.has(item.id);
              const isDragging = draggedId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  draggable={!submitted && !isPlaced}
                  onDragStart={(e) => {
                    setDraggedId(item.id);
                    e.dataTransfer.setData('text/plain', String(item.id));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDraggedId(null)}
                  onClick={() => {
                    if (submitted || isPlaced) return;
                    setDraggedId((prev) => (prev === item.id ? null : item.id));
                  }}
                  className={[
                    'min-h-11 rounded-2xl border px-4 py-2 text-sm font-medium transition',
                    isPlaced ? 'border-zinc-100 bg-zinc-50 text-zinc-300 cursor-default' : '',
                    isDragging ? 'border-zinc-900 bg-zinc-900 text-white' : '',
                    !submitted && !isPlaced && !isDragging ? 'border-zinc-200 bg-white text-zinc-800 hover:-translate-y-0.5 hover:border-zinc-900 cursor-grab active:cursor-grabbing' : '',
                    submitted ? 'cursor-default' : '',
                  ].join(' ')}
                >
                  {item.text}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: drop targets */}
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Definitions</div>
          <div className="space-y-2">
            {rightTargets.map((target) => {
              const placedLeftId = placements[target.id];
              const placedItem = placedLeftId !== undefined ? leftItems.find((l) => l.id === placedLeftId) : null;
              const isCorrect = submitted && placedItem && placedItem.text === target.expectedLeft;
              const isWrong = submitted && placedItem && placedItem.text !== target.expectedLeft;
              const isEmpty = !placedItem;
              const isDropTarget = draggedId !== null && isEmpty;
              return (
                <div
                  key={target.id}
                  onDrop={(e) => {
                    e.preventDefault();
                    const leftId = Number(e.dataTransfer.getData('text/plain'));
                    if (!isNaN(leftId)) handleDrop(target.id, leftId);
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onClick={() => {
                    if (submitted) return;
                    if (draggedId !== null && isEmpty) {
                      handleDrop(target.id, draggedId);
                    } else if (placedItem && !submitted) {
                      releaseFromTarget(target.id);
                    }
                  }}
                  className={[
                    'flex items-center gap-3 rounded-2xl border px-4 py-3 transition',
                    isCorrect ? 'border-emerald-400 bg-emerald-50' : '',
                    isWrong ? 'border-red-400 bg-red-50' : '',
                    !submitted && placedItem ? 'border-zinc-900 bg-zinc-50' : '',
                    !submitted && isEmpty && isDropTarget ? 'border-dashed border-zinc-900 bg-zinc-50' : '',
                    !submitted && isEmpty && !isDropTarget ? 'border-dashed border-zinc-300 bg-zinc-50' : '',
                  ].join(' ')}
                >
                  <div className="min-w-0 flex-1 text-sm text-zinc-600">{target.text}</div>
                  <div className="shrink-0">
                    {placedItem ? (
                      <span className={[
                        'inline-flex rounded-xl border px-3 py-1 text-sm font-medium',
                        isCorrect ? 'border-emerald-300 text-emerald-800' : '',
                        isWrong ? 'border-red-300 text-red-800' : '',
                        !submitted ? 'border-zinc-300 text-zinc-900' : '',
                      ].join(' ')}>
                        {placedItem.text}
                        {!submitted && <button type="button" onClick={(e) => { e.stopPropagation(); releaseFromTarget(target.id); }} className="ml-2 text-zinc-400 hover:text-zinc-900">&times;</button>}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">{isDropTarget ? 'Drop here' : 'Empty'}</span>
                    )}
                  </div>
                  {isWrong && (
                    <div className="text-xs text-red-600">Expected: <strong>{target.expectedLeft}</strong></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {!submitted && (
        <button type="button" onClick={submit} disabled={Object.keys(placements).length < pairs.length} className="mt-5 rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">
          Check
        </button>
      )}
      {submitted && block.explanation && (
        <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900"><Md text={block.explanation} /></div>
      )}
    </div>
  );
}
