import { useState } from 'react';
import { Md } from '../FormattedText';

export default function InputTask({ block, onComplete, onProgress, existingResult, showCheckButton = true }) {
  const [value, setValue] = useState(existingResult?.response || '');
  const [submitted, setSubmitted] = useState(!!existingResult?.submitted);

  const checkAnswer = () => {
    const answers = Array.isArray(block.answer) ? block.answer : [block.answer];
    return answers.some(a => a?.toLowerCase().trim() === value.toLowerCase().trim());
  };

  const handleSubmit = () => {
    if (!value.trim()) return;
    const correct = checkAnswer();
    setSubmitted(true);
    onComplete?.({
      submitted: true,
      correct,
      score: correct ? 1 : 0,
      response: value,
      correctAnswer: block.answer,
      feedback: correct ? 'Correct' : block.explanation || 'Check the expected answer.',
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !submitted) {
      handleSubmit();
    }
  };

  const correct = submitted && checkAnswer();
  const incorrect = submitted && !checkAnswer();

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-4 text-xl font-semibold text-zinc-950">
        <Md text={block.question || block.instruction} />
      </div>
      {block.hint && !submitted && <p className="mb-3 text-sm text-zinc-500"><Md text={block.hint} /></p>}
      <input
        type="text"
        value={value}
        onChange={(e) => { if (!submitted) { setValue(e.target.value); onProgress?.({ submitted: false, response: e.target.value }); } }}
        onKeyDown={handleKeyDown}
        placeholder={block.placeholder || 'Type your answer…'}
        disabled={submitted}
        className={[
          'w-full border px-4 py-3 text-base outline-none transition',
          correct ? 'border-emerald-400 bg-emerald-50' : '',
          incorrect ? 'border-red-400 bg-red-50' : '',
          !submitted ? 'border-zinc-200 focus:border-zinc-900' : 'border-zinc-200',
        ].join(' ')}
      />
      {!submitted && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value.trim()}
          className="mt-4 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40"
        >
          {showCheckButton ? 'Check' : 'Save answer'}
        </button>
      )}
      {submitted && showCheckButton && (
        <div className={[
          'mt-4 border px-4 py-3 text-sm',
          correct ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-800',
        ].join(' ')}>
          {correct ? 'Correct!' : `Expected: ${Array.isArray(block.answer) ? block.answer.join(' / ') : block.answer}`}
        </div>
      )}
      {submitted && !showCheckButton && (
        <div className="mt-4 border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Response saved</div>
      )}
      {submitted && block.explanation && (
        <div className="mt-3 bg-blue-50 p-4 text-sm text-blue-900"><Md text={block.explanation} /></div>
      )}
    </div>
  );
}
