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

export default function WordFamilyBuilderTask({ block, onComplete, existingResult }) {
  const rootWord = block.question || block.instruction || 'word';
  const fields = useMemo(() => {
    const raw = block.categories;
    return Array.isArray(raw) && raw.length > 0 ? raw : DEFAULT_FIELDS;
  }, [block.categories]);
  const answers = useMemo(() => {
    if (block.pairs?.length) {
      return Object.fromEntries(
        block.pairs
          .filter((p) => p.left != null)
          .map((p) => [String(p.left).toLowerCase(), p.right])
      );
    }
    if (block.items?.length) {
      return Object.fromEntries(fields.map((f, i) => [f, block.items[i] || '']));
    }
    return {};
  }, [block.items, block.pairs, fields]);

  const [revealed, setRevealed] = useState(() => {
    if (existingResult?.response) {
      return Object.fromEntries(fields.map((f) => [f, true]));
    }
    return {};
  });
  const [done, setDone] = useState(!!existingResult?.submitted);

  const root = (rootWord.match(/\b\w{3,}\b/) || [''])[0];
  const allRevealed = fields.every((f) => revealed[f]);

  const reveal = (field) => {
    const next = { ...revealed, [field]: true };
    setRevealed(next);
    if (fields.every((f) => next[f]) && !done) {
      setDone(true);
      onComplete?.({ submitted: true, correct: true, score: 1, response: answers, feedback: 'All word forms reviewed.' });
    }
  };

  const revealAll = () => {
    const next = Object.fromEntries(fields.map((f) => [f, true]));
    setRevealed(next);
    if (!done) {
      setDone(true);
      onComplete?.({ submitted: true, correct: true, score: 1, response: answers, feedback: 'All word forms reviewed.' });
    }
  };

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950">
        <Md text={block.title || 'Word Family'} />
      </div>
      {block.hint && <div className="mb-4 text-sm text-zinc-500"><Md text={block.hint} /></div>}

      {/* Root word center */}
      <div className="mb-6 flex justify-center">
        <div className="relative">
          <div className="flex h-20 w-20 items-center justify-center border-2 border-zinc-900 bg-zinc-900 text-lg font-bold text-white">
            {root || rootWord}
          </div>
          <div className="absolute -inset-4">
            {fields.map((_, i) => {
              const angle = (360 / Math.max(fields.length, 1)) * i - 90;
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

      {/* Word form cards — tap to reveal */}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => {
          const pos = POS_LABELS[field] || POS_LABELS.other;
          const answer = (answers[field] || '').trim();
          const isRevealed = revealed[field];

          return (
            <button
              key={field}
              type="button"
              onClick={() => !isRevealed && reveal(field)}
              className={[
                'border p-4 text-left transition',
                isRevealed ? `${pos.color} border` : 'border-dashed border-zinc-300 bg-zinc-50 hover:border-zinc-400 cursor-pointer',
              ].join(' ')}
            >
              <div className="mb-2 flex items-center gap-2">
                <span className={`inline-block border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${pos.color}`}>
                  {pos.label}
                </span>
              </div>
              {isRevealed ? (
                <div className="text-base font-semibold text-zinc-900">
                  {answer ? highlightAffixes(answer, root) : <span className="text-zinc-400 italic">—</span>}
                </div>
              ) : (
                <div className="flex h-7 items-center text-xs text-zinc-400">Tap to reveal</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Reveal all shortcut */}
      {!allRevealed && (
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={revealAll} className="border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-600 transition hover:border-zinc-900">
            Reveal All
          </button>
        </div>
      )}
    </div>
  );
}
