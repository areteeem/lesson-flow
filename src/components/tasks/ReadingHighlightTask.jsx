import { useState } from 'react';
import { Md } from '../FormattedText';

function cleanWord(word) {
  return word.replace(/[^a-zA-Z0-9'-]/g, '').toLowerCase();
}

export default function ReadingHighlightTask({ block, onComplete, existingResult }) {
  const targets = (block.targets || []).map((item) => item.toLowerCase());
  const words = (block.text || '').split(/(\s+)/);
  const [selected, setSelected] = useState(new Set());
  const [submitted, setSubmitted] = useState(false);

  const toggle = (word) => {
    if (submitted) return;
    const key = cleanWord(word);
    if (!key) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const submit = () => {
    const values = [...selected];
    const correctMatches = targets.filter((target) => values.includes(target)).length;
    const score = correctMatches / Math.max(targets.length, 1);
    const exact = score === 1 && values.every((value) => targets.includes(value));
    setSubmitted(true);
    onComplete?.({ submitted: true, correct: exact, score, response: values, correctAnswer: targets });
  };

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction || 'Highlight the correct words'} /></div>
      <div className="mb-5 text-sm text-zinc-500">Tap the words you want to mark.</div>
      <div className="flex flex-wrap gap-y-1 text-base leading-8 text-zinc-800">
        {words.map((word, index) => {
          if (/^\s+$/.test(word)) return <span key={index}>&nbsp;</span>;
          const key = cleanWord(word);
          const isSelected = selected.has(key);
          const isTarget = targets.includes(key);
          return (
            <button
              key={`${word}-${index}`}
              type="button"
              onClick={() => toggle(word)}
              className={[
                'rounded-lg px-1.5 py-0.5 transition',
                submitted && isTarget && isSelected ? 'bg-emerald-100 text-emerald-900' : '',
                submitted && !isTarget && isSelected ? 'bg-red-100 text-red-900' : '',
                submitted && isTarget && !isSelected ? 'bg-amber-100 text-amber-900' : '',
                !submitted && isSelected ? 'bg-blue-100 text-blue-900' : 'hover:bg-zinc-100',
              ].join(' ')}
            >
              {word}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={submit} className="mt-5 rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">Check</button>
    </div>
  );
}
