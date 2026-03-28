import { FormattedTextBlock } from './FormattedText';

export default function Slide({ block }) {
  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      {block.title && <h2 className="mb-4 text-2xl font-semibold text-zinc-950">{block.title}</h2>}
      {block.instruction && <div className="mb-3 text-sm text-zinc-500">{block.instruction}</div>}
      <FormattedTextBlock text={block.content || block.text || ''} />
      {block.notes?.length > 0 && (
        <div className="mt-5 border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
          {block.notes.map((note, index) => <div key={index}>{note}</div>)}
        </div>
      )}
    </div>
  );
}
