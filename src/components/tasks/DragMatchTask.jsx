import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';
import { useShuffleSeed } from '../../hooks/useShuffleSeed';
import { configureDragStart, normalizeDragOver, readDropData } from '../../utils/dragDropSupport';
import { useSmoothDrag } from '../../hooks/useSmoothDrag';
import { AnimatedBankItem, VerdictIcon, DragHint } from '../dnd/DndAnimations';

const MATCH_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-300', text: 'text-blue-800', dot: 'bg-blue-500' },
  { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-800', dot: 'bg-amber-500' },
  { bg: 'bg-violet-50', border: 'border-violet-300', text: 'text-violet-800', dot: 'bg-violet-500' },
  { bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-800', dot: 'bg-rose-500' },
  { bg: 'bg-cyan-50', border: 'border-cyan-300', text: 'text-cyan-800', dot: 'bg-cyan-500' },
  { bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-800', dot: 'bg-orange-500' },
  { bg: 'bg-zinc-100', border: 'border-zinc-300', text: 'text-zinc-700', dot: 'bg-zinc-500' },
];

export default function DragMatchTask({ block, onComplete, onProgress, showCheckButton = true }) {
  const pairs = block.pairs || [];
  const shuffleSeed = useShuffleSeed();

  const leftItems = useMemo(() => {
    const items = pairs.map((p, i) => ({ id: i, text: p.left }));
    return block.shuffle === false ? items : stableShuffle(items, `${block.id}-${shuffleSeed}-left`);
  }, [block.id, block.shuffle, pairs, shuffleSeed]);

  const rightTargets = useMemo(() => {
    const targets = pairs.map((p, i) => ({ id: i, text: p.right, expectedLeft: p.left }));
    return block.shuffle === false ? targets : stableShuffle(targets, `${block.id}-${shuffleSeed}-right`);
  }, [block.id, block.shuffle, pairs, shuffleSeed]);

  const [placements, setPlacements] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [hoveredTarget, setHoveredTarget] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const hasInteracted = useRef(false);
  const showVerdict = submitted && showCheckButton;

  const { preferTap, reducedMotion, setupMediaListeners, springConfig, gentleSpring, draggedItem, selectedItem, setDraggedItem, setSelectedItem, clearSelection } = useSmoothDrag({ disabled: submitted });

  useEffect(() => setupMediaListeners(), [setupMediaListeners]);

  useEffect(() => {
    if (!submitted && !hasInteracted.current && pairs.length > 0) {
      const timer = setTimeout(() => { if (!hasInteracted.current) setShowHint(true); }, 1800);
      return () => clearTimeout(timer);
    }
  }, [submitted, pairs.length]);

  const dismissHint = useCallback(() => { setShowHint(false); hasInteracted.current = true; }, []);

  const placedLeftIds = new Set(Object.values(placements));

  // Color assignments for matched pairs
  const pairColorMap = useMemo(() => {
    const map = {};
    let colorIdx = 0;
    for (const [targetId, leftId] of Object.entries(placements)) {
      const c = MATCH_COLORS[colorIdx % MATCH_COLORS.length];
      map[targetId] = c;
      map[`left-${leftId}`] = c;
      colorIdx++;
    }
    return map;
  }, [placements]);

  const handleDrop = (targetId, leftItemId) => {
    if (submitted) return;
    hasInteracted.current = true;
    setShowHint(false);
    setPlacements((prev) => {
      const next = { ...prev };
      for (const [tId, lId] of Object.entries(next)) {
        if (lId === leftItemId) delete next[tId];
      }
      next[targetId] = leftItemId;
      onProgress?.({ submitted: false, response: next });
      return next;
    });
    clearSelection();
    setHoveredTarget(null);
  };

  const releaseFromTarget = (targetId) => {
    if (submitted) return;
    setPlacements((prev) => {
      const next = { ...prev };
      delete next[targetId];
      onProgress?.({ submitted: false, response: next });
      return next;
    });
  };

  const handleItemPress = (itemId) => {
    if (submitted || placedLeftIds.has(itemId)) return;
    hasInteracted.current = true;
    setShowHint(false);
    const item = leftItems.find((l) => l.id === itemId);
    setSelectedItem((prev) => (prev?.id === itemId ? null : item));
  };

  const handleTargetClick = (targetId) => {
    if (submitted) return;
    const activeId = selectedItem?.id ?? draggedItem?.id;
    if (activeId !== null && activeId !== undefined && placements[targetId] === undefined) {
      handleDrop(targetId, activeId);
    } else if (placements[targetId] !== undefined) {
      releaseFromTarget(targetId);
    }
  };

  const submit = () => {
    setSubmitted(true);
    const correctCount = rightTargets.filter((target) => {
      const placedLeftId = placements[target.id];
      if (placedLeftId === undefined) return false;
      const leftItem = leftItems.find((l) => l.id === placedLeftId);
      return leftItem && leftItem.text.toLowerCase() === target.expectedLeft.toLowerCase();
    }).length;
    const score = correctCount / Math.max(pairs.length, 1);
    onComplete?.({ submitted: true, correct: score === 1, score, response: placements, correctAnswer: pairs });
  };

  return (
    <div className="task-shell relative border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <DragHint show={showHint && !submitted} onDismiss={dismissHint} />
      <div className="mb-4 text-xl font-semibold text-zinc-950">
        <Md text={block.question || block.instruction || 'Drag each item to its match'} />
      </div>
      {block.hint && !submitted && <div className="task-helper-text mb-3 text-xs text-zinc-500">{block.hint}</div>}
      {!submitted && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="task-helper-text mb-3 text-xs text-zinc-500">
          {preferTap ? 'Tap an item, then tap a definition to place it.' : 'Drag items to their matching definitions, or tap to select and place.'}
        </motion.div>
      )}
      {pairs.length === 0 && (
        <div className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">This task has no pairs to match.</div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <AnimatePresence>
          {selectedItem && !submitted && (
            <motion.div
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={springConfig}
              className="task-inverse-banner col-span-full flex items-center justify-between gap-3 border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm text-white"
            >
              <span>Selected: <strong>{selectedItem.text}</strong></span>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} type="button" onClick={() => setSelectedItem(null)} className="border border-white/30 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-white hover:bg-white/10">Clear</motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Left: draggable items */}
        <div>
          <div className="task-helper-text mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Items</div>
          <div className="flex flex-wrap gap-2">
            <AnimatePresence>
              {leftItems.map((item) => {
                const isPlaced = placedLeftIds.has(item.id);
                const isDragging = draggedItem?.id === item.id;
                const isSelected = selectedItem?.id === item.id;
                const pairColor = pairColorMap[`left-${item.id}`];
                return (
                  <AnimatedBankItem
                    key={item.id}
                    item={item}
                    isSelected={isSelected || isDragging}
                    disabled={submitted}
                    draggable={!submitted && !isPlaced}
                    onDragStart={(e) => {
                      setDraggedItem(item);
                      setSelectedItem(item);
                      configureDragStart(e, String(item.id));
                    }}
                    onDragEnd={() => setDraggedItem(null)}
                    onClick={() => handleItemPress(item.id)}
                    className={`min-h-11 border px-4 py-2 text-sm font-medium ${isPlaced && pairColor ? `${pairColor.bg} ${pairColor.border} ${pairColor.text}` : ''}`}
                    defaultClassName={isPlaced && !pairColor ? 'border-zinc-100 bg-zinc-50 text-zinc-300 cursor-default' : 'border-zinc-200 bg-white text-zinc-800 hover:-translate-y-0.5 hover:border-zinc-900 cursor-grab active:cursor-grabbing'}
                  >
                    {isPlaced && pairColor && <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${pairColor.dot}`} />}
                    {item.text}
                  </AnimatedBankItem>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: drop targets */}
        <div>
          <div className="task-helper-text mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Definitions</div>
          <div className="space-y-2">
            <AnimatePresence>
              {rightTargets.map((target) => {
                const placedLeftId = placements[target.id];
                const placedItem = placedLeftId !== undefined ? leftItems.find((l) => l.id === placedLeftId) : null;
                const isCorrect = showVerdict && placedItem && placedItem.text.toLowerCase() === target.expectedLeft.toLowerCase();
                const isWrong = showVerdict && placedItem && placedItem.text.toLowerCase() !== target.expectedLeft.toLowerCase();
                const isEmpty = !placedItem;
                const isHovered = hoveredTarget === target.id;
                const isDropTarget = (draggedItem !== null || selectedItem !== null) && isEmpty;
                const pairColor = pairColorMap[target.id];
                return (
                  <motion.div
                    key={target.id}
                    layout={!reducedMotion}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: isHovered && isEmpty ? 1.02 : 1,
                      x: isWrong ? [0, -4, 4, -2, 2, 0] : 0,
                    }}
                    transition={springConfig}
                    onDrop={(e) => {
                      e.preventDefault();
                      setHoveredTarget(null);
                      const leftId = Number(readDropData(e));
                      if (!isNaN(leftId)) handleDrop(target.id, leftId);
                    }}
                    onDragOver={(e) => { normalizeDragOver(e); setHoveredTarget(target.id); }}
                    onDragLeave={() => setHoveredTarget(null)}
                    onClick={() => handleTargetClick(target.id)}
                    className={[
                      'flex items-center gap-3 border px-4 py-3 transition-colors',
                      isCorrect ? 'border-emerald-400 bg-emerald-50' : '',
                      isWrong ? 'border-red-400 bg-red-50' : '',
                      !submitted && placedItem && pairColor ? `${pairColor.border} ${pairColor.bg}` : '',
                      !submitted && placedItem && !pairColor ? 'border-zinc-900 bg-zinc-50' : '',
                      !submitted && isEmpty && isHovered ? 'border-solid border-zinc-900 bg-zinc-50' : '',
                      !submitted && isEmpty && isDropTarget && !isHovered ? 'border-dashed border-zinc-600 bg-zinc-50' : '',
                      !submitted && isEmpty && !isDropTarget ? 'border-dashed border-zinc-300 bg-zinc-50' : '',
                    ].join(' ')}
                  >
                    {pairColor && placedItem && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${pairColor.dot}`} />}
                    <div className="min-w-0 flex-1 text-sm text-zinc-600">{target.text}</div>
                    <div className="shrink-0">
                      {placedItem ? (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={springConfig}
                          className={[
                            'inline-flex items-center border px-3 py-1 text-sm font-medium',
                            isCorrect ? 'border-emerald-300 text-emerald-800' : '',
                            isWrong ? 'border-red-300 text-red-800' : '',
                            !submitted ? 'border-zinc-300 text-zinc-900' : '',
                          ].join(' ')}
                        >
                          {placedItem.text}
                          {!submitted && (
                            <motion.button whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }} type="button" onClick={(e) => { e.stopPropagation(); releaseFromTarget(target.id); }} className="ml-2 text-zinc-400 hover:text-zinc-900">&times;</motion.button>
                          )}
                        </motion.span>
                      ) : (
                        <span className="text-xs text-zinc-400">{isDropTarget ? 'Tap to place' : 'Empty'}</span>
                      )}
                    </div>
                    {showVerdict && <VerdictIcon isCorrect={isCorrect} isWrong={isWrong} />}
                    {showVerdict && isWrong && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-red-600">Expected: <strong>{target.expectedLeft}</strong></motion.div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {!submitted && (
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button" onClick={submit} disabled={Object.keys(placements).length < pairs.length} className="task-primary-button mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">
          {showCheckButton ? 'Check' : 'Save answer'}
        </motion.button>
      )}
      {submitted && block.explanation && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={gentleSpring} className="task-muted-panel mt-4 border p-4 text-sm text-blue-900"><Md text={block.explanation} /></motion.div>
      )}
    </div>
  );
}


