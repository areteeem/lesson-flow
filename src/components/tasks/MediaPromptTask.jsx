import { useState } from 'react';
import { FormattedText, Md } from '../FormattedText';
import { resolveMediaSource } from '../../utils/media';

function normalizeAnswers(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  return String(value || '').split('|').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

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
          <img src={media} alt="" loading="lazy" decoding="async" className="max-h-[90vh] max-w-[90vw] object-contain" />
          <button type="button" onClick={() => setZoomed(false)} className="absolute right-4 top-4 border border-white/30 bg-black/50 px-3 py-1.5 text-sm text-white hover:bg-black/70">✕ Close</button>
        </div>
      )}
    </>
  );
}

export default function MediaPromptTask({ block, onComplete, existingResult }) {
  const mediaSource = resolveMediaSource(block);
  const [notes, setNotes] = useState(existingResult?.response || '');
  const [submitted, setSubmitted] = useState(!!existingResult?.submitted);
  const [selected, setSelected] = useState(() => Array.isArray(existingResult?.response) ? existingResult.response : []);
  const [points, setPoints] = useState(() => Array.isArray(existingResult?.response?.points) ? existingResult.response.points : []);
  const [activeTargetIndex, setActiveTargetIndex] = useState(0);

  const isVideoChoice = block.taskType === 'video_questions';
  const isInteractiveImage = ['image_labeling', 'map_geography_label', 'hotspot_selection', 'image_compare_spot'].includes(block.taskType);
  const options = Array.isArray(block.options) ? block.options.filter((option) => String(option).trim()) : [];
  const allowMultiple = Boolean(block.multiple);
  const answerKey = normalizeAnswers(block.correct || block.answer);
  const targets = Array.isArray(block.items) ? block.items.filter((item) => String(item || '').trim()) : [];

  const toggleChoice = (option) => {
    if (submitted) return;
    if (allowMultiple) {
      setSelected((current) => current.includes(option) ? current.filter((entry) => entry !== option) : [...current, option]);
      return;
    }
    setSelected([option]);
  };

  const onImageClick = (event) => {
    if (submitted) return;
    const imageElement = event.currentTarget;
    const rect = imageElement.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));

    if (block.taskType === 'hotspot_selection' || targets.length === 0) {
      setPoints([{ id: 'selection', x, y, label: targets[0] || 'selection' }]);
      return;
    }

    const targetLabel = targets[activeTargetIndex] || `Target ${activeTargetIndex + 1}`;
    setPoints((current) => {
      const next = [...current];
      const existingIndex = next.findIndex((entry) => entry.label === targetLabel);
      const payload = { id: targetLabel, x, y, label: targetLabel };
      if (existingIndex >= 0) next[existingIndex] = payload;
      else next.push(payload);
      return next;
    });
  };

  const submit = () => {
    setSubmitted(true);
    if (isVideoChoice && options.length > 0) {
      const normalizedSelection = selected.map((entry) => entry.toLowerCase());
      const exact = normalizedSelection.length === answerKey.length && answerKey.every((entry) => normalizedSelection.includes(entry));
      const overlap = normalizedSelection.filter((entry) => answerKey.includes(entry)).length;
      const score = allowMultiple ? overlap / Math.max(answerKey.length, 1) : (exact ? 1 : 0);
      onComplete?.({
        submitted: true,
        correct: exact,
        score,
        response: selected,
        correctAnswer: block.correct || block.answer,
        feedback: exact ? 'Correct.' : 'Review the video and try again.',
      });
      return;
    }

    if (isInteractiveImage) {
      const hasPlacement = points.length > 0;
      onComplete?.({
        submitted: true,
        correct: hasPlacement,
        score: hasPlacement ? 1 : 0,
        response: { points },
        feedback: hasPlacement ? 'Selections saved.' : 'No points selected.',
      });
      return;
    }

    onComplete?.({ submitted: true, correct: true, score: 1, response: notes, feedback: block.explanation || block.hint || 'Media response saved.' });
  };

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.text && <FormattedText text={block.text} className="mb-4 text-sm leading-7 text-zinc-700" />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(240px,340px)]">
        <div className="space-y-3 border border-zinc-200 bg-[#fafaf9] p-3">
          {isInteractiveImage ? (
            <div className="relative">
              {mediaSource ? (
                <img
                  src={mediaSource}
                  alt={block.question || block.taskType}
                  onClick={onImageClick}
                  loading="lazy"
                  className="max-h-[60vh] w-full cursor-crosshair border border-zinc-200 object-contain touch-manipulation"
                />
              ) : <div className="flex min-h-56 items-center justify-center border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">Attach media in DSL or the builder.</div>}
              {points.map((point, index) => (
                <button
                  key={`${point.id}-${index}`}
                  type="button"
                  onClick={() => !submitted && setPoints((current) => current.filter((entry, entryIndex) => entryIndex !== index))}
                  className="absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center border-2 border-red-500 bg-white text-xs font-semibold text-red-600 shadow-md sm:h-7 sm:w-7 sm:text-[10px]"
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  title={submitted ? point.label : `${point.label} (click marker to remove)`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          ) : (
            <MediaFrame block={block} />
          )}
          <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            <span className="border border-zinc-200 bg-white px-2 py-1">{isVideoChoice ? 'Video mode' : 'Image focus'}</span>
            <span className="border border-zinc-200 bg-white px-2 py-1">{isInteractiveImage ? 'Click to place markers' : 'Observation mode'}</span>
            {block.items?.length > 0 && <span className="border border-zinc-200 bg-white px-2 py-1">{block.items.length} targets</span>}
          </div>
        </div>
        <div className="space-y-3">
          {isVideoChoice && options.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Video questions</div>
              {options.map((option, index) => {
                const active = selected.includes(option);
                return (
                  <button
                    key={`${index}-${option}`}
                    type="button"
                    onClick={() => toggleChoice(option)}
                    disabled={submitted}
                    className={active ? 'w-full border border-zinc-900 bg-zinc-900 px-3 py-2 text-left text-sm text-white' : 'w-full border border-zinc-200 px-3 py-2 text-left text-sm text-zinc-700 hover:border-zinc-400'}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          )}

          {isInteractiveImage && targets.length > 0 && (
            <div className="border border-zinc-200 p-3 text-sm text-zinc-700">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Targets</div>
              <div className="space-y-1.5">
                {targets.map((target, index) => {
                  const placed = points.find((point) => point.label === target);
                  return (
                    <button
                      key={`${target}-${index}`}
                      type="button"
                      onClick={() => setActiveTargetIndex(index)}
                      className={activeTargetIndex === index ? 'flex w-full items-center justify-between border border-zinc-900 bg-zinc-900 px-2 py-1.5 text-xs text-white' : 'flex w-full items-center justify-between border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700'}
                    >
                      <span>{target}</span>
                      <span>{placed ? 'placed' : 'pending'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isInteractiveImage && targets.length === 0 && points.length > 0 && !submitted && (
            <div className="border border-zinc-200 p-3 text-sm text-zinc-700">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Placed markers</div>
              <div className="space-y-1.5">
                {points.map((point, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-red-300 bg-red-50 text-[10px] font-semibold text-red-600">{index + 1}</span>
                    <span className="text-xs text-zinc-500">({Math.round(point.x)}%, {Math.round(point.y)}%)</span>
                    <button type="button" onClick={() => setPoints((c) => c.filter((_, i) => i !== index))} className="ml-auto text-[10px] text-zinc-400 hover:text-red-500">remove</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isInteractiveImage && block.items?.length > 0 && (
            <div className="border border-zinc-200 p-3 text-sm text-zinc-700">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Targets</div>
              {block.items.map((item, index) => <div key={index}>{item}</div>)}
            </div>
          )}
          {(!isVideoChoice || options.length === 0) && !isInteractiveImage && (
            <textarea rows={6} value={notes} onChange={(event) => !submitted && setNotes(event.target.value)} readOnly={submitted} placeholder="Add labels, observations, transcript text, or your answer." className={`w-full border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-zinc-900 lg:min-h-[15rem] ${submitted ? 'bg-zinc-50 text-zinc-500' : ''}`} />
          )}
          {!submitted ? (
            <button
              type="button"
              onClick={submit}
              disabled={(isVideoChoice && options.length > 0 && selected.length === 0) || (isInteractiveImage && points.length === 0)}
              className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40"
            >
              Save response
            </button>
          ) : (
            <div className="border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Response saved ✓</div>
          )}
        </div>
      </div>
    </div>
  );
}
