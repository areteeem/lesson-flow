import { useState, useMemo } from 'react';
import { Md } from '../FormattedText';

export default function HighlightMistakeTask({ block, onComplete, showCheckButton = true }) {
  const text = block.text || '';
  const words = text.split(/(\s+)/);
  const isMulti = block.multiSelect === true || Number(block.mistakeCount || 0) > 1;

  const correctAnswers = useMemo(() => {
    if (isMulti && Array.isArray(block.answers)) {
      return block.answers.map((a) => String(a).trim().toLowerCase());
    }
    if (isMulti && typeof block.answer === 'string' && block.answer.includes(',')) {
      return block.answer.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean);
    }
    return [(block.answer || '').trim().toLowerCase()];
  }, [block.answer, block.answers, isMulti]);

  const [selected, setSelected] = useState(() => isMulti ? new Set() : null);
  const [submitted, setSubmitted] = useState(false);
  const showVerdict = submitted && showCheckButton;

  const toggle = (word, index) => {
    if (submitted) return;
    const key = `${index}-${word}`;
    if (isMulti) {
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    } else {
      setSelected((current) => (current === key ? null : key));
    }
  };

  const extractWord = (key) => {
    const [, ...rest] = key.split('-');
    return rest.join('-').replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase();
  };

  const submit = () => {
    if (isMulti) {
      if (selected.size === 0) return;
      const selectedWords = [...selected].map(extractWord);
      const correctCount = selectedWords.filter((w) => correctAnswers.includes(w)).length;
      const wrongCount = selectedWords.length - correctCount;
      const score = Math.max(0, (correctCount - wrongCount) / Math.max(correctAnswers.length, 1));
      setSubmitted(true);
      onComplete?.({
        submitted: true,
        correct: score === 1,
        score,
        response: selectedWords,
        correctAnswer: block.answers || block.answer,
      });
    } else {
      if (!selected) return;
      const word = extractWord(selected);
      const isCorrect = correctAnswers.includes(word);
      setSubmitted(true);
      onComplete?.({
        submitted: true,
        correct: isCorrect,
        score: isCorrect ? 1 : 0,
        response: word,
        correctAnswer: block.answer,
      });
    }
  };

  const isItemSelected = (key) => isMulti ? selected.has(key) : selected === key;
  const hasSelection = isMulti ? selected.size > 0 : selected !== null;

  const verdictTone = useMemo(() => {
    if (!showVerdict) return '';
    if (isMulti) {
      const selectedWords = [...selected].map(extractWord);
      const allCorrect = selectedWords.length === correctAnswers.length && selectedWords.every((w) => correctAnswers.includes(w));
      return allCorrect ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-800';
    }
    const word = selected ? extractWord(selected) : '';
    return correctAnswers.includes(word) ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-800';
  }, [showVerdict, selected, correctAnswers, isMulti]);

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950">
        <Md text={block.question || block.instruction || 'Highlight the mistake'} />
      </div>
      <div className="mb-5 text-sm text-zinc-500">
        {isMulti
          ? `Tap the words that are incorrect${correctAnswers.length > 1 ? ` (${correctAnswers.length} mistakes)` : ''}.`
          : 'Tap the word that is incorrect.'}
      </div>
      {block.hint && !submitted && <div className="mb-3 text-xs text-zinc-500">{block.hint}</div>}
      <div className="flex flex-wrap gap-y-1 text-lg leading-10 text-zinc-800">
        {words.map((word, index) => {
          if (/^\s+$/.test(word)) return <span key={index}>&nbsp;</span>;
          const key = `${index}-${word}`;
          const isSel = isItemSelected(key);
          const clean = word.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase();
          const isAnswer = showVerdict && correctAnswers.includes(clean);
          const isWrong = showVerdict && isSel && !correctAnswers.includes(clean);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(word, index)}
              className={[
                'rounded-lg px-2 py-1 transition cursor-pointer',
                isAnswer ? 'bg-emerald-100 text-emerald-900 ring-2 ring-emerald-400' : '',
                isWrong ? 'bg-red-100 text-red-900 ring-2 ring-red-400' : '',
                !submitted && isSel ? 'bg-red-100 text-red-900 ring-2 ring-red-300' : '',
                !submitted && !isSel ? 'hover:bg-zinc-100' : '',
              ].join(' ')}
            >
              {word}
            </button>
          );
        })}
      </div>
      {!submitted && (
        <button type="button" onClick={submit} disabled={!hasSelection} className="mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">
          {showCheckButton ? 'Check' : 'Save answer'}
        </button>
      )}
      {showVerdict && (
        <div className={`mt-4 border px-4 py-3 text-sm ${verdictTone}`}>
          {isMulti
            ? <>The mistakes are: <strong>{(block.answers || [block.answer]).join(', ')}</strong></>
            : <>The mistake is: <strong>{block.answer}</strong></>}
        </div>
      )}
      {submitted && !showCheckButton && <div className="mt-4 border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Answer saved ✓</div>}
      {submitted && block.explanation && (
        <div className="mt-3 bg-blue-50 p-4 text-sm text-blue-900"><Md text={block.explanation} /></div>
      )}
    </div>
  );
}


