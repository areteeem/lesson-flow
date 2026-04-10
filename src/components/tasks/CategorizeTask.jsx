import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';
import { useShuffleSeed } from '../../hooks/useShuffleSeed';
import { configureDragStart, normalizeDragOver, readDropData } from '../../utils/dragDropSupport';
import { useSmoothDrag } from '../../hooks/useSmoothDrag';
import { AnimatedBankItem, VerdictIcon, DragHint } from '../dnd/DndAnimations';

const CATEGORY_COLORS = ['bg-blue-50 border-blue-200', 'bg-emerald-50 border-emerald-200', 'bg-amber-50 border-amber-200', 'bg-violet-50 border-violet-200', 'bg-rose-50 border-rose-200', 'bg-cyan-50 border-cyan-200', 'bg-orange-50 border-orange-200', 'bg-zinc-100 border-zinc-300'];
const HEADER_COLORS = ['text-blue-800', 'text-emerald-800', 'text-amber-800', 'text-violet-800', 'text-rose-800', 'text-cyan-800', 'text-orange-800', 'text-zinc-700'];
const BUCKET_HOVER = ['hover:border-blue-400', 'hover:border-emerald-400', 'hover:border-amber-400', 'hover:border-violet-400', 'hover:border-rose-400', 'hover:border-cyan-400', 'hover:border-orange-400', 'hover:border-zinc-500'];

export default function CategorizeTask({ block, onComplete, onProgress, showCheckButton = true }) {
  const shuffleSeed = useShuffleSeed();
  const categories = useMemo(() => block.shuffle === false ? (block.categories || []) : stableShuffle(block.categories || [], `${block.id || block.question}-${shuffleSeed}-categories`), [block.categories, block.id, block.question, block.shuffle, shuffleSeed]);

  const items = useMemo(() => {
    const raw = block.items || [];
    const cleaned = raw.map((item) => item.includes('=>') ? item.split('=>')[0].trim() : item);
    return block.shuffle === false ? cleaned : stableShuffle(cleaned, `${block.id || block.question}-${shuffleSeed}-items`);
  }, [block.items, block.id, block.question, block.shuffle, shuffleSeed]);

  const [bank, setBank] = useState(() => items.map((item, i) => ({ id: i, text: item })));
  const [buckets, setBuckets] = useState(() => Object.fromEntries(categories.map((c) => [c, []])));
  const [submitted, setSubmitted] = useState(false);
  const [hoveredCategory, setHoveredCategory] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const hasInteracted = useRef(false);
  const showVerdict = submitted && showCheckButton;

  const { preferTap, reducedMotion, setupMediaListeners, springConfig, gentleSpring, draggedItem, selectedItem, setDraggedItem, setSelectedItem, clearSelection } = useSmoothDrag({ disabled: submitted });

  useEffect(() => setupMediaListeners(), [setupMediaListeners]);

  useEffect(() => {
    if (!submitted && !hasInteracted.current && bank.length > 0) {
      const timer = setTimeout(() => { if (!hasInteracted.current) setShowHint(true); }, 1800);
      return () => clearTimeout(timer);
    }
  }, [submitted, bank.length]);

  const dismissHint = useCallback(() => { setShowHint(false); hasInteracted.current = true; }, []);

  const answerMap = useMemo(() => {
    const fromPairs = Object.fromEntries((block.pairs || []).map((pair) => [pair.left, pair.right]));
    if (Object.keys(fromPairs).length > 0) return fromPairs;
    const fromItems = {};
    (block.items || []).forEach((item) => {
      if (item.includes('=>')) {
        const [left, right] = item.split('=>').map((s) => s.trim());
        if (left && right) fromItems[left] = right;
      }
    });
    return fromItems;
  }, [block.pairs, block.items]);

  const placeItem = (item, category) => {
    if (submitted) return;
    hasInteracted.current = true;
    setShowHint(false);
    setBank((prev) => prev.filter((b) => b.id !== item.id));
    setBuckets((prev) => {
      const next = {};
      for (const [cat, catItems] of Object.entries(prev)) {
        next[cat] = catItems.filter((i) => i.id !== item.id);
      }
      next[category] = [...(next[category] || []), item];
      onProgress?.({ submitted: false, response: next });
      return next;
    });
    clearSelection();
    setHoveredCategory(null);
  };

  const returnToBank = (item, category) => {
    if (submitted) return;
    setBuckets((prev) => {
      const next = { ...prev, [category]: (prev[category] || []).filter((i) => i.id !== item.id) };
      onProgress?.({ submitted: false, response: next });
      return next;
    });
    setBank((prev) => [...prev, item]);
  };

  const handleBankPress = (item) => {
    if (submitted) return;
    hasInteracted.current = true;
    setShowHint(false);
    setSelectedItem((prev) => (prev?.id === item.id ? null : item));
  };

  const handleCategoryClick = (category) => {
    if (submitted || !selectedItem) return;
    placeItem(selectedItem, category);
  };

  const submit = () => {
    const allPlaced = Object.values(buckets).flat();
    const correctCount = allPlaced.filter((item) => {
      const expectedCategory = answerMap[item.text]?.trim().toLowerCase();
      const placedCategory = Object.entries(buckets).find(([, catItems]) =>
        catItems.some((i) => i.id === item.id)
      )?.[0]?.trim().toLowerCase();
      return expectedCategory && placedCategory && expectedCategory === placedCategory;
    }).length;
    const score = correctCount / Math.max(items.length, 1);
    setSubmitted(true);
    onComplete?.({ submitted: true, correct: score === 1, score, response: buckets, correctAnswer: answerMap });
  };

  if (items.length === 0) {
    return (
      <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
        <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
        <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">This categorize task has no items to sort.</div>
      </div>
    );
  }

  return (
    <div className="relative border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <DragHint show={showHint && !submitted} onDismiss={dismissHint} />
      <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.hint && !submitted && <div className="mb-3 text-xs text-zinc-500">{block.hint}</div>}
      {!submitted && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4 text-xs text-zinc-500">
          {preferTap ? 'Tap an item, then tap a category to place it.' : 'Drag items from the bank into categories, or tap to select and place.'}
        </motion.div>
      )}

      {/* Item bank */}
      <AnimatePresence>
        {bank.length > 0 && !submitted && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={gentleSpring} className="mb-5">
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Word bank</div>
            <div className="flex flex-wrap gap-2 border border-zinc-200 bg-zinc-50 p-3">
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
                      configureDragStart(e, JSON.stringify(item), 'application/json');
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
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={springConfig}
            className="mb-4 flex items-center justify-between gap-3 border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm text-white"
          >
            <span>Selected: <strong>{selectedItem.text}</strong> — tap a category below</span>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} type="button" onClick={() => setSelectedItem(null)} className="border border-white/30 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-white hover:bg-white/10">Clear</motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category columns */}
      <div className={`grid gap-3 ${categories.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' : categories.length <= 3 ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4'}`}>
        {categories.map((category, catIdx) => {
          const bucket = buckets[category] || [];
          const colorClass = CATEGORY_COLORS[catIdx % CATEGORY_COLORS.length];
          const headerColor = HEADER_COLORS[catIdx % HEADER_COLORS.length];
          const hoverBorder = BUCKET_HOVER[catIdx % BUCKET_HOVER.length];
          const isHovered = hoveredCategory === category;
          return (
            <motion.div
              key={category}
              layout={!reducedMotion}
              animate={{
                scale: isHovered && !submitted ? 1.02 : 1,
              }}
              transition={springConfig}
              onDrop={(e) => {
                e.preventDefault();
                setHoveredCategory(null);
                const data = readDropData(e, 'application/json');
                if (data) { try { placeItem(JSON.parse(data), category); } catch { /* ignore */ } }
              }}
              onDragOver={(e) => { normalizeDragOver(e); setHoveredCategory(category); }}
              onDragLeave={() => setHoveredCategory(null)}
              onClick={() => handleCategoryClick(category)}
              className={[
                'min-h-28 border p-3 transition-colors',
                !submitted && selectedItem ? `${colorClass} cursor-pointer border-dashed ${hoverBorder}` : colorClass,
                !submitted && draggedItem ? 'border-dashed' : '',
                isHovered && !submitted ? 'border-solid shadow-md' : '',
              ].join(' ')}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className={`text-xs font-bold uppercase tracking-[0.18em] ${headerColor}`}>{category}</span>
                {bucket.length > 0 && (
                  <motion.span
                    key={bucket.length}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={springConfig}
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-600"
                  >
                    {bucket.length}
                  </motion.span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <AnimatePresence>
                  {bucket.map((item) => {
                    const expectedCategory = answerMap[item.text]?.trim().toLowerCase();
                    const isCorrect = showVerdict && expectedCategory === category.trim().toLowerCase();
                    const isWrong = showVerdict && expectedCategory && expectedCategory !== category.trim().toLowerCase();
                    return (
                      <motion.button
                        key={item.id}
                        layout={!reducedMotion}
                        initial={{ opacity: 0, scale: 0.8, y: 4 }}
                        animate={{
                          opacity: 1,
                          scale: 1,
                          y: 0,
                          x: isWrong ? [0, -3, 3, -2, 2, 0] : 0,
                        }}
                        exit={{ opacity: 0, scale: 0.8, y: -4 }}
                        transition={springConfig}
                        whileHover={!submitted ? { scale: 1.05 } : undefined}
                        whileTap={!submitted ? { scale: 0.95 } : undefined}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); returnToBank(item, category); }}
                        disabled={submitted}
                        className={[
                          'border px-2.5 py-1.5 text-xs font-medium transition-colors',
                          isCorrect ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : '',
                          isWrong ? 'border-red-300 bg-red-50 text-red-800' : '',
                          !submitted ? 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-red-300 hover:bg-red-50' : '',
                        ].join(' ')}
                      >
                        <span className="flex items-center gap-1">
                          {item.text}
                          {showVerdict && <VerdictIcon isCorrect={isCorrect} isWrong={isWrong} className="text-[10px]" />}
                          {isWrong && <span className="ml-1 text-[10px] text-red-500">→ {answerMap[item.text]}</span>}
                        </span>
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
                {bucket.length === 0 && !submitted && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} className="text-xs text-zinc-400 py-1">Drop items here</motion.span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {submitted && block.explanation && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={gentleSpring} className="mt-4 text-sm text-zinc-600"><Md text={block.explanation} /></motion.div>
      )}
      {!submitted && (
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button" onClick={submit} disabled={bank.length > 0} className="mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">{showCheckButton ? 'Check' : 'Save answer'}</motion.button>
      )}
    </div>
  );
}

