import { FormattedTextBlock } from './FormattedText';

const PANELS = [
  { key: 'positive', label: 'Positive', tone: 'border-emerald-200 bg-emerald-50/70 text-emerald-900' },
  { key: 'negative', label: 'Negative', tone: 'border-red-200 bg-red-50/70 text-red-900' },
  { key: 'question', label: 'Question', tone: 'border-blue-200 bg-blue-50/70 text-blue-900' },
];

export default function StructureSlide({ block }) {
  return (
    <div className="border border-zinc-200 bg-white p-8">
      {block.title && <h2 className="mb-5 text-2xl font-semibold text-zinc-950">{block.title}</h2>}
      <div className="grid gap-4 lg:grid-cols-3">
        {PANELS.map((panel) => (
          <div key={panel.key} className={`rounded-2xl border p-4 ${panel.tone}`}>
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em]">{panel.label}</div>
            <FormattedTextBlock text={block[panel.key] || ''} compact className="text-sm" />
          </div>
        ))}
      </div>
      {block.examples?.length > 0 && (
        <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Examples</div>
          <div className="space-y-2 text-sm text-zinc-700">
            {block.examples.map((example, index) => <FormattedTextBlock key={index} text={example} compact />)}
          </div>
        </div>
      )}
    </div>
  );
}
