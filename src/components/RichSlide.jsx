import { FormattedTextBlock } from './FormattedText';

export default function RichSlide({ block }) {
  return (
    <div className="border border-zinc-200 bg-white p-8">
      {block.title && <h2 className="mb-4 text-2xl font-semibold text-zinc-950">{block.title}</h2>}
      {block.instruction && <p className="mb-4 text-sm text-zinc-500">{block.instruction}</p>}
      <FormattedTextBlock text={block.content || block.text || ''} />
      {block.examples?.length > 0 && (
        <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Examples</div>
          <div className="space-y-2 text-sm text-zinc-700">
            {block.examples.map((example, index) => (
              <FormattedTextBlock key={index} text={example} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
