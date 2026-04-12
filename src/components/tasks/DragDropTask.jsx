import { useMemo, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';
import { useShuffleSeed } from '../../hooks/useShuffleSeed';
import { useSmoothDrag } from '../../hooks/useSmoothDrag';
import { AnimatedBankItem, VerdictIcon } from '../dnd/DndAnimations';

export default function DragDropTask({ block, onComplete, onProgress, showCheckButton = true }) {
  const pairs = block.pairs || [];
  const shuffleSeed = useShuffleSeed();

  const draggableItems = useMemo(() => {
    const indexed = pairs.map((pair, i) => ({ id: i, text: pair.right }));
    return block.shuffle === false ? indexed : stableShuffle(indexed, `${block.id || block.question}-${shuffleSeed}-right-options`);
  }, [block.id, block.question, block.shuffle, pairs, shuffleSeed]);

  const [placements, setPlacements] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [hoveredTarget, setHoveredTarget] = useState(null);
  const hasInteracted = useRef(false);
  const showVerdict = submitted && showCheckButton;

  const { preferTap, reducedMotion, setupMediaListeners, springConfig, gentleSpring, draggedItem, selectedItem, setDraggedItem, setSelectedItem, clearSelection } = useSmoothDrag({ disabled: submitted });

  useEffect(() => setupMediaListeners(), [setupMediaListeners]);

  const placedItemIds = new Set(Object.values(placements));
  const bank = draggableItems.filter((item) => !placedItemIds.has(item.id));

  const placeOnTarget = (leftValue, item) => {
    if (submitted || !item) return;
    hasInteracted.current = true;
    setPlacements((prev) => {
      const next = { ...prev };
      for (const [key, val] of Object.entries(next)) {
        if (val === item.id) delete next[key];
      }
      next[leftValue] = item.id;
      onProgress?.({ submitted: false, response: next });
      return next;
    });
    clearSelection();
    setHoveredTarget(null);
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
    hasInteracted.current = true;
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
    <div className="task-shell relative border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.hint && !submitted && <div className="task-helper-text mb-3 text-xs text-zinc-500">{block.hint}</div>}
      {pairs.length === 0 && (
        <div className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">This task has no pairs to match.</div>
      )}

      {/* Answer bank */}
      <AnimatePresence>
        {bank.length > 0 && !submitted && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={gentleSpring} className="mb-5">
            <div className="task-helper-text mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Answer bank</div>
            <div className="task-bank-panel flex flex-wrap gap-2 border border-zinc-200 bg-zinc-50 p-3">
              <AnimatePresence>
                {bank.map((item) => (
                  <AnimatedBankItem
                    key={item.id}
                    item={item}
                    isSelected={selectedItem?.id === item.id}
                    isDragging={draggedItem?.id === item.id}
                    disabled={submitted}
                    onDragStart={(e) => {
                      setDraggedItem(item);
                      setSelectedItem(item);
                      e.dataTransfer.setData('application/json', JSON.stringify(item));
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => setDraggedItem(null)}
                    onClick={() => handleBankPress(item)}
                    className="min-h-10 border px-3 py-2 text-sm font-medium"
                  >
                    {item.text}
                  </AnimatedBankItem>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selectedItem && !submitted && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="mb-3 flex items-center gap-2 text-xs text-zinc-500"
          >
            <span className="inline-flex items-center gap-1.5 border border-zinc-300 bg-zinc-50 px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-900" />
              <strong className="text-zinc-900">{selectedItem.text}</strong> — tap a target
            </span>
            <button type="button" onClick={() => setSelectedItem(null)} className="text-zinc-400 hover:text-zinc-700">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Match targets */}
      <div className="space-y-2">
        <AnimatePresence>
          {pairs.map((pair, pairIdx) => {
            const placedId = placements[pair.left];
            const placedItem = placedId !== undefined ? draggableItems.find((d) => d.id === placedId) : null;
            const isCorrect = showVerdict && placedItem && placedItem.text === pair.right;
            const isWrong = showVerdict && placedItem && placedItem.text !== pair.right;
            const isEmpty = !placedItem;
            const isHovered = hoveredTarget === pair.left;
            const isDropTarget = draggedItem && isEmpty;
            return (
              <motion.div
                key={pair.left}
                layout={!reducedMotion}
                initial={{ opacity: 0, y: 8 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: isHovered && isEmpty ? 1.01 : 1,
                  x: isWrong ? [0, -4, 4, -2, 2, 0] : 0,
                }}
                transition={{ ...springConfig, delay: pairIdx * 0.03 }}
                onDrop={(e) => {
                  e.preventDefault();
                  setHoveredTarget(null);
                  try { placeOnTarget(pair.left, JSON.parse(e.dataTransfer.getData('application/json'))); } catch { /* ignore */ }
                }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setHoveredTarget(pair.left); }}
                onDragLeave={() => setHoveredTarget(null)}
                onClick={() => handleTargetClick(pair.left)}
                className={[
                  'flex items-center gap-3 border px-4 py-3 transition-colors',
                  isCorrect ? 'border-emerald-400 bg-emerald-50' : '',
                  isWrong ? 'border-red-400 bg-red-50' : '',
                  !submitted && placedItem ? 'border-zinc-900 bg-zinc-50' : '',
                  !submitted && isEmpty && isHovered ? 'border-solid border-zinc-900 bg-zinc-50' : '',
                  !submitted && isEmpty && isDropTarget && !isHovered ? 'border-dashed border-zinc-600 bg-zinc-50' : '',
                  !submitted && isEmpty && !isDropTarget ? 'border-dashed border-zinc-300 bg-zinc-50' : '',
                  !submitted && selectedItem && isEmpty ? 'cursor-pointer' : '',
                ].join(' ')}
              >
                <div className="min-w-0 flex-1 text-sm font-medium text-zinc-800">{pair.left}</div>
                <div className="shrink-0">
                  {placedItem ? (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={springConfig}
                      className={[
                        'inline-flex items-center gap-1 border px-3 py-1 text-sm',
                        isCorrect ? 'border-emerald-300 text-emerald-800' : '',
                        isWrong ? 'border-red-300 text-red-800' : '',
                        !submitted ? 'border-zinc-300 text-zinc-900' : '',
                      ].join(' ')}
                    >
                      {placedItem.text}
                      {!submitted && (
                        <motion.button whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }} type="button" onClick={(e) => { e.stopPropagation(); releaseFromTarget(pair.left); }} className="text-zinc-400 hover:text-zinc-900">&times;</motion.button>
                      )}
                    </motion.span>
                  ) : (
                    <span className="text-xs text-zinc-400">{isHovered || isDropTarget ? 'Drop here' : '—'}</span>
                  )}
                </div>
                {showVerdict && <VerdictIcon isCorrect={isCorrect} isWrong={isWrong} />}
                {showVerdict && isWrong && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-red-600">Expected: <strong>{pair.right}</strong></motion.div>}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button" onClick={submit} disabled={Object.keys(placements).length < pairs.length} className="task-primary-button mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">{showCheckButton ? 'Check' : 'Save answer'}</motion.button>
      {submitted && block.explanation && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={gentleSpring} className="task-muted-panel mt-4 border p-4 text-sm text-blue-900"><Md text={block.explanation} /></motion.div>
      )}
    </div>
  );
}


