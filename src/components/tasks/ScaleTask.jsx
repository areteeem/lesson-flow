import { useMemo, useState } from 'react';
import { Md } from '../FormattedText';

export default function ScaleTask({ block, onComplete, existingResult }) {
  const min = Number(block.min ?? 1);
  const max = Number(block.max ?? 5);
  const hasAnswerKey = (block.answer ?? block.correct) !== undefined && String(block.answer ?? block.correct).trim() !== '';
  const answer = Number(hasAnswerKey ? (block.answer ?? block.correct) : min);
  const steps = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => min + i), [min, max]);
  const labels = block.labels || {};
  const [value, setValue] = useState(existingResult?.response ?? null);
  const [submitted, setSubmitted] = useState(!!existingResult?.submitted);

  const submit = () => {
    if (value === null) return;
    if (!hasAnswerKey) {
      setSubmitted(true);
      onComplete?.({ submitted: true, correct: true, score: 1, response: value, correctAnswer: null });
      return;
    }
    const distance = Math.abs(value - answer);
    const range = max - min || 1;
    const score = Math.max(0, 1 - distance / range);
    const correct = value === answer;
    setSubmitted(true);
    onComplete?.({ submitted: true, correct, score, response: value, correctAnswer: answer });
  };

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-3 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.hint && !submitted && <p className="mb-4 text-sm text-zinc-500"><Md text={block.hint} /></p>}

      {/* Visual scale */}
      <div className="mb-6">
        <div className="flex items-end justify-between gap-1">
          {steps.map((step) => {
            const selected = value === step;
            const isAnswer = submitted && step === answer;
            const isWrong = submitted && selected && step !== answer;
            const height = 24 + ((step - min) / (max - min || 1)) * 56;
            return (
              <button
                key={step}
                type="button"
                onClick={() => !submitted && setValue(step)}
                className={[
                  'flex-1 flex flex-col items-center justify-end transition-all duration-200',
                  !submitted && selected ? 'scale-105' : '',
                ].join(' ')}
              >
                <div
                  className={[
                    'w-full border-2 transition-all duration-200',
                    isAnswer ? 'border-emerald-500 bg-emerald-100' : '',
                    isWrong ? 'border-red-500 bg-red-100' : '',
                    !submitted && selected ? 'border-zinc-900 bg-zinc-900' : '',
                    !submitted && !selected ? 'border-zinc-200 bg-zinc-100 hover:border-zinc-400 hover:bg-zinc-200' : '',
                    submitted && !isAnswer && !isWrong ? 'border-zinc-200 bg-zinc-50' : '',
                  ].join(' ')}
                  style={{ height: `${height}px` }}
                />
                <div className={[
                  'mt-2 text-xs font-semibold',
                  selected ? 'text-zinc-900' : 'text-zinc-400',
                  isAnswer ? 'text-emerald-700' : '',
                  isWrong ? 'text-red-600' : '',
                ].join(' ')}>{step}</div>
                {labels[step] && <div className="mt-0.5 text-[10px] text-zinc-400 text-center leading-tight">{labels[step]}</div>}
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
          <span>{labels[min] || (min === 1 ? 'Low' : String(min))}</span>
          <span>{labels[max] || (max === 5 ? 'High' : String(max))}</span>
        </div>
      </div>

      {value !== null && !submitted && (
        <div className="mb-4 text-center text-sm text-zinc-600">Selected: <strong>{value}</strong></div>
      )}

      {!submitted && <button type="button" onClick={submit} disabled={value === null} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">Check</button>}
      {submitted && hasAnswerKey && <div className={value === answer ? 'mt-4 border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800' : 'mt-4 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800'}>Expected value: {answer}</div>}
      {submitted && !hasAnswerKey && <div className="mt-4 border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Response saved ✓</div>}
      {submitted && block.explanation && <div className="mt-4 bg-blue-50 p-4 text-sm text-blue-900"><Md text={block.explanation} /></div>}
    </div>
  );
}
