import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';
import { BLANK_MARKER_RE } from '../../utils/patterns';
import { useShuffleSeed } from '../../hooks/useShuffleSeed';
import { configureDragStart, normalizeDragOver, readDropData } from '../../utils/dragDropSupport';
import { useSmoothDrag } from '../../hooks/useSmoothDrag';
import { AnimatedBlankSlot, AnimatedBankItem, VerdictIcon, DragHint } from '../dnd/DndAnimations';

export default function DragToBlankTask({ block, onComplete, onProgress, showCheckButton = true }) {
  const sentence = block.text || block.sentence || '';
  const tokens = sentence.split(BLANK_MARKER_RE);
  const answers = block.blanks || [];
  const blankCount = tokens.filter((t) => BLANK_MARKER_RE.test(t)).length;
  const shuffleSeed = useShuffleSeed();
  const [values, setValues] = useState(Array(Math.max(blankCount, 1)).fill(''));

  const indexedPool = useMemo(() => {
    const source = block.options?.length ? [...answers, ...block.options.filter((o) => !answers.includes(o))] : [...answers];
    const indexed = source.map((word, i) => ({ id: i, word }));
    return block.shuffle === false ? indexed : stableShuffle(indexed, `${block.id || block.question}-${shuffleSeed}-drag-pool`);
  }, [answers, block.id, block.options, block.question, block.shuffle, shuffleSeed]);

  const [pool, setPool] = useState(indexedPool);
  const [placedIds, setPlacedIds] = useState(Array(Math.max(blankCount, 1)).fill(null));
  const [submitted, setSubmitted] = useState(false);
  const [hoveredBlank, setHoveredBlank] = useState(null);
  const [showHint, setShowHint] = useState(false);
  const hasInteracted = useRef(false);
  const showVerdict = submitted && showCheckButton;

  const { preferTap, reducedMotion, setupMediaListeners, springConfig, gentleSpring, draggedItem, selectedItem, setDraggedItem, setSelectedItem, clearSelection } = useSmoothDrag({ disabled: submitted });

  useEffect(() => setupMediaListeners(), [setupMediaListeners]);

  useEffect(() => {
    if (!submitted && !hasInteracted.current && pool.length > 0) {
      const timer = setTimeout(() => { if (!hasInteracted.current) setShowHint(true); }, 1800);
      return () => clearTimeout(timer);
    }
  }, [submitted, pool.length]);

  const dismissHint = useCallback(() => { setShowHint(false); hasInteracted.current = true; }, []);

  const fillBlank = (blankIdx, item) => {
    if (!item || submitted) return;
    hasInteracted.current = true;
    setShowHint(false);
    setValues((current) => {
      const next = [...current];
      if (next[blankIdx]) {
        const oldId = placedIds[blankIdx];
        if (oldId !== null) {
          const oldWord = next[blankIdx];
          setPool((p) => [...p, { id: oldId, word: oldWord }]);
        }
      }
      next[blankIdx] = item.word;
      onProgress?.({ submitted: false, response: next });
      return next;
    });
    setPlacedIds((current) => {
      const next = [...current];
      next[blankIdx] = item.id;
      return next;
    });
    setPool((p) => p.filter((entry) => entry.id !== item.id));
    clearSelection();
    setHoveredBlank(null);
  };

  const releaseBlank = (blankIdx) => {
    if (submitted || !values[blankIdx]) return;
    const releasedId = placedIds[blankIdx];
    const releasedWord = values[blankIdx];
    setPool((p) => [...p, { id: releasedId, word: releasedWord }]);
    setValues((current) => {
      const next = current.map((v, i) => i === blankIdx ? '' : v);
      onProgress?.({ submitted: false, response: next });
      return next;
    });
    setPlacedIds((current) => current.map((v, i) => i === blankIdx ? null : v));
  };

  const handlePoolItemPress = (item) => {
    if (submitted) return;
    hasInteracted.current = true;
    setShowHint(false);
    if (preferTap) {
      setSelectedItem((current) => current?.id === item.id ? null : item);
      return;
    }
    const firstEmpty = values.findIndex((value) => !value);
    if (firstEmpty >= 0) {
      fillBlank(firstEmpty, item);
      return;
    }
    setSelectedItem((current) => current?.id === item.id ? null : item);
  };

  const submit = () => {
    const score = values.reduce((total, value, index) => total + (value.trim().toLowerCase() === (answers[index] || '').trim().toLowerCase() ? 1 : 0), 0) / Math.max(answers.length, 1);
    setSubmitted(true);
    onComplete?.({ submitted: true, correct: score === 1, score, response: values, correctAnswer: answers });
  };

  if (blankCount === 0) {
    return (
      <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
        <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
        {sentence && <div className="mb-4 whitespace-pre-wrap text-sm leading-7 text-zinc-700">{sentence}</div>}
        <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">This task has no blanks to fill. The text should contain ___ or {'{ }'} markers.</div>
      </div>
    );
  }

  const blankIndices = tokens.reduce((acc, token, i) => {
    if (/(\{\}|_{3,}|\[blank\]|\[\d+\])/i.test(token)) acc[i] = Object.keys(acc).length;
    return acc;
  }, {});

  return (
    <div className="relative border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <DragHint show={showHint && !submitted} onDismiss={dismissHint} />
      <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.hint && !submitted && <div className="mb-3 text-xs text-zinc-500">{block.hint}</div>}
      {preferTap && !submitted && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={gentleSpring} className="mb-4 border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Tap a word in the bank, then tap a blank to place it. Tap a filled blank to remove its word.
        </motion.div>
      )}
      <AnimatePresence>
        {selectedItem && !submitted && (
          <motion.div
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={springConfig}
            className="mb-4 flex items-center justify-between gap-3 border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm text-white"
          >
            <span>Selected word: <strong>{selectedItem.word}</strong></span>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} type="button" onClick={() => setSelectedItem(null)} className="border border-white/30 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition hover:bg-white/10">Clear</motion.button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mb-5 border border-zinc-200 bg-zinc-50 p-4 md:p-5 text-base leading-8 md:leading-9 text-zinc-800">
        {tokens.map((token, index) => {
          if (!/(\{\}|_{3,}|\[blank\]|\[\d+\])/i.test(token)) {
            return <span key={index} className="whitespace-pre-wrap">{token}</span>;
          }
          const currentBlank = blankIndices[index];
          const value = values[currentBlank];
          const correct = showVerdict && value.trim().toLowerCase() === (answers[currentBlank] || '').trim().toLowerCase();
          const wrong = showVerdict && value && !correct;
          const isHovered = hoveredBlank === currentBlank && !submitted;
          return (
            <AnimatedBlankSlot
              key={index}
              value={value}
              ghostPreview={selectedItem?.word || draggedItem?.word || null}
              isHovered={isHovered}
              isCorrect={correct}
              isWrong={wrong}
              submitted={submitted}
              onDrop={(event) => {
                event.preventDefault();
                setHoveredBlank(null);
                const data = readDropData(event, 'application/json');
                if (data) { try { fillBlank(currentBlank, JSON.parse(data)); } catch { /* ignore */ } }
              }}
              onDragOver={(e) => { normalizeDragOver(e); setHoveredBlank(currentBlank); }}
              onDragLeave={() => setHoveredBlank(null)}
              onClick={() => {
                if (selectedItem) { fillBlank(currentBlank, selectedItem); return; }
                releaseBlank(currentBlank);
              }}
            />
          );
        })}
      </div>
      <AnimatePresence>
        {showVerdict && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={gentleSpring} className="mb-4 space-y-1">
            {values.map((value, idx) => {
              const isCorrect = value.trim().toLowerCase() === (answers[idx] || '').trim().toLowerCase();
              return !isCorrect ? (
                <motion.div key={idx} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...springConfig, delay: idx * 0.05 }} className="flex items-center gap-2 text-xs text-red-600">
                  <VerdictIcon isWrong />
                  <span>Blank {idx + 1}: expected <strong>{answers[idx]}</strong>, got <strong>{value || '(empty)'}</strong></span>
                </motion.div>
              ) : null;
            })}
            {block.explanation && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-2 text-sm text-zinc-600"><Md text={block.explanation} /></motion.div>}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
        <span>Word bank</span>
        <span>{preferTap ? 'Tap to place' : 'Drag or tap'}</span>
      </div>
      <div className="mb-5 flex flex-wrap gap-2 border border-zinc-200 bg-white p-4">
        <AnimatePresence>
          {pool.length === 0 && !submitted && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-zinc-400">All words placed</motion.span>
          )}
          {pool.map((item) => (
            <AnimatedBankItem
              key={item.id}
              item={item}
              isSelected={selectedItem?.id === item.id}
              isDragging={draggedItem?.id === item.id}
              disabled={submitted}
              onDragStart={(event) => {
                setDraggedItem(item);
                setSelectedItem(item);
                configureDragStart(event, JSON.stringify(item), 'application/json');
              }}
              onDragEnd={() => setDraggedItem(null)}
              onClick={() => handlePoolItemPress(item)}
              className="min-h-11 border px-4 py-2 text-sm font-medium md:min-h-12"
            >
              {item.word}
            </AnimatedBankItem>
          ))}
        </AnimatePresence>
      </div>
      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="button" onClick={submit} disabled={values.some((v) => !v)} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">
        {showCheckButton ? 'Check' : 'Save answer'}
      </motion.button>
    </div>
  );
}


