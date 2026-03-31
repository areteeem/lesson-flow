import { useState } from 'react';
import { Md } from '../FormattedText';

export default function SelectAndCorrectTask({ block, onComplete, showCheckButton = true }) {
  const text = block.text || '';
  const words = text.split(/(\s+)/);
  const correctAnswer = (block.answer || '').trim();
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [correction, setCorrection] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const showVerdict = submitted && showCheckButton;

  const selectWord = (index) => {
    if (submitted) return;
    setSelectedIndex((current) => (current === index ? null : index));
    setCorrection('');
  };

  const submit = () => {
    if (selectedIndex === null || !correction.trim()) return;
    const isCorrect = correction.trim().toLowerCase() === correctAnswer.toLowerCase();
    setSubmitted(true);
    onComplete?.({
      submitted: true,
      correct: isCorrect,
      score: isCorrect ? 1 : 0,
      response: { selectedWord: words[selectedIndex], correction: correction.trim() },
      correctAnswer,
    });
  };

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950">
        <Md text={block.question || block.instruction || 'Select the incorrect word and correct it'} />
      </div>
      <div className="mb-5 text-sm text-zinc-500">Tap the incorrect word, then type the correction below.</div>
      {block.hint && !submitted && <div className="mb-3 text-xs text-zinc-500">{block.hint}</div>}
      <div className="mb-5 flex flex-wrap gap-y-1 text-lg leading-10 text-zinc-800">
        {words.map((word, index) => {
          if (/^\s+$/.test(word)) return <span key={index}>&nbsp;</span>;
          const isSelected = selectedIndex === index;
          return (
            <button
              key={`${word}-${index}`}
              type="button"
              onClick={() => selectWord(index)}
              className={[
                'rounded-lg px-2 py-1 transition cursor-pointer',
                showVerdict && isSelected ? (correction.trim().toLowerCase() === correctAnswer.toLowerCase() ? 'bg-emerald-100 text-emerald-900 ring-2 ring-emerald-400 line-through' : 'bg-red-100 text-red-900 ring-2 ring-red-400 line-through') : '',
                !submitted && isSelected ? 'bg-amber-100 text-amber-900 ring-2 ring-amber-400' : '',
                !submitted && !isSelected ? 'hover:bg-zinc-100' : '',
              ].join(' ')}
            >
              {word}
            </button>
          );
        })}
      </div>
      {selectedIndex !== null && !submitted && (
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
            Replace "{words[selectedIndex]}" with:
          </label>
          <input
            type="text"
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Type the correct word…"
            className="w-full max-w-xs border border-zinc-200 px-3 py-2 text-base outline-none focus:border-zinc-900"
            autoFocus
          />
        </div>
      )}
      {!submitted && (
        <button type="button" onClick={submit} disabled={selectedIndex === null || !correction.trim()} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">
          {showCheckButton ? 'Check' : 'Save answer'}
        </button>
      )}
      {showVerdict && (
        <div className={[
          'mt-4 border px-4 py-3 text-sm',
          correction.trim().toLowerCase() === correctAnswer.toLowerCase()
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : 'border-red-300 bg-red-50 text-red-800',
        ].join(' ')}>
          Correct answer: <strong>{correctAnswer}</strong>
        </div>
      )}
      {submitted && !showCheckButton && <div className="mt-4 border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Answer saved ✓</div>}
      {submitted && block.explanation && (
        <div className="mt-3 bg-blue-50 p-4 text-sm text-blue-900"><Md text={block.explanation} /></div>
      )}
    </div>
  );
}


