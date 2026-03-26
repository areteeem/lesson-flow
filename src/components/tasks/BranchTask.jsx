import { useState } from 'react';
import { FormattedText, Md } from '../FormattedText';

export default function BranchTask({ block, onComplete, existingResult }) {
  const options = block.options?.length ? block.options : ['Option A', 'Option B'];
  const [selected, setSelected] = useState('');
  const [explanation, setExplanation] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submit = () => {
    if (!selected && !explanation.trim()) return;
    const correctAnswer = Array.isArray(block.answer) ? block.answer[0] : block.answer;
    const normalizedSelected = selected.trim().toLowerCase();
    const normalizedCorrect = (correctAnswer || '').trim().toLowerCase();
    const correct = normalizedCorrect ? normalizedSelected === normalizedCorrect : explanation.trim().length > 0;
    setSubmitted(true);
    onComplete?.({
      submitted: true,
      correct,
      score: correct ? 1 : explanation.trim() ? 0.6 : 0,
      response: { selected, explanation },
      correctAnswer: block.answer,
      feedback: block.explanation || block.hint || 'Decision saved.',
    });
  };

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.text && <FormattedText text={block.text} className="mb-4 text-sm leading-7 text-zinc-700" />}
      <div className="grid gap-3 md:grid-cols-2">
        {options.map((option, index) => (
          <button key={index} type="button" onClick={() => !submitted && setSelected(option)} className={selected === option ? 'w-full rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-4 text-left text-sm text-white' : 'w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 text-left text-sm text-zinc-700 transition hover:border-zinc-400 hover:bg-white'}>
            <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">Option {index + 1}</div>
            <div className="mt-2 font-medium">{option}</div>
          </button>
        ))}
      </div>
      <textarea rows={4} value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="Explain your choice…" className="mt-4 w-full resize-y rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-xs text-zinc-500">{block.hint || 'Choose an option and explain.'}</div>
        <button type="button" onClick={submit} disabled={!selected && !explanation.trim()} className="rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">Submit</button>
      </div>
      {submitted && block.explanation && <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700"><Md text={block.explanation} /></div>}
    </div>
  );
}
