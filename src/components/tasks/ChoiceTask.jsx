import { useMemo, useState } from 'react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';
import { useShuffleSeed } from '../../hooks/useShuffleSeed';

function normalizeAnswers(value) {
  if (Array.isArray(value)) return value.map((item) => item.toString().trim().toLowerCase());
  if (!value) return [];
  return value.toString().split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function normalizeResponse(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return trimmed.split('|').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

export default function ChoiceTask({ block, onComplete, onProgress, existingResult, showCheckButton = true }) {
  const multi = block.multiple || block.taskType === 'multi_select';
  const correctAnswers = useMemo(() => normalizeAnswers(block.correct || block.answer), [block.correct, block.answer]);
  const shuffleSeed = useShuffleSeed();
  const options = useMemo(() => block.shuffle === false ? (block.options || []) : stableShuffle(block.options || [], `${block.id || block.question}-${shuffleSeed}-options`), [block.id, block.options, block.question, block.shuffle, shuffleSeed]);
  const [selected, setSelected] = useState(() => normalizeResponse(existingResult?.response));
  const [submitted, setSubmitted] = useState(() => Boolean(existingResult?.submitted));

  const toggle = (option) => {
    if (submitted) return;
    if (multi) {
      setSelected((current) => {
        const next = current.includes(option) ? current.filter((item) => item !== option) : [...current, option];
        onProgress?.({ submitted: false, response: next });
        return next;
      });
      return;
    }
    const next = [option];
    setSelected(next);
    onProgress?.({ submitted: false, response: next });
  };

  const submit = () => {
    if (selected.length === 0) return;
    setSubmitted(true);
    if (correctAnswers.length === 0) {
      onComplete?.({
        submitted: true,
        correct: true,
        score: 1,
        response: selected,
        correctAnswer: null,
        feedback: block.explanation || block.hint || 'Response saved.',
      });
      return;
    }
    const normalized = selected.map((item) => item.toLowerCase());
    const intersection = normalized.filter((item) => correctAnswers.includes(item)).length;
    const exact = normalized.length === correctAnswers.length && correctAnswers.every((item) => normalized.includes(item));
    const score = multi ? intersection / Math.max(correctAnswers.length, 1) : (exact ? 1 : 0);
    onComplete?.({
      submitted: true,
      correct: exact,
      score,
      response: selected,
      correctAnswer: block.correct || block.answer,
      feedback: exact ? 'Correct' : 'Review the highlighted options.',
    });
  };

  const isBinary = options.length === 2 && ['true_false', 'yes_no', 'either_or'].includes(block.taskType);
  const showVerdict = submitted && showCheckButton;

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.hint && !submitted && <p className="mb-4 text-sm text-zinc-500"><Md text={block.hint} /></p>}
      {options.length === 0 && (
        <div className="border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">This task has no options to display.</div>
      )}
      {isBinary ? (
        <div className="flex gap-4">
          {options.map((option) => {
            const normalized = option.toLowerCase();
            const active = selected.includes(option);
            const correct = showVerdict && correctAnswers.includes(normalized);
            const wrong = showVerdict && active && !correctAnswers.includes(normalized);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggle(option)}
                className={[
                  'flex-1 border-2 py-6 text-center text-lg font-semibold transition',
                  correct ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : '',
                  wrong ? 'border-red-500 bg-red-50 text-red-900' : '',
                  !submitted && active ? 'border-zinc-900 bg-zinc-900 text-white' : '',
                  !submitted && !active ? 'border-zinc-200 text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50' : '',
                ].join(' ')}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : (
      <div className="space-y-3">
        {options.map((option, index) => {
          const normalized = option.toLowerCase();
          const active = selected.includes(option);
          const correct = showVerdict && correctAnswers.includes(normalized);
          const wrong = showVerdict && active && !correctAnswers.includes(normalized);
          return (
            <button
              key={index}
              type="button"
              onClick={() => toggle(option)}
              className={[
                'w-full border px-4 py-3 text-left text-sm transition duration-150',
                correct ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : '',
                wrong ? 'border-red-400 bg-red-50 text-red-900' : '',
                !submitted && active ? 'border-blue-400 bg-blue-50 text-zinc-950' : '',
                !submitted && !active ? 'border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 text-zinc-700' : '',
              ].join(' ')}
            >
              <span className="mr-2 text-zinc-400">{String.fromCharCode(65 + index)}.</span>
              <Md text={option} />
            </button>
          );
        })}
      </div>
      )}
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-xs text-zinc-500">{multi ? 'Choose one or more answers.' : 'Choose one answer.'}</div>
        {!submitted && (
          <button type="button" onClick={submit} disabled={selected.length === 0} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">
            {showCheckButton ? 'Check' : 'Save answer'}
          </button>
        )}
      </div>
      {submitted && showCheckButton && (
        <div className={[
          'mt-4 border px-4 py-3 text-sm',
          (selected.length === correctAnswers.length && correctAnswers.every((item) => selected.map((entry) => entry.toLowerCase()).includes(item)))
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : 'border-red-300 bg-red-50 text-red-800',
        ].join(' ')}>
          Correct answer: {Array.isArray(block.correct || block.answer) ? (block.correct || block.answer).join(', ') : (block.correct || block.answer)}
        </div>
      )}
      {submitted && block.explanation && (
        <div className="mt-4 bg-blue-50 p-4 text-sm text-blue-900"><Md text={block.explanation} /></div>
      )}
    </div>
  );
}
