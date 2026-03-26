import { useState } from 'react';
import { FormattedText, Md } from '../FormattedText';

export default function CollectionTask({ block, onComplete, existingResult }) {
  const [checked, setChecked] = useState([]);
  const items = block.items || [];

  const toggle = (item) => {
    setChecked((current) => current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item]);
  };

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.text && <FormattedText text={block.text} className="mb-4 text-sm leading-7 text-zinc-700" />}
      {block.hint && <p className="mb-4 text-sm text-zinc-500"><Md text={block.hint} /></p>}
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item, index) => (
          <label key={index} className={checked.includes(item) ? 'flex items-start gap-3 rounded-2xl border border-zinc-900 bg-zinc-50 px-4 py-4 text-sm text-zinc-900 transition' : 'flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-700 transition hover:border-zinc-400'}>
            <input type="checkbox" checked={checked.includes(item)} onChange={() => toggle(item)} className="mt-0.5" />
            <span>{item}</span>
          </label>
        ))}
      </div>
      {block.categories?.length > 0 && (
        <div className="mt-4 rounded-2xl border border-zinc-200 p-3 text-sm text-zinc-700">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Categories</div>
          <div className="flex flex-wrap gap-2">{block.categories.map((category, index) => <span key={index} className="rounded-full border border-zinc-200 px-3 py-1 text-xs">{category}</span>)}</div>
        </div>
      )}
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-xs text-zinc-500">{checked.length} of {items.length} selected</div>
        <button type="button" onClick={() => onComplete?.({ submitted: true, correct: true, score: Math.min(1, checked.length / Math.max(items.length, 1)), response: checked, feedback: block.explanation || block.hint || 'Collection saved.' })} disabled={checked.length === 0} className="rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">Save set</button>
      </div>
    </div>
  );
}
