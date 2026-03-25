import { useMemo, useState } from 'react';
import { FormattedTextBlock, Md } from './FormattedText';

const CHAT_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-900', border: 'border-blue-200', avatar: 'bg-blue-600' },
  { bg: 'bg-zinc-100', text: 'text-zinc-900', border: 'border-zinc-200', avatar: 'bg-zinc-600' },
  { bg: 'bg-emerald-100', text: 'text-emerald-900', border: 'border-emerald-200', avatar: 'bg-emerald-600' },
  { bg: 'bg-purple-100', text: 'text-purple-900', border: 'border-purple-200', avatar: 'bg-purple-600' },
  { bg: 'bg-amber-100', text: 'text-amber-900', border: 'border-amber-200', avatar: 'bg-amber-600' },
  { bg: 'bg-rose-100', text: 'text-rose-900', border: 'border-rose-200', avatar: 'bg-rose-600' },
];

function parseScenarioLines(text) {
  if (!text) return [];
  return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^([A-Za-z0-9_ ]+?)\s*:\s*(.+)$/);
    return m ? { speaker: m[1].trim(), content: m[2] } : { speaker: '', content: line };
  });
}

function ScenarioChat({ text, revealMode }) {
  const messages = useMemo(() => parseScenarioLines(text), [text]);
  const speakers = useMemo(() => {
    const s = [];
    messages.forEach((m) => { if (m.speaker && !s.includes(m.speaker)) s.push(m.speaker); });
    return s;
  }, [messages]);
  const [revealed, setRevealed] = useState(revealMode ? 1 : messages.length);

  if (messages.length === 0) return null;

  return (
    <div className="space-y-3">
      {messages.slice(0, revealed).map((msg, i) => {
        const sIdx = speakers.indexOf(msg.speaker);
        const color = CHAT_COLORS[(sIdx >= 0 ? sIdx : 0) % CHAT_COLORS.length];
        const isLeft = sIdx % 2 === 0;
        return (
          <div key={i} className={`flex items-end gap-2.5 ${isLeft ? '' : 'flex-row-reverse'}`} style={{ animation: 'fadeSlideUp 0.3s ease-out' }}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center text-xs font-bold text-white ${color.avatar}`}>
              {msg.speaker?.[0]?.toUpperCase() || '?'}
            </div>
            <div className={`max-w-[75%] border px-4 py-2.5 ${color.bg} ${color.border} ${color.text} ${isLeft ? 'rounded-t-2xl rounded-br-2xl rounded-bl-sm' : 'rounded-t-2xl rounded-bl-2xl rounded-br-sm'}`}>
              {msg.speaker && <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-60">{msg.speaker}</div>}
              <div className="text-sm leading-relaxed"><Md text={msg.content} /></div>
            </div>
          </div>
        );
      })}
      {revealMode && revealed < messages.length && (
        <div className="flex justify-center pt-2">
          <button type="button" onClick={() => setRevealed((c) => Math.min(c + 1, messages.length))} className="border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-900">Next message ↓</button>
        </div>
      )}
      <style>{`@keyframes fadeSlideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

function Panel({ title, body }) {
  if (!title && !body) return null;
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4">
      {title && <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">{title}</div>}
      {body && <FormattedTextBlock text={body} className="text-sm leading-7 text-zinc-700" compact />}
    </div>
  );
}

export default function GenericSlide({ block }) {
  const [stepIndex, setStepIndex] = useState(0);
  const layout = block.layout || block.type;
  const steps = block.steps || block.items || [];
  const media = block.media || block.image || block.video || block.audio || block.src || '';
  const taskList = block.taskRefs || block.items || [];

  return (
    <div className="border border-zinc-200 bg-white p-8">
      {block.title && <h2 className="mb-3 text-2xl font-semibold text-zinc-950">{block.title}</h2>}
      {block.instruction && <div className="mb-4 text-sm text-zinc-500">{block.instruction}</div>}

      {layout === 'two_column_text_task' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel body={block.left || block.content || block.text || ''} />
          <Panel body={block.right || (taskList.length ? taskList.join('\n') : '')} />
        </div>
      )}

      {['image_task', 'video_task', 'map_diagram'].includes(layout) && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 animate-soft-rise">
            {media ? (
              layout === 'video_task'
                ? <video controls className="w-full rounded-xl" src={media} />
                : <img alt={block.title || 'slide media'} className="max-h-[60vh] w-full rounded-xl object-contain transition duration-500 hover:scale-[1.01]" src={media} />
            ) : (
              <div className="flex min-h-64 items-center justify-center text-sm text-zinc-400">No media source attached.</div>
            )}
          </div>
          <Panel body={block.right || block.content || taskList.join('\n')} />
        </div>
      )}

      {layout === 'carousel' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 animate-soft-rise">
            <div className="mb-1 text-xs font-medium text-zinc-400">Card {stepIndex + 1} of {Math.max(steps.length, 1)}</div>
            <FormattedTextBlock text={steps[stepIndex] || block.content || ''} className="text-sm leading-7 text-zinc-700" compact />
          </div>
          {steps.length > 1 && (
            <div className="grid gap-2 md:grid-cols-3">
              {steps.map((step, index) => (
                <button key={index} type="button" onClick={() => setStepIndex(index)} className={index === stepIndex ? 'rounded-2xl border border-zinc-900 bg-zinc-900 px-3 py-3 text-left text-white transition' : 'rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-left text-zinc-700 transition hover:border-zinc-400'}>
                  <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">Card {index + 1}</div>
                  <div className="mt-2 line-clamp-3 text-sm">{step}</div>
                </button>
              ))}
            </div>
          )}
          {steps.length > 1 && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setStepIndex((value) => Math.max(0, value - 1))} className="rounded-2xl border border-zinc-200 px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50">Previous</button>
              <button type="button" onClick={() => setStepIndex((value) => Math.min(steps.length - 1, value + 1))} className="rounded-2xl border border-zinc-900 bg-zinc-900 px-3 py-2 text-sm text-white transition hover:bg-zinc-800">Next</button>
            </div>
          )}
        </div>
      )}

      {layout === 'step_by_step' && (
        <div className="space-y-4">
          <Panel title={`Step ${stepIndex + 1}`} body={steps[stepIndex] || block.content || ''} />
          {steps.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {steps.map((_, index) => (
                <button key={index} type="button" onClick={() => setStepIndex(index)} className={index === stepIndex ? 'rounded-full border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition' : 'rounded-full border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-zinc-400'}>
                  Step {index + 1}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {layout === 'focus' && (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2">
            {(block.keywords || block.items || []).map((kw, i) => <div key={i} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-center text-sm font-medium text-zinc-700">{kw}</div>)}
          </div>
          <Panel body={block.content || block.text || ''} />
        </div>
      )}

      {layout === 'flashcard_slide' && <Panel body={(block.cards || []).map((card) => `**${card.front}** — ${card.back}`).join('\n') || block.content || ''} />}
      {layout === 'scenario' && <ScenarioChat text={block.dialogue || block.content || block.text || ''} revealMode={block.revealMode} />}
      {layout === 'group_task_slide' && taskList.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {taskList.map((ref, i) => <span key={i} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600">{ref}</span>)}
        </div>
      )}

      {!['two_column_text_task', 'image_task', 'video_task', 'map_diagram', 'carousel', 'step_by_step', 'focus', 'flashcard_slide', 'scenario', 'group_task_slide'].includes(layout) && (block.content || block.text) && (
        <FormattedTextBlock text={block.content || block.text || ''} className="text-sm leading-7 text-zinc-700" compact />
      )}
    </div>
  );
}