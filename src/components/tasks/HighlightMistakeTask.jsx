import { useState } from 'react';
import { Md } from '../FormattedText';

export default function HighlightMistakeTask({ block, onComplete, showCheckButton = true }) {
  const text = block.text || '';
  const words = text.split(/(\s+)/);
  const correctAnswer = (block.answer || '').trim().toLowerCase();
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const showVerdict = submitted && showCheckButton;

  const toggle = (word, index) => {
    if (submitted) return;
    const key = `${index}-${word}`;
    setSelected((current) => (current === key ? null : key));
  };

  const submit = () => {
    if (!selected) return;
    const [, ...rest] = selected.split('-');
    const word = rest.join('-').replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase();
    const isCorrect = word === correctAnswer;
    setSubmitted(true);
    onComplete?.({
      submitted: true,
      correct: isCorrect,
      score: isCorrect ? 1 : 0,
      response: word,
      correctAnswer: block.answer,
    });
  };

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950">
        <Md text={block.question || block.instruction || 'Highlight the mistake'} />
      </div>
      <div className="mb-5 text-sm text-zinc-500">Tap the word that is incorrect.</div>
      {block.hint && !submitted && <div className="mb-3 text-xs text-zinc-500">{block.hint}</div>}
      <div className="flex flex-wrap gap-y-1 text-lg leading-10 text-zinc-800">
        {words.map((word, index) => {
          if (/^\s+$/.test(word)) return <span key={index}>&nbsp;</span>;
          const key = `${index}-${word}`;
          const isSelected = selected === key;
          const clean = word.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase();
          const isAnswer = showVerdict && clean === correctAnswer;
          const isWrong = showVerdict && isSelected && clean !== correctAnswer;
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(word, index)}
              className={[
                'rounded-lg px-2 py-1 transition cursor-pointer',
                isAnswer ? 'bg-emerald-100 text-emerald-900 ring-2 ring-emerald-400' : '',
                isWrong ? 'bg-red-100 text-red-900 ring-2 ring-red-400' : '',
                !submitted && isSelected ? 'bg-red-100 text-red-900 ring-2 ring-red-300' : '',
                !submitted && !isSelected ? 'hover:bg-zinc-100' : '',
              ].join(' ')}
            >
              {word}
            </button>
          );
        })}
      </div>
      {!submitted && (
        <button type="button" onClick={submit} disabled={!selected} className="mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">
          {showCheckButton ? 'Check' : 'Save answer'}
        </button>
      )}
      {showVerdict && (
        <div className={[
          'mt-4 border px-4 py-3 text-sm',
          selected && words[Number(selected.split('-')[0])]?.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase() === correctAnswer
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : 'border-red-300 bg-red-50 text-red-800',
        ].join(' ')}>
          The mistake is: <strong>{block.answer}</strong>
        </div>
      )}
      {submitted && !showCheckButton && <div className="mt-4 border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Answer saved ✓</div>}
      {submitted && block.explanation && (
        <div className="mt-3 bg-blue-50 p-4 text-sm text-blue-900"><Md text={block.explanation} /></div>
      )}
    </div>
  );
}


