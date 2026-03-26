import { useEffect, useMemo, useState } from 'react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';
import { BLANK_MARKER_RE } from '../../utils/patterns';
import { useShuffleSeed } from '../../hooks/useShuffleSeed';

export default function DragToBlankTask({ block, onComplete, existingResult }) {
  const sentence = block.text || block.sentence || '';
  const tokens = sentence.split(BLANK_MARKER_RE);
  const answers = block.blanks || [];
  const blankCount = tokens.filter((t) => BLANK_MARKER_RE.test(t)).length;
  const shuffleSeed = useShuffleSeed();
  const [values, setValues] = useState(Array(Math.max(blankCount, 1)).fill(''));

  // Build pool as indexed items so duplicates are tracked independently
  const indexedPool = useMemo(() => {
    const source = block.options?.length ? [...answers, ...block.options.filter((o) => !answers.includes(o))] : [...answers];
    const indexed = source.map((word, i) => ({ id: i, word }));
    return block.shuffle === false ? indexed : stableShuffle(indexed, `${block.id || block.question}-${shuffleSeed}-drag-pool`);
  }, [answers, block.id, block.options, block.question, block.shuffle, shuffleSeed]);

  const [pool, setPool] = useState(indexedPool);
  const [placedIds, setPlacedIds] = useState(Array(Math.max(blankCount, 1)).fill(null));
  const [draggedItem, setDraggedItem] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [preferTapPlacement, setPreferTapPlacement] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setPreferTapPlacement(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  const selectedItem = useMemo(() => pool.find((item) => item.id === selectedItemId) || null, [pool, selectedItemId]);

  const fillBlank = (blankIdx, item) => {
    if (!item || submitted) return;
    setValues((current) => {
      const next = [...current];
      // If blank already has a word, return that pool item
      if (next[blankIdx]) {
        const oldId = placedIds[blankIdx];
        if (oldId !== null) {
          const oldWord = next[blankIdx];
          setPool((p) => [...p, { id: oldId, word: oldWord }]);
        }
      }
      next[blankIdx] = item.word;
      return next;
    });
    setPlacedIds((current) => {
      const next = [...current];
      next[blankIdx] = item.id;
      return next;
    });
    setPool((p) => p.filter((entry) => entry.id !== item.id));
    setDraggedItem(null);
    setSelectedItemId(null);
  };

  const releaseBlank = (blankIdx) => {
    if (submitted || !values[blankIdx]) return;
    const releasedId = placedIds[blankIdx];
    const releasedWord = values[blankIdx];
    setPool((p) => [...p, { id: releasedId, word: releasedWord }]);
    setValues((current) => current.map((v, i) => i === blankIdx ? '' : v));
    setPlacedIds((current) => current.map((v, i) => i === blankIdx ? null : v));
  };

  const handlePoolItemPress = (item) => {
    if (submitted) return;
    if (preferTapPlacement) {
      setSelectedItemId((current) => current === item.id ? null : item.id);
      return;
    }
    const firstEmpty = values.findIndex((value) => !value);
    if (firstEmpty >= 0) {
      fillBlank(firstEmpty, item);
      return;
    }
    setSelectedItemId((current) => current === item.id ? null : item.id);
  };

  const submit = () => {
    const score = values.reduce((total, value, index) => total + (value.trim().toLowerCase() === (answers[index] || '').trim().toLowerCase() ? 1 : 0), 0) / Math.max(answers.length, 1);
    setSubmitted(true);
    onComplete?.({ submitted: true, correct: score === 1, score, response: values, correctAnswer: answers });
  };

  // If no blanks in sentence text, show a fallback message
  if (blankCount === 0) {
    return (
      <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
        <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
        {sentence && <div className="mb-4 whitespace-pre-wrap text-sm leading-7 text-zinc-700">{sentence}</div>}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">This task has no blanks to fill. The text should contain ___ or {'{ }'} markers.</div>
      </div>
    );
  }

  const blankIndices = tokens.reduce((acc, token, i) => {
    if (/(\{\}|_{3,}|\[blank\]|\[\d+\])/i.test(token)) acc[i] = Object.keys(acc).length;
    return acc;
  }, {});
  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.hint && !submitted && <div className="mb-3 text-xs text-zinc-500">{block.hint}</div>}
      {preferTapPlacement && !submitted && (
        <div className="mb-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
          Tap a word in the bank, then tap a blank to place it. Tap a filled blank to remove its word.
        </div>
      )}
      {selectedItem && !submitted && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm text-white">
          <span>Selected word: <strong>{selectedItem.word}</strong></span>
          <button type="button" onClick={() => setSelectedItemId(null)} className="rounded-xl border border-white/30 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-white transition hover:bg-white/10">Clear</button>
        </div>
      )}
      <div className="mb-5 border border-zinc-200 bg-zinc-50 p-4 md:p-5 text-base leading-8 md:leading-9 text-zinc-800">
        {tokens.map((token, index) => {
          if (!/(\{\}|_{3,}|\[blank\]|\[\d+\])/i.test(token)) {
            return <span key={index} className="whitespace-pre-wrap">{token}</span>;
          }
          const currentBlank = blankIndices[index];
          const value = values[currentBlank];
          const correct = submitted && value.trim().toLowerCase() === (answers[currentBlank] || '').trim().toLowerCase();
          const wrong = submitted && value && !correct;
          return (
            <button
              key={index}
              type="button"
              onDrop={(event) => {
                event.preventDefault();
                const data = event.dataTransfer.getData('application/json');
                if (data) {
                  try {
                    fillBlank(currentBlank, JSON.parse(data));
                  } catch {
                    /* ignore */
                  }
                }
              }}
              onDragOver={(event) => event.preventDefault()}
              onClick={() => {
                if (selectedItem) {
                  fillBlank(currentBlank, selectedItem);
                  return;
                }
                releaseBlank(currentBlank);
              }}
              className={[
                'mx-1 my-1 inline-flex min-h-12 min-w-28 items-center justify-center border border-dashed px-3 py-2 text-sm font-medium transition-all duration-200 md:min-h-14 md:min-w-32',
                correct ? 'border-emerald-400 bg-emerald-50 text-emerald-900 scale-105' : '',
                wrong ? 'border-red-400 bg-red-50 text-red-900' : '',
                !submitted && value ? 'border-zinc-900 bg-white text-zinc-900 shadow-[0_10px_30px_rgba(0,0,0,0.06)] animate-[pop_0.2s_ease-out]' : '',
                !submitted && !value ? 'border-zinc-300 bg-zinc-50 text-zinc-400' : '',
                !submitted && selectedItem && !value ? 'border-zinc-900 bg-white text-zinc-900' : '',
              ].join(' ')}
            >
              {value || 'Drop here'}
            </button>
          );
        })}
      </div>
      {submitted && (
        <div className="mb-4 space-y-1">
          {values.map((value, idx) => {
            const isCorrect = value.trim().toLowerCase() === (answers[idx] || '').trim().toLowerCase();
            return !isCorrect ? (
              <div key={idx} className="text-xs text-red-600">Blank {idx + 1}: expected <strong>{answers[idx]}</strong>, got <strong>{value || '(empty)'}</strong></div>
            ) : null;
          })}
          {block.explanation && <div className="mt-2 text-sm text-zinc-600"><Md text={block.explanation} /></div>}
        </div>
      )}
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
              event.dataTransfer.setData('application/json', JSON.stringify(item));
            }}
            onDragEnd={() => setDraggedItem(null)}
            onClick={() => handlePoolItemPress(item)}
            className={[
              'min-h-11 border px-4 py-2 text-sm font-medium transition-all duration-200 md:min-h-12',
              selectedItemId === item.id || draggedItem?.id === item.id ? 'border-zinc-900 bg-zinc-900 text-white scale-105' : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:-translate-y-0.5 hover:border-zinc-900 hover:bg-white',
            ].join(' ')}
          >
            {item.word}
          </button>
        ))}
      </div>
      <button type="button" onClick={submit} disabled={values.some((v) => !v)} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">
        Check
      </button>
    </div>
  );
}
