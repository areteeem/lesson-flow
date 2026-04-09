import { useState } from 'react';
import { Md } from '../FormattedText';

export default function MultipleChoiceTask({ block, onComplete, onProgress, existingResult, showCheckButton = true }) {
  const options = block.options || [];
  const [selected, setSelected] = useState(() => {
    if (existingResult?.response == null) return null;
    const idx = options.indexOf(existingResult.response);
    return idx >= 0 ? idx : null;
  });
  const [submitted, setSubmitted] = useState(!!existingResult?.submitted);

  const isCorrect = (opt) => {
    if (!opt) return false;
    if (Array.isArray(block.answer)) {
      return block.answer.some(a => a.toLowerCase() === opt.toLowerCase());
    }
    return block.answer?.toLowerCase() === opt?.toLowerCase();
  };

  const handleSubmit = () => {
    if (selected === null || selected < 0 || selected >= options.length) return;
    const correct = isCorrect(options[selected]);
    setSubmitted(true);
    onComplete?.({
      submitted: true,
      correct,
      score: correct ? 1 : 0,
      response: options[selected],
      correctAnswer: block.answer,
      feedback: correct ? 'Correct' : block.explanation || 'Review the highlighted options.',
    });
  };

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-4 text-xl font-semibold text-zinc-950">
        <Md text={block.question || block.instruction} />
      </div>
      {block.hint && !submitted && <p className="mb-3 text-sm text-zinc-500"><Md text={block.hint} /></p>}
      <div className="space-y-3">
        {options.map((opt, idx) => {
          const active = selected === idx;
          const correct = submitted && isCorrect(opt);
          const wrong = submitted && active && !isCorrect(opt);
          return (
            <button
              key={idx}
              type="button"
              className={[
                'w-full border px-4 py-3 text-left text-sm transition duration-150',
                correct ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : '',
                wrong ? 'border-red-400 bg-red-50 text-red-900' : '',
                !submitted && active ? 'border-blue-400 bg-blue-50 text-zinc-950' : '',
                !submitted && !active ? 'border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 text-zinc-700' : '',
              ].join(' ')}
              onClick={() => { if (!submitted) { setSelected(idx); onProgress?.({ submitted: false, response: options[idx] }); } }}
              disabled={submitted}
            >
              <span className="mr-2 text-zinc-400">{String.fromCharCode(65 + idx)}.</span>
              <Md text={opt} />
            </button>
          );
        })}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-xs text-zinc-500">Choose one answer.</div>
        {!submitted && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selected === null}
            className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40"
          >
            {showCheckButton ? 'Check' : 'Save answer'}
          </button>
        )}
      </div>
      {submitted && showCheckButton && (
        <div className={[
          'mt-4 border px-4 py-3 text-sm',
          isCorrect(block.options[selected]) ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-800',
        ].join(' ')}>
          {isCorrect(block.options[selected]) ? 'Correct!' : `Expected: ${Array.isArray(block.answer) ? block.answer.join(', ') : block.answer}`}
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
