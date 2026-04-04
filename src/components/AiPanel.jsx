import { useMemo, useState } from 'react';
import { buildAiGenerationPrompt, generateAiText, getAiBridgeSettings, hasAiBridgeToken } from '../utils/aiBridge';
import { BrainIcon, WandIcon } from './Icons';

const TASK_PRESETS = [
  { id: 'mc', label: 'Multiple Choice', prompt: 'Generate a multiple-choice question' },
  { id: 'fill', label: 'Fill in the Blanks', prompt: 'Generate a fill-in-the-blanks exercise' },
  { id: 'match', label: 'Matching Pairs', prompt: 'Generate a matching exercise with pairs' },
  { id: 'order', label: 'Ordering', prompt: 'Generate a sentence ordering exercise' },
  { id: 'open', label: 'Open-Ended', prompt: 'Generate an open-ended discussion question' },
  { id: 'truefalse', label: 'True / False', prompt: 'Generate a true or false statement' },
  { id: 'vocab', label: 'Vocabulary Set', prompt: 'Generate a vocabulary set with definitions' },
  { id: 'reading', label: 'Reading Comprehension', prompt: 'Generate a short reading passage with comprehension questions' },
];

function asList(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  const single = String(value || '').trim();
  return single ? [single] : [];
}

function derivePromptContext(lessonContext) {
  const settings = lessonContext?.settings || {};
  const difficulty = asList(settings.difficulty);
  const focus = asList(settings.focus);
  const lessonTopic = String(settings.lessonTopic || '').trim();
  const grammarTopic = String(settings.grammarTopic || '').trim();
  const title = String(lessonContext?.title || '').trim();
  const description = String(settings.description || '').trim();

  return {
    title,
    lessonTopic,
    grammarTopic,
    focus,
    focusLabel: focus.join(', '),
    level: difficulty[0] || 'B1',
    description,
    hasInputContext: Boolean(title || lessonTopic || grammarTopic || description || focus.length),
  };
}

export default function AiPanel({ onInsertDsl, lessonContext }) {
  const [taskType, setTaskType] = useState('mc');
  const [count, setCount] = useState(3);
  const [customPrompt, setCustomPrompt] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [requestMeta, setRequestMeta] = useState(null);

  const tokenAvailable = hasAiBridgeToken();
  const aiSettings = getAiBridgeSettings();
  const promptContext = useMemo(() => derivePromptContext(lessonContext), [lessonContext]);
  const selectedPreset = TASK_PRESETS.find((preset) => preset.id === taskType) || TASK_PRESETS[0];
  const promptPreview = useMemo(() => buildAiGenerationPrompt({
    title: promptContext.title,
    topic: promptContext.lessonTopic || promptContext.title,
    grammarTopic: promptContext.grammarTopic,
    focus: promptContext.focusLabel,
    level: promptContext.level,
    description: promptContext.description,
    taskTypeLabel: selectedPreset.label,
    count,
    customPrompt: useCustom ? customPrompt : '',
  }), [count, customPrompt, promptContext.description, promptContext.focusLabel, promptContext.grammarTopic, promptContext.lessonTopic, promptContext.level, promptContext.title, selectedPreset.label, useCustom]);

  const handleGenerate = async () => {
    if (!useCustom && !promptContext.hasInputContext) {
      setError('Add lesson topic, grammar, focus, or description in the prompt generator first, or switch to a custom prompt.');
      return;
    }

    if (!promptPreview) {
      setError('Add lesson context or write a custom prompt.');
      return;
    }

    setLoading(true);
    setError('');
    setResult('');
    setRequestMeta(null);

    try {
      const response = await generateAiText({ prompt: promptPreview });
      setResult(response.text.trim());
      setRequestMeta({ provider: response.provider, model: response.model });
    } catch (err) {
      setError(err.message || 'Failed to generate content.');
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    if (result && onInsertDsl) {
      onInsertDsl(result);
      setResult('');
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <BrainIcon />
          <span className="text-sm font-medium text-zinc-800">AI Task Generator</span>
          <span className="ml-auto border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            {aiSettings.provider}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-xl space-y-4">
          {!tokenAvailable && (
            <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              AI requests use the app server proxy. If generation fails, check the server-side AI token configuration.
            </div>
          )}

          <div className="border border-zinc-200 bg-white p-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">Prompt Generator Context</div>
            {promptContext.hasInputContext ? (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {promptContext.title && <span className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700">Title: {promptContext.title}</span>}
                  {promptContext.lessonTopic && <span className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700">Topic: {promptContext.lessonTopic}</span>}
                  {promptContext.grammarTopic && <span className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700">Grammar: {promptContext.grammarTopic}</span>}
                  {promptContext.focus.map((entry) => <span key={entry} className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700">Focus: {entry}</span>)}
                  <span className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700">Level: {promptContext.level}</span>
                </div>
                {promptContext.description && <div className="text-xs leading-relaxed text-zinc-600">{promptContext.description}</div>}
              </div>
            ) : (
              <div className="mt-3 text-xs leading-relaxed text-zinc-500">
                No lesson context is set yet. Fill in the lesson topic, grammar focus, description, or level in the prompt generator or lesson settings, then come back here.
              </div>
            )}
          </div>

          {/* Quick mode vs Custom */}
          <div className="flex gap-1 border border-zinc-200 p-0.5">
            <button type="button" onClick={() => setUseCustom(false)} className={`flex-1 px-3 py-1.5 text-xs font-medium ${!useCustom ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>Quick Generate</button>
            <button type="button" onClick={() => setUseCustom(true)} className={`flex-1 px-3 py-1.5 text-xs font-medium ${useCustom ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>Custom Prompt</button>
          </div>

          {!useCustom ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-zinc-600">Count</span>
                  <input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} className="mt-1 w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900" />
                </label>
                <div className="block">
                  <span className="text-xs text-zinc-600">Level Source</span>
                  <div className="mt-1 border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">{promptContext.level}</div>
                </div>
              </div>

              <div>
                <span className="text-xs text-zinc-600">Task Type</span>
                <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {TASK_PRESETS.map((preset) => (
                    <button key={preset.id} type="button" onClick={() => setTaskType(preset.id)} className={`border px-2 py-1.5 text-[11px] font-medium ${taskType === preset.id ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'}`}>
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <label className="block">
              <span className="text-xs text-zinc-600">Custom Prompt</span>
              <textarea value={customPrompt} onChange={(e) => setCustomPrompt(e.target.value)} rows={4} placeholder="Describe exactly what you want the AI to generate…" className="mt-1 w-full border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-zinc-900" />
            </label>
          )}

          <details className="border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
            <summary className="cursor-pointer font-medium text-zinc-700">Prompt preview</summary>
            <div className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-zinc-600">{promptPreview || 'Add lesson context in the prompt generator or write a custom prompt.'}</div>
          </details>

          <button type="button" onClick={handleGenerate} disabled={loading || !tokenAvailable} className="flex w-full items-center justify-center gap-2 border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {loading ? (
              <span className="animate-pulse">Generating…</span>
            ) : (
              <><WandIcon /><span>{tokenAvailable ? 'Generate' : 'Server AI Not Ready'}</span></>
            )}
          </button>

          {error && <div className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}

          {result && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-600">Generated DSL{requestMeta ? ` · ${requestMeta.provider}` : ''}</span>
                <button type="button" onClick={handleInsert} className="border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                  Insert into Lesson
                </button>
              </div>
              <pre className="max-h-64 overflow-auto border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">{result}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
