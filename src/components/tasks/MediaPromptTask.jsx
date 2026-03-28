import { useState } from 'react';
import { FormattedText, Md } from '../FormattedText';
import { resolveMediaSource } from '../../utils/media';

function MediaFrame({ block }) {
  const media = resolveMediaSource(block);
  const [zoomed, setZoomed] = useState(false);
  if (!media) return <div className="flex min-h-56 items-center justify-center border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">Attach media in DSL or the builder.</div>;
  if (block.taskType === 'video_questions') return <video controls preload="metadata" className="w-full border border-zinc-200" src={media} />;
  if (['audio_transcription', 'pronunciation_shadowing'].includes(block.taskType)) return <audio controls preload="metadata" className="w-full" src={media} />;
  return (
    <>
      <img
        src={media}
        alt={block.question || block.taskType}
        onClick={() => setZoomed(true)}
        loading="lazy" className="max-h-[60vh] w-full cursor-zoom-in border border-zinc-200 object-contain"
      />
      {zoomed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoomed(false)}>
          <img src={media} alt="" className="max-h-[90vh] max-w-[90vw] object-contain" />
          <button type="button" onClick={() => setZoomed(false)} className="absolute right-4 top-4 border border-white/30 bg-black/50 px-3 py-1.5 text-sm text-white hover:bg-black/70">✕ Close</button>
        </div>
      )}
    </>
  );
}

export default function MediaPromptTask({ block, onComplete, existingResult }) {
  const [notes, setNotes] = useState(existingResult?.response || '');
  const [submitted, setSubmitted] = useState(!!existingResult?.submitted);

  const submit = () => {
    setSubmitted(true);
    onComplete?.({ submitted: true, correct: true, score: 1, response: notes, feedback: block.explanation || block.hint || 'Media response saved.' });
  };

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.text && <FormattedText text={block.text} className="mb-4 text-sm leading-7 text-zinc-700" />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_340px]">
        <div className="space-y-3 border border-zinc-200 bg-[#fafaf9] p-3">
          <MediaFrame block={block} />
          <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            <span className="border border-zinc-200 bg-white px-2 py-1">Image focus</span>
            <span className="border border-zinc-200 bg-white px-2 py-1">Observation mode</span>
            {block.items?.length > 0 && <span className="border border-zinc-200 bg-white px-2 py-1">{block.items.length} targets</span>}
          </div>
        </div>
        <div className="space-y-3">
          {block.items?.length > 0 && (
            <div className="border border-zinc-200 p-3 text-sm text-zinc-700">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Targets</div>
              {block.items.map((item, index) => <div key={index}>{item}</div>)}
            </div>
          )}
          <textarea rows={10} value={notes} onChange={(event) => !submitted && setNotes(event.target.value)} readOnly={submitted} placeholder="Add labels, observations, transcript text, or your answer." className={`w-full border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-zinc-900 ${submitted ? 'bg-zinc-50 text-zinc-500' : ''}`} />
          {!submitted ? (
            <button type="button" onClick={submit} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">Save response</button>
          ) : (
            <div className="border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Response saved ✓</div>
          )}
        </div>
      </div>
    </div>
  );
}
