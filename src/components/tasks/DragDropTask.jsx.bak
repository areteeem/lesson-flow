import { useMemo, useState, useEffect } from 'react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';
import { useShuffleSeed } from '../../hooks/useShuffleSeed';

export default function DragDropTask({ block, onComplete, onProgress, showCheckButton = true }) {
  const pairs = block.pairs || [];
  const shuffleSeed = useShuffleSeed();

  // Right options as draggable items
  const draggableItems = useMemo(() => {
    const indexed = pairs.map((pair, i) => ({ id: i, text: pair.right }));
    return block.shuffle === false ? indexed : stableShuffle(indexed, `${block.id || block.question}-${shuffleSeed}-right-options`);
  }, [block.id, block.question, block.shuffle, pairs, shuffleSeed]);

  // Track placements: { leftValue: draggableItemId }
  const [placements, setPlacements] = useState({});
  const [draggedItem, setDraggedItem] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const showVerdict = submitted && showCheckButton;
  const [preferTap, setPreferTap] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setPreferTap(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  const placedItemIds = new Set(Object.values(placements));
  const bank = draggableItems.filter((item) => !placedItemIds.has(item.id));

  const placeOnTarget = (leftValue, item) => {
    if (submitted || !item) return;
    setPlacements((prev) => {
      const next = { ...prev };
      // Remove this item from any other target
      for (const [key, val] of Object.entries(next)) {
        if (val === item.id) delete next[key];
      }
      // If target already has an item, it goes back to bank
      next[leftValue] = item.id;
      onProgress?.({ submitted: false, response: next });
      return next;
    });
    setDraggedItem(null);
    setSelectedItem(null);
  };

  const releaseFromTarget = (leftValue) => {
    if (submitted) return;
    setPlacements((prev) => {
      const next = { ...prev };
      delete next[leftValue];
      onProgress?.({ submitted: false, response: next });
      return next;
    });
  };

  const handleBankPress = (item) => {
    if (submitted) return;
    setSelectedItem((prev) => (prev?.id === item.id ? null : item));
  };

  const handleTargetClick = (leftValue) => {
    if (submitted) return;
    if (selectedItem) {
      placeOnTarget(leftValue, selectedItem);
    } else if (placements[leftValue] !== undefined) {
      releaseFromTarget(leftValue);
    }
  };

  const submit = () => {
    const correctCount = pairs.filter((pair) => {
      const placedId = placements[pair.left];
      if (placedId === undefined) return false;
      const found = draggableItems.find((d) => d.id === placedId);
      return found && found.text === pair.right;
    }).length;
    const score = correctCount / Math.max(pairs.length, 1);
    setSubmitted(true);
    onComplete?.({ submitted: true, correct: score === 1, score, response: placements, correctAnswer: pairs });
  };

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.hint && !submitted && <div className="mb-3 text-xs text-zinc-500">{block.hint}</div>}
      {pairs.length === 0 && (
        <div className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">This task has no pairs to match.</div>
      )}
      {!submitted && (
        <div className="mb-3 text-xs text-zinc-500">
          {preferTap ? 'Tap an answer, then tap a target to place it.' : 'Drag answers to their matching targets, or tap to select and place.'}
        </div>
      )}

      {/* Answer bank */}
      {bank.length > 0 && !submitted && (
        <div className="mb-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Answer bank</div>
          <div className="flex flex-wrap gap-2 border border-zinc-200 bg-zinc-50 p-3">
            {bank.map((item) => (
              <button
                key={item.id}
                type="button"
                draggable
                onDragStart={(e) => {
                  setDraggedItem(item);
                  e.dataTransfer.setData('application/json', JSON.stringify(item));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => setDraggedItem(null)}
                onClick={() => handleBankPress(item)}
                className={[
                  'min-h-10 border px-3 py-2 text-sm font-medium transition',
                  selectedItem?.id === item.id || draggedItem?.id === item.id
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:-translate-y-0.5 hover:border-zinc-900 cursor-grab active:cursor-grabbing',
                ].join(' ')}
              >
                {item.text}
              </button>
            ))}
          </div>
        </div>
      )}
      {selectedItem && !submitted && (
        <div className="mb-4 flex items-center justify-between gap-3 border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm text-white">
          <span>Selected: <strong>{selectedItem.text}</strong></span>
          <button type="button" onClick={() => setSelectedItem(null)} className="border border-white/30 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-white hover:bg-white/10">Clear</button>
        </div>
      )}

      {/* Match targets */}
      <div className="space-y-2">
        {pairs.map((pair) => {
          const placedId = placements[pair.left];
          const placedItem = placedId !== undefined ? draggableItems.find((d) => d.id === placedId) : null;
          const isCorrect = showVerdict && placedItem && placedItem.text === pair.right;
          const isWrong = showVerdict && placedItem && placedItem.text !== pair.right;
          const isEmpty = !placedItem;
          const isDropTarget = draggedItem && isEmpty;
          return (
            <div
              key={pair.left}
              onDrop={(e) => {
                e.preventDefault();
                try { placeOnTarget(pair.left, JSON.parse(e.dataTransfer.getData('application/json'))); } catch { /* ignore */ }
              }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onClick={() => handleTargetClick(pair.left)}
              className={[
                'flex items-center gap-3 border px-4 py-3 transition',
                isCorrect ? 'border-emerald-400 bg-emerald-50' : '',
                isWrong ? 'border-red-400 bg-red-50' : '',
                !submitted && placedItem ? 'border-zinc-900 bg-zinc-50' : '',
                !submitted && isEmpty && isDropTarget ? 'border-dashed border-zinc-900 bg-zinc-50' : '',
                !submitted && isEmpty && !isDropTarget ? 'border-dashed border-zinc-300 bg-zinc-50' : '',
                !submitted && selectedItem && isEmpty ? 'cursor-pointer' : '',
              ].join(' ')}
            >
              <div className="min-w-0 flex-1 text-sm font-medium text-zinc-800">{pair.left}</div>
              <div className="shrink-0">
                {placedItem ? (
                  <span className={[
                    'inline-flex items-center gap-1 border px-3 py-1 text-sm',
                    isCorrect ? 'border-emerald-300 text-emerald-800' : '',
                    isWrong ? 'border-red-300 text-red-800' : '',
                    !submitted ? 'border-zinc-300 text-zinc-900' : '',
                  ].join(' ')}>
                    {placedItem.text}
                    {!submitted && <button type="button" onClick={(e) => { e.stopPropagation(); releaseFromTarget(pair.left); }} className="text-zinc-400 hover:text-zinc-900">&times;</button>}
                  </span>
                ) : (
                  <span className="text-xs text-zinc-400">{isDropTarget ? 'Drop here' : '—'}</span>
                )}
              </div>
              {showVerdict && isWrong && <div className="text-xs text-red-600">Expected: <strong>{pair.right}</strong></div>}
            </div>
          );
        })}
      </div>

      <button type="button" onClick={submit} disabled={Object.keys(placements).length < pairs.length} className="mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">{showCheckButton ? 'Check' : 'Save answer'}</button>
      {submitted && block.explanation && (
        <div className="mt-4 bg-blue-50 p-4 text-sm text-blue-900"><Md text={block.explanation} /></div>
      )}
    </div>
  );
}


