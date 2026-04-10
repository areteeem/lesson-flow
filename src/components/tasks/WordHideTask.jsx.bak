import { useEffect, useMemo, useState } from 'react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';
import { useShuffleSeed } from '../../hooks/useShuffleSeed';
import { configureDragStart, normalizeDragOver, readDropData } from '../../utils/dragDropSupport';

const WORD_RE = /(\s+)/;
const PUNCTUATION_RE = /^[.,!?;:'"()[\]{}—–-]+$/;

function cleanWord(w) {
  return w.replace(/[.,!?;:'"()[\]{}—–-]/g, '').toLowerCase();
}

/** Select which words to hide: focus words + random extras based on difficulty. */
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

  // Determine mode from taskType or explicit hideMode
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
    const source = stableShuffle(
      hiddenWords.map((w, i) => ({ id: i, word: w })),
      `${block.id || block.question}-${shuffleSeed}-pool`,
    );
    return source;
  }, [hiddenWords, block.id, block.question, shuffleSeed]);

  const [pool, setPool] = useState(indexedPool);
  const [dragValues, setDragValues] = useState(() => Array(hiddenIndices.length).fill(''));
  const [placedIds, setPlacedIds] = useState(() => Array(hiddenIndices.length).fill(null));
  const [draggedItem, setDraggedItem] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [preferTapPlacement, setPreferTapPlacement] = useState(false);

  // === Type mode state ===
  const [typeValues, setTypeValues] = useState(() => Array(hiddenIndices.length).fill(''));

  const [submitted, setSubmitted] = useState(false);
  const showVerdict = submitted && showCheckButton;

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setPreferTapPlacement(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  const selectedItem = useMemo(() => pool.find((item) => item.id === selectedItemId) || null, [pool, selectedItemId]);

  // === Drag helpers ===
  const fillBlank = (slotIdx, item) => {
    if (!item || submitted) return;
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
    setDraggedItem(null);
    setSelectedItemId(null);
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
    if (preferTapPlacement) {
      setSelectedItemId((current) => (current === item.id ? null : item.id));
      return;
    }
    const firstEmpty = dragValues.findIndex((v) => !v);
    if (firstEmpty >= 0) {
      fillBlank(firstEmpty, item);
      return;
    }
    setSelectedItemId((current) => (current === item.id ? null : item.id));
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

  // No hidden words — fallback
  if (hiddenIndices.length === 0) {
    return (
      <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
        <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
        {text && <div className="mb-4 whitespace-pre-wrap text-sm leading-7 text-zinc-700">{text}</div>}
        <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">No words are hidden in this text. Add focus words or increase the hide count.</div>
      </div>
    );
  }

  // Map hidden index position for slot lookup
  const slotMap = {};
  hiddenIndices.forEach((idx, slot) => { slotMap[idx] = slot; });

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.hint && !submitted && <div className="mb-3 text-xs text-zinc-500">{block.hint}</div>}

      {/* Tap mode instructions */}
      {hideMode === 'drag' && preferTapPlacement && !submitted && (
        <div className="mb-4 border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Tap a word in the bank, then tap a blank to place it. Tap a filled blank to remove its word.
        </div>
      )}
      {hideMode === 'reveal' && !submitted && (
        <div className="mb-4 border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          {hiddenIndices.length} word{hiddenIndices.length !== 1 ? 's are' : ' is'} hidden. Click each hidden word to reveal it.
        </div>
      )}

      {/* Selected word banner (drag mode) */}
      {hideMode === 'drag' && selectedItem && !submitted && (
        <div className="mb-4 flex items-center justify-between gap-3 border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm text-white">
          <span>Selected word: <strong>{selectedItem.word}</strong></span>
          <button type="button" onClick={() => setSelectedItemId(null)} className="border border-white/30 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition hover:bg-white/10">Clear</button>
        </div>
      )}

      {/* === Text passage with hidden slots === */}
      <div className="mb-5 border border-zinc-200 bg-zinc-50 p-4 md:p-5 text-base leading-8 md:leading-9 text-zinc-800">
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
              <button
                key={idx}
                type="button"
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
                className={[
                  'mx-0.5 my-0.5 inline-flex min-h-8 min-w-16 items-center justify-center border px-2 py-1 text-sm font-medium transition-all duration-200',
                  isRevealed && correct ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : '',
                  isRevealed && missed ? 'border-amber-400 bg-amber-50 text-amber-900' : '',
                  isRevealed && !submitted ? 'border-zinc-300 bg-white text-zinc-900' : '',
                  !isRevealed ? 'border-zinc-300 bg-zinc-200 text-zinc-200 hover:bg-zinc-300 cursor-pointer' : '',
                ].join(' ')}
                aria-label={isRevealed ? original : 'Hidden word — click to reveal'}
              >
                {isRevealed ? original : '\u00A0'.repeat(Math.max(original.length, 3))}
              </button>
            );
          }

          if (hideMode === 'drag') {
            const value = dragValues[slotIdx];
            const isCorrect = showVerdict && cleanWord(value) === cleanWord(original);
            const isWrong = showVerdict && value && !isCorrect;
            return (
              <button
                key={idx}
                type="button"
                onDrop={(event) => {
                  event.preventDefault();
                  const data = readDropData(event, 'application/json');
                  if (data) {
                    try { fillBlank(slotIdx, JSON.parse(data)); } catch { /* ignore */ }
                  }
                }}
                onDragOver={normalizeDragOver}
                onClick={() => {
                  if (selectedItem) { fillBlank(slotIdx, selectedItem); return; }
                  releaseBlank(slotIdx);
                }}
                className={[
                  'mx-1 my-1 inline-flex min-h-10 min-w-20 items-center justify-center border border-dashed px-3 py-1.5 text-sm font-medium transition-all duration-200',
                  isCorrect ? 'border-emerald-400 bg-emerald-50 text-emerald-900 scale-105' : '',
                  isWrong ? 'border-red-400 bg-red-50 text-red-900' : '',
                  !submitted && value ? 'border-zinc-900 bg-white text-zinc-900 shadow-[0_10px_30px_rgba(0,0,0,0.06)]' : '',
                  !submitted && !value ? 'border-zinc-300 bg-zinc-50 text-zinc-400' : '',
                  !submitted && selectedItem && !value ? 'border-zinc-900 bg-white text-zinc-900' : '',
                ].join(' ')}
              >
                {value || 'Drop here'}
              </button>
            );
          }

          // type mode
          const typedValue = typeValues[slotIdx];
          const isCorrect = showVerdict && cleanWord(typedValue) === cleanWord(original);
          const isWrong = showVerdict && typedValue.trim() && !isCorrect;
          return (
            <input
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
              placeholder={'\u2022'.repeat(Math.max(original.length, 3))}
              className={[
                'mx-1 my-1 inline-block min-h-10 w-28 border-b-2 bg-transparent px-1 py-1 text-center text-sm font-medium outline-none transition-all duration-200',
                isCorrect ? 'border-emerald-500 text-emerald-900' : '',
                isWrong ? 'border-red-500 text-red-900' : '',
                !submitted ? 'border-zinc-400 text-zinc-900 focus:border-zinc-900' : '',
              ].join(' ')}
              aria-label={`Hidden word ${slotIdx + 1}`}
            />
          );
        })}
      </div>

      {/* Verdict details */}
      {showVerdict && (
        <div className="mb-4 space-y-1">
          {hiddenWords.map((original, idx) => {
            const userValue = hideMode === 'reveal'
              ? (revealed.has(idx) ? original : '(not revealed)')
              : hideMode === 'drag' ? dragValues[idx] : typeValues[idx];
            const isCorrect = hideMode === 'reveal'
              ? revealed.has(idx)
              : cleanWord(userValue) === cleanWord(original);
            return !isCorrect ? (
              <div key={idx} className="text-xs text-red-600">
                Word {idx + 1}: expected <strong>{original}</strong>
                {hideMode !== 'reveal' && <>, got <strong>{userValue || '(empty)'}</strong></>}
              </div>
            ) : null;
          })}
          {block.explanation && <div className="mt-2 text-sm text-zinc-600"><Md text={block.explanation} /></div>}
        </div>
      )}

      {/* Word bank (drag mode only) */}
      {hideMode === 'drag' && (
        <>
          <div className="mb-2 flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-zinc-500">
            <span>Word bank</span>
            <span>{preferTapPlacement ? 'Tap to place' : 'Drag or tap'}</span>
          </div>
          <div className="mb-5 flex flex-wrap gap-2 border border-zinc-200 bg-white p-4">
            {pool.length === 0 && !submitted && <span className="text-sm text-zinc-400">All words placed</span>}
            {pool.map((item) => (
              <button
                key={item.id}
                type="button"
                draggable
                onDragStart={(event) => {
                  setDraggedItem(item);
                  setSelectedItemId(item.id);
                  configureDragStart(event, JSON.stringify(item), 'application/json');
                }}
                onDragEnd={() => setDraggedItem(null)}
                onClick={() => handlePoolItemPress(item)}
                className={[
                  'min-h-11 border px-4 py-2 text-sm font-medium transition-all duration-200 md:min-h-12',
                  selectedItemId === item.id || draggedItem?.id === item.id
                    ? 'border-zinc-900 bg-zinc-900 text-white scale-105'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:-translate-y-0.5 hover:border-zinc-900 hover:bg-white',
                ].join(' ')}
              >
                {item.word}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit()}
        className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40"
      >
        {showCheckButton ? 'Check' : 'Save answer'}
      </button>
    </div>
  );
}
