import { useEffect, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';
import { useShuffleSeed } from '../../hooks/useShuffleSeed';
import { configureDragStart, normalizeDragOver, readDropData } from '../../utils/dragDropSupport';
import { useSmoothDrag } from '../../hooks/useSmoothDrag';
import { AnimatedBlankSlot, AnimatedBankItem, VerdictIcon } from '../dnd/DndAnimations';

const WORD_RE = /(\s+)/;
const PUNCTUATION_RE = /^[.,!?;:'"()[\]{}—–-]+$/;

function cleanWord(w) {
  return w.replace(/[.,!?;:'"()[\]{}—–-]/g, '').toLowerCase();
}

function computeHiddenIndices(words, focusWords, hideCount, hideMinLength, seed) {
  const focusSet = new Set((focusWords || []).map((w) => w.toLowerCase()));
  const indices = [];
  const eligible = [];

  words.forEach((token, idx) => {
    if (/^\s+$/.test(token) || PUNCTUATION_RE.test(token)) return;
    const clean = cleanWord(token);
    if (!clean) return;
    if (focusSet.has(clean)) {
      indices.push(idx);
    } else if (clean.length >= (hideMinLength || 3)) {
      eligible.push(idx);
    }
  });

  const remaining = hideCount > 0 ? hideCount : 0;
  if (remaining > 0 && eligible.length > 0) {
    const shuffled = stableShuffle(eligible, seed);
    for (let i = 0; i < Math.min(remaining, shuffled.length); i++) {
      indices.push(shuffled[i]);
    }
  }

  return new Set(indices);
}

export default function WordHideTask({ block, onComplete, onProgress, showCheckButton = true }) {
  const text = block.text || '';
  const words = text.split(WORD_RE);
  const focusWords = block.focusWords || [];
  const hideCount = typeof block.hideCount === 'number' ? block.hideCount : 3;
  const hideMinLength = typeof block.hideMinLength === 'number' ? block.hideMinLength : 3;
  const shuffleSeed = useShuffleSeed();

  const hideMode = block.hideMode || (block.taskType === 'word_hide_drag' ? 'drag' : block.taskType === 'word_hide_type' ? 'type' : 'reveal');

  const wordsKey = words.join('\x00');
  const focusKey = focusWords.join('\x00');
  const hiddenSet = useMemo(
    () => computeHiddenIndices(words, focusWords, hideCount, hideMinLength, `${block.id || block.question}-${shuffleSeed}-hide`),
    [wordsKey, focusKey, hideCount, hideMinLength, block.id, block.question, shuffleSeed],
  );

  const hiddenIndices = useMemo(() => [...hiddenSet].sort((a, b) => a - b), [hiddenSet]);
  const hiddenWords = useMemo(() => hiddenIndices.map((idx) => words[idx]), [hiddenIndices, words]);

  // === Reveal mode state ===
  const [revealed, setRevealed] = useState(new Set());

  // === Drag mode state ===
  const indexedPool = useMemo(() => {
    return stableShuffle(
      hiddenWords.map((w, i) => ({ id: i, word: w })),
      `${block.id || block.question}-${shuffleSeed}-pool`,
    );
  }, [hiddenWords, block.id, block.question, shuffleSeed]);

  const [pool, setPool] = useState(indexedPool);
  const [dragValues, setDragValues] = useState(() => Array(hiddenIndices.length).fill(''));
  const [placedIds, setPlacedIds] = useState(() => Array(hiddenIndices.length).fill(null));
  const [hoveredSlot, setHoveredSlot] = useState(null);
  const hasInteracted = useRef(false);

  // === Type mode state ===
  const [typeValues, setTypeValues] = useState(() => Array(hiddenIndices.length).fill(''));

  const [submitted, setSubmitted] = useState(false);
  const showVerdict = submitted && showCheckButton;

  const { preferTap, reducedMotion, setupMediaListeners, springConfig, gentleSpring, draggedItem, selectedItem, setDraggedItem, setSelectedItem, clearSelection } = useSmoothDrag({ disabled: submitted });

  useEffect(() => setupMediaListeners(), [setupMediaListeners]);



  // === Drag helpers ===
  const fillBlank = (slotIdx, item) => {
    if (!item || submitted) return;
    hasInteracted.current = true;
    setDragValues((current) => {
      const next = [...current];
      if (next[slotIdx]) {
        const oldId = placedIds[slotIdx];
        if (oldId !== null) {
          const oldWord = next[slotIdx];
          setPool((p) => [...p, { id: oldId, word: oldWord }]);
        }
      }
      next[slotIdx] = item.word;
      onProgress?.({ submitted: false, response: next });
      return next;
    });
    setPlacedIds((current) => {
      const next = [...current];
      next[slotIdx] = item.id;
      return next;
    });
    setPool((p) => p.filter((e) => e.id !== item.id));
    clearSelection();
    setHoveredSlot(null);
  };

  const releaseBlank = (slotIdx) => {
    if (submitted || !dragValues[slotIdx]) return;
    const releasedId = placedIds[slotIdx];
    const releasedWord = dragValues[slotIdx];
    setPool((p) => [...p, { id: releasedId, word: releasedWord }]);
    setDragValues((current) => {
      const next = current.map((v, i) => (i === slotIdx ? '' : v));
      onProgress?.({ submitted: false, response: next });
      return next;
    });
    setPlacedIds((current) => current.map((v, i) => (i === slotIdx ? null : v)));
  };

  const handlePoolItemPress = (item) => {
    if (submitted) return;
    hasInteracted.current = true;
    if (preferTap) {
      setSelectedItem((current) => (current?.id === item.id ? null : item));
      return;
    }
    const firstEmpty = dragValues.findIndex((v) => !v);
    if (firstEmpty >= 0) {
      fillBlank(firstEmpty, item);
      return;
    }
    setSelectedItem((current) => (current?.id === item.id ? null : item));
  };

  // === Submit ===
  const submit = () => {
    let score = 0;
    const totalHidden = hiddenIndices.length;
    if (hideMode === 'reveal') {
      score = revealed.size / Math.max(totalHidden, 1);
    } else if (hideMode === 'drag') {
      score = dragValues.reduce((t, v, i) => t + (cleanWord(v) === cleanWord(hiddenWords[i]) ? 1 : 0), 0) / Math.max(totalHidden, 1);
    } else {
      score = typeValues.reduce((t, v, i) => t + (cleanWord(v) === cleanWord(hiddenWords[i]) ? 1 : 0), 0) / Math.max(totalHidden, 1);
    }
    setSubmitted(true);
    const response = hideMode === 'reveal' ? [...revealed] : hideMode === 'drag' ? dragValues : typeValues;
    onComplete?.({ submitted: true, correct: score === 1, score, response, correctAnswer: hiddenWords });
  };

  const canSubmit = () => {
    if (hideMode === 'reveal') return revealed.size > 0;
    if (hideMode === 'drag') return dragValues.every((v) => v);
    return typeValues.every((v) => v.trim());
  };

  if (hiddenIndices.length === 0) {
    return (
      <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
        <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
        {text && <div className="mb-4 whitespace-pre-wrap text-sm leading-7 text-zinc-700">{text}</div>}
        <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">No words are hidden in this text. Add focus words or increase the hide count.</div>
      </div>
    );
  }

  const slotMap = {};
  hiddenIndices.forEach((idx, slot) => { slotMap[idx] = slot; });

  return (
    <div className="task-shell relative border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.hint && !submitted && <div className="task-helper-text mb-3 text-xs text-zinc-500">{block.hint}</div>}

      {hideMode === 'reveal' && !submitted && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={gentleSpring} className="task-muted-panel mb-4 border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          {hiddenIndices.length} word{hiddenIndices.length !== 1 ? 's are' : ' is'} hidden. Click each hidden word to reveal it.
        </motion.div>
      )}

      <AnimatePresence>
        {hideMode === 'drag' && selectedItem && !submitted && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="mb-3 flex items-center gap-2 text-xs text-zinc-500"
          >
            <span className="inline-flex items-center gap-1.5 border border-zinc-300 bg-zinc-50 px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-900" />
              <strong className="text-zinc-900">{selectedItem.word}</strong> — tap a blank to place
            </span>
            <button type="button" onClick={() => setSelectedItem(null)} className="text-zinc-400 hover:text-zinc-700">✕</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* === Text passage with hidden slots === */}
      <div className="task-muted-panel mb-5 border border-zinc-200 bg-zinc-50 p-4 md:p-5 text-base leading-8 md:leading-9 text-zinc-800">
        {words.map((token, idx) => {
          if (/^\s+$/.test(token)) return <span key={idx}>{token}</span>;
          if (!hiddenSet.has(idx)) return <span key={idx} className="whitespace-pre-wrap">{token}</span>;

          const slotIdx = slotMap[idx];
          const original = hiddenWords[slotIdx];

          if (hideMode === 'reveal') {
            const isRevealed = revealed.has(slotIdx) || submitted;
            const correct = showVerdict && revealed.has(slotIdx);
            const missed = showVerdict && !revealed.has(slotIdx);
            return (
              <motion.button
                key={idx}
                type="button"
                animate={{
                  scale: correct ? [1, 1.1, 1] : 1,
                  backgroundColor: isRevealed && correct ? '#ecfdf5' : isRevealed && missed ? '#fffbeb' : isRevealed ? '#ffffff' : '#e4e4e7',
                  borderColor: isRevealed && correct ? '#6ee7b7' : isRevealed && missed ? '#fbbf24' : isRevealed ? '#d4d4d8' : '#d4d4d8',
                  color: isRevealed ? '#18181b' : '#e4e4e7',
                }}
                transition={springConfig}
                whileHover={!isRevealed && !submitted ? { scale: 1.05, backgroundColor: '#d4d4d8' } : undefined}
                whileTap={!isRevealed && !submitted ? { scale: 0.95 } : undefined}
                onClick={() => {
                  if (submitted) return;
                  setRevealed((prev) => {
                    const next = new Set(prev);
                    next.add(slotIdx);
                    const arr = [...next];
                    onProgress?.({ submitted: false, response: arr });
                    return next;
                  });
                }}
                className="mx-0.5 my-0.5 inline-flex min-h-8 min-w-16 items-center justify-center border px-2 py-1 text-sm font-medium"
                aria-label={isRevealed ? original : 'Hidden word — click to reveal'}
              >
                <AnimatePresence mode="wait">
                  {isRevealed ? (
                    <motion.span key="word" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                      {original}
                    </motion.span>
                  ) : (
                    <motion.span key="hidden" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      {'\u00A0'.repeat(Math.max(original.length, 3))}
                    </motion.span>
                  )}
                </AnimatePresence>
                {showVerdict && <VerdictIcon isCorrect={correct} isWrong={missed} className="ml-1 text-xs" />}
              </motion.button>
            );
          }

          if (hideMode === 'drag') {
            const value = dragValues[slotIdx];
            const isCorrect = showVerdict && cleanWord(value) === cleanWord(original);
            const isWrong = showVerdict && value && !isCorrect;
            const isHovered = hoveredSlot === slotIdx && !submitted;
            return (
              <AnimatedBlankSlot
                key={idx}
                value={value}
                ghostPreview={selectedItem?.word || draggedItem?.word || null}
                isHovered={isHovered}
                isCorrect={isCorrect}
                isWrong={isWrong}
                submitted={submitted}
                onDrop={(event) => {
                  event.preventDefault();
                  setHoveredSlot(null);
                  const data = readDropData(event, 'application/json');
                  if (data) { try { fillBlank(slotIdx, JSON.parse(data)); } catch { /* ignore */ } }
                }}
                onDragOver={(e) => { normalizeDragOver(e); setHoveredSlot(slotIdx); }}
                onDragLeave={() => setHoveredSlot(null)}
                onClick={() => {
                  if (selectedItem) { fillBlank(slotIdx, selectedItem); return; }
                  releaseBlank(slotIdx);
                }}
                className="min-h-10 min-w-20"
              />
            );
          }

          // type mode
          const typedValue = typeValues[slotIdx];
          const isCorrect = showVerdict && cleanWord(typedValue) === cleanWord(original);
          const isWrong = showVerdict && typedValue.trim() && !isCorrect;
          return (
            <motion.input
              key={idx}
              type="text"
              value={typedValue}
              onChange={(e) => {
                if (submitted) return;
                setTypeValues((prev) => {
                  const next = [...prev];
                  next[slotIdx] = e.target.value;
                  onProgress?.({ submitted: false, response: next });
                  return next;
                });
              }}
              disabled={submitted}
              animate={{
                borderColor: isCorrect ? '#10b981' : isWrong ? '#ef4444' : '#a1a1aa',
                x: isWrong ? [0, -3, 3, -2, 2, 0] : 0,
              }}
              transition={springConfig}
              whileFocus={{ borderColor: '#18181b' }}
              placeholder={'\u2022'.repeat(Math.max(original.length, 3))}
              className={[
                'mx-1 my-1 inline-block min-h-10 w-28 border-b-2 bg-transparent px-1 py-1 text-center text-sm font-medium outline-none transition-colors',
                isCorrect ? 'text-emerald-900' : '',
                isWrong ? 'text-red-900' : '',
                !submitted ? 'text-zinc-900' : '',
              ].join(' ')}
              aria-label={`Hidden word ${slotIdx + 1}`}
            />
          );
        })}
      </div>

      {/* Verdict details */}
      <AnimatePresence>
        {showVerdict && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={gentleSpring} className="mb-4 space-y-1">
            {hiddenWords.map((original, idx) => {
              const userValue = hideMode === 'reveal'
                ? (revealed.has(idx) ? original : '(not revealed)')
                : hideMode === 'drag' ? dragValues[idx] : typeValues[idx];
              const isCorrect = hideMode === 'reveal'
                ? revealed.has(idx)
                : cleanWord(userValue) === cleanWord(original);
              return !isCorrect ? (
                <motion.div key={idx} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ ...springConfig, delay: idx * 0.05 }} className="flex items-center gap-2 text-xs text-red-600">
                  <VerdictIcon isWrong />
                  <span>
                    Word {idx + 1}: expected <strong>{original}</strong>
                    {hideMode !== 'reveal' && <>, got <strong>{userValue || '(empty)'}</strong></>}
                  </span>
                </motion.div>
              ) : null;
            })}
            {block.explanation && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="task-helper-text mt-2 text-sm text-zinc-600"><Md text={block.explanation} /></motion.div>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Word bank (drag mode only) */}
      {hideMode === 'drag' && (
        <>
          <div className="task-helper-text mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
            <span>Word bank</span>
            <span>{preferTap ? 'Tap to place' : 'Drag or tap'}</span>
          </div>
          <div className="task-bank-panel mb-5 flex flex-wrap gap-2 border border-zinc-200 bg-white p-4">
            <AnimatePresence>
              {pool.length === 0 && !submitted && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="task-empty-state text-sm text-zinc-400">All words placed</motion.span>
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
        </>
      )}

      {/* Submit */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        type="button"
        onClick={submit}
        disabled={!canSubmit()}
        className="task-primary-button border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40"
      >
        {showCheckButton ? 'Check' : 'Save answer'}
      </motion.button>
    </div>
  );
}
