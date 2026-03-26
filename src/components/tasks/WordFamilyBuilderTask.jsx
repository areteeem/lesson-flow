import { useMemo, useState } from 'react';
import { Md } from '../FormattedText';

const POS_LABELS = {
  noun: { label: 'Noun', color: 'border-blue-300 bg-blue-50 text-blue-900' },
  verb: { label: 'Verb', color: 'border-emerald-300 bg-emerald-50 text-emerald-900' },
  adjective: { label: 'Adjective', color: 'border-amber-300 bg-amber-50 text-amber-900' },
  adverb: { label: 'Adverb', color: 'border-violet-300 bg-violet-50 text-violet-900' },
  other: { label: 'Other', color: 'border-zinc-300 bg-zinc-50 text-zinc-700' },
};

const DEFAULT_FIELDS = ['noun', 'verb', 'adjective', 'adverb'];

function highlightAffixes(word, root) {
  if (!root || !word) return word;
  const lower = word.toLowerCase();
  const rootLower = root.toLowerCase();
  const idx = lower.indexOf(rootLower);
  if (idx === -1) return word;
  const prefix = word.slice(0, idx);
  const rootPart = word.slice(idx, idx + root.length);
  const suffix = word.slice(idx + root.length);
  return (
    <span>
      {prefix && <span className="font-medium text-violet-600">{prefix}</span>}
      <span className="underline decoration-zinc-400 decoration-2 underline-offset-2">{rootPart}</span>
      {suffix && <span className="font-medium text-emerald-600">{suffix}</span>}
    </span>
  );
}

export default function WordFamilyBuilderTask({ block, onComplete }) {
  const rootWord = block.question || block.instruction || 'word';
  const fields = useMemo(() => block.categories || DEFAULT_FIELDS, [block.categories]);
  const expectedAnswers = useMemo(() => {
    // answers stored as items array in order per field, or as pairs
    if (block.pairs?.length) {
      return Object.fromEntries(block.pairs.map((p) => [p.left?.toLowerCase(), p.right]));
    }
    if (block.items?.length) {
      return Object.fromEntries(fields.map((f, i) => [f, block.items[i] || '']));
    }
    return {};
  }, [block.items, block.pairs, fields]);

  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f, ''])));
  const [submitted, setSubmitted] = useState(false);
  const [unlockedCount, setUnlockedCount] = useState(fields.length <= 4 ? fields.length : 2);

  const update = (field, val) => {
    setValues((prev) => ({ ...prev, [field]: val }));
    setSubmitted(false);
  };

  const submit = () => {
    setSubmitted(true);
    let correct = 0;
    let total = 0;
    fields.slice(0, unlockedCount).forEach((f) => {
      const expected = (expectedAnswers[f] || '').trim().toLowerCase();
      const given = (values[f] || '').trim().toLowerCase();
      if (expected) {
        total++;
        if (given === expected) correct++;
      }
    });
    // Unlock more fields progressively
    if (correct > 0 && unlockedCount < fields.length) {
      setUnlockedCount((prev) => Math.min(fields.length, prev + 1));
    }
    onComplete?.({
      submitted: true,
      correct: correct === total && total > 0,
      score: total > 0 ? correct / total : 1,
      response: values,
      feedback: block.explanation || (correct === total ? 'All forms correct!' : `${correct}/${total} correct.`),
    });
  };

  // Extract root for affix highlighting
  const root = (rootWord.match(/\b\w{3,}\b/) || [''])[0];

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950">
        <Md text={block.title || 'Word Family Builder'} />
      </div>
      {block.hint && <div className="mb-4 text-sm text-zinc-500"><Md text={block.hint} /></div>}

      {/* Root word center */}
      <div className="mb-6 flex justify-center">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center border-2 border-zinc-900 bg-zinc-900 text-lg font-bold text-white">
            {root || rootWord}
          </div>
          {/* Radial lines to fields */}
          <div className="absolute -inset-4">
            {fields.slice(0, unlockedCount).map((_, i) => {
              const angle = (360 / Math.max(unlockedCount, 1)) * i - 90;
              return (
                <div
                  key={i}
                  className="absolute left-1/2 top-1/2 h-px w-12 origin-left bg-zinc-300"
                  style={{ transform: `rotate(${angle}deg)` }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field, i) => {
          const locked = i >= unlockedCount;
          const pos = POS_LABELS[field] || POS_LABELS.other;
          const expected = (expectedAnswers[field] || '').trim();
          const given = (values[field] || '').trim();
          const correct = submitted && expected && given.toLowerCase() === expected.toLowerCase();
          const wrong = submitted && expected && given.toLowerCase() !== expected.toLowerCase();

          return (
            <div
              key={field}
              className={[
                'border p-4 transition',
                locked ? 'border-dashed border-zinc-200 bg-zinc-50 opacity-50' : '',
                correct ? 'border-emerald-400 bg-emerald-50' : '',
                wrong ? 'border-red-300 bg-red-50' : '',
                !locked && !submitted ? `${pos.color} border` : '',
              ].join(' ')}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className={`inline-block border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${pos.color}`}>
                  {pos.label}
                </span>
                {correct && <span className="text-sm text-emerald-600">✓</span>}
                {wrong && <span className="text-[10px] text-red-500">Expected: {highlightAffixes(expected, root)}</span>}
              </div>
              {locked ? (
                <div className="flex h-9 items-center text-xs text-zinc-400">🔒 Unlock by answering correctly</div>
              ) : (
                <input
                  value={values[field]}
                  onChange={(e) => update(field, e.target.value)}
                  placeholder={`Enter ${pos.label.toLowerCase()} form…`}
                  className="w-full border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-900"
                  disabled={locked}
                />
              )}
              {!locked && given && !submitted && (
                <div className="mt-1 text-xs text-zinc-500">
                  {highlightAffixes(given, root)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-xs text-zinc-500">
          {unlockedCount < fields.length ? `${unlockedCount}/${fields.length} forms unlocked` : `${fields.length} forms`}
        </div>
        <button
          type="button"
          onClick={submit}
          className="border border-zinc-900 bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Check
        </button>
      </div>
    </div>
  );
}
