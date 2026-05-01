import { useEffect, useMemo, useState } from 'react';
import {
  buildAiGenerationPrompt,
  generateAiText,
  getAiBridgeSettings,
  hasAiBridgeToken,
  normalizeAiGeneratedDsl,
} from '../utils/aiBridge';
import { getSlideTemplate, getTaskTemplate } from '../config/dslPromptTemplates';
import { SLIDE_REGISTRY } from '../config/slideRegistry';
import { TASK_REGISTRY } from '../config/taskRegistry';
import { AlertTriangleIcon, BrainIcon, CheckIcon, InfoCircleIcon, TemplateIcon, WandIcon } from './Icons';

const LEVEL_OPTIONS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const FOCUS_OPTIONS = ['grammar', 'vocabulary', 'reading', 'writing', 'speaking', 'listening', 'mixed'];
const DIFFICULTY_STYLE_OPTIONS = [
  { value: 'controlled_practice', label: 'Controlled practice' },
  { value: 'balanced_scaffold', label: 'Balanced scaffold' },
  { value: 'freer_production', label: 'Freer production' },
  { value: 'exam_style', label: 'Exam style' },
];
const PRESET_TEMPLATE_OPTIONS = [
  { value: 'grammar', label: 'Grammar' },
  { value: 'vocabulary', label: 'Vocabulary' },
  { value: 'reading', label: 'Reading' },
  { value: 'writing', label: 'Writing' },
  { value: 'speaking', label: 'Speaking' },
  { value: 'mixed', label: 'Mixed' },
];

const TASK_OPTIONS = TASK_REGISTRY
  .filter((entry) => !entry.hiddenFromLibrary)
  .map((entry) => ({
    type: entry.type,
    label: entry.label,
    category: entry.category,
    description: entry.description,
  }));

const SLIDE_OPTIONS = SLIDE_REGISTRY
  .filter((entry) => entry.type !== 'split_group')
  .map((entry) => ({
    type: entry.type,
    label: entry.label,
    layout: entry.layout,
  }));

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
    level: difficulty[0] || 'B1',
    description,
    hasInputContext: Boolean(title || lessonTopic || grammarTopic || description || focus.length),
  };
}

function buildInitialSetup(promptContext) {
  const primaryFocus = promptContext.focus[0] || 'grammar';
  const preset = PRESET_TEMPLATE_OPTIONS.some((entry) => entry.value === primaryFocus) ? primaryFocus : 'mixed';
  return {
    lessonTopic: promptContext.lessonTopic || promptContext.title || '',
    grammarTopic: promptContext.grammarTopic || '',
    focus: FOCUS_OPTIONS.includes(primaryFocus) ? primaryFocus : 'mixed',
    level: promptContext.level || 'B1',
    difficultyStyle: primaryFocus === 'grammar' ? 'controlled_practice' : 'balanced_scaffold',
    presetTemplate: preset,
    slideCount: 4,
    taskCount: 6,
    formatSlidesAsMarkdown: true,
    autoSelectTaskTypes: false,
    alwaysSuggestActivityIntent: true,
    excludeInputTextTasks: false,
    notes: promptContext.description || '',
    selectedSlideTypes: ['slide', 'two_column_text_task', 'image_task'],
    selectedTaskTypes: ['multiple_choice', 'drag_to_blank', 'cards'],
  };
}

function chipClass(active) {
  return active
    ? 'border-zinc-900 bg-zinc-900 text-white'
    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400';
}

function DismissibleAlert({ tone = 'neutral', children, onClose }) {
  const toneClass = tone === 'warning'
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : tone === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-sky-200 bg-sky-50 text-sky-800';

  return (
    <div className={`flex items-start gap-3 border px-3 py-2 text-xs ${toneClass}`}>
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 text-sm leading-none opacity-60 transition hover:opacity-100" aria-label="Dismiss">
          X
        </button>
      )}
    </div>
  );
}

function ToggleRow({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 transition hover:border-zinc-400">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 border border-zinc-300 accent-zinc-900" />
      <span>{label}</span>
    </label>
  );
}

function TypeSelector({ title, entries, selected, onToggle, helper }) {
  return (
    <div className="border border-zinc-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">{title}</div>
          {helper && <div className="mt-1 text-xs text-zinc-500">{helper}</div>}
        </div>
        <div className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500">{selected.length} selected</div>
      </div>
      <div className="mt-3 grid max-h-64 gap-2 overflow-auto pr-1 sm:grid-cols-2">
        {entries.map((entry) => {
          const active = selected.includes(entry.type);
          return (
            <label key={entry.type} className={`flex cursor-pointer items-start gap-2 border px-3 py-2 text-sm transition ${chipClass(active)}`}>
              <input type="checkbox" checked={active} onChange={() => onToggle(entry.type)} className="mt-0.5 h-4 w-4 border border-zinc-300 accent-zinc-900" />
              <span className="min-w-0">
                <span className="block font-medium">{entry.label}</span>
                {'category' in entry && entry.category && <span className={`mt-0.5 block text-[11px] ${active ? 'text-zinc-200' : 'text-zinc-400'}`}>{entry.category}</span>}
                {'layout' in entry && entry.layout && <span className={`mt-0.5 block text-[11px] ${active ? 'text-zinc-200' : 'text-zinc-400'}`}>{entry.layout}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function TemplatePreview({ selectedTaskTypes, selectedSlideTypes }) {
  const taskTemplates = selectedTaskTypes
    .map((type) => ({ type, template: getTaskTemplate(type) }))
    .filter((entry) => entry.template);
  const slideTemplates = selectedSlideTypes
    .map((type) => ({ type, template: getSlideTemplate(type) }))
    .filter((entry) => entry.template);

  const [expandedSection, setExpandedSection] = useState('tasks');

  return (
    <div className="border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
        <TemplateIcon />
        DSL template examples ({taskTemplates.length + slideTemplates.length} types)
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setExpandedSection('tasks')} className={`border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition ${expandedSection === 'tasks' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 text-zinc-500 hover:border-zinc-400'}`}>
          Tasks ({taskTemplates.length})
        </button>
        <button type="button" onClick={() => setExpandedSection('slides')} className={`border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition ${expandedSection === 'slides' ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 text-zinc-500 hover:border-zinc-400'}`}>
          Slides ({slideTemplates.length})
        </button>
      </div>

      <div className="mt-3 max-h-80 space-y-3 overflow-auto pr-1">
        {expandedSection === 'tasks' && taskTemplates.length === 0 && (
          <div className="text-xs text-zinc-400">Select task types to preview their DSL templates.</div>
        )}
        {expandedSection === 'tasks' && taskTemplates.map((entry) => (
          <div key={entry.type}>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{entry.type.replace(/_/g, ' ')}</div>
            <pre className="max-h-36 overflow-auto border border-zinc-200 bg-white p-2.5 text-[11px] leading-relaxed text-zinc-700">{entry.template.trim()}</pre>
          </div>
        ))}
        {expandedSection === 'slides' && slideTemplates.length === 0 && (
          <div className="text-xs text-zinc-400">Select slide types to preview their DSL templates.</div>
        )}
        {expandedSection === 'slides' && slideTemplates.map((entry) => (
          <div key={entry.type}>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">{entry.type.replace(/_/g, ' ')}</div>
            <pre className="max-h-36 overflow-auto border border-zinc-200 bg-white p-2.5 text-[11px] leading-relaxed text-zinc-700">{entry.template.trim()}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AiPanel({ onInsertDsl, lessonContext }) {
  const tokenAvailable = hasAiBridgeToken();
  const aiSettings = getAiBridgeSettings();
  const promptContext = useMemo(() => derivePromptContext(lessonContext), [lessonContext]);
  const [setup, setSetup] = useState(() => buildInitialSetup(promptContext));
  const [customPrompt, setCustomPrompt] = useState('');
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [result, setResult] = useState('');
  const [resultWarnings, setResultWarnings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [requestMeta, setRequestMeta] = useState(null);
  const [showServerNotice, setShowServerNotice] = useState(true);
  const [showParseNotice, setShowParseNotice] = useState(true);

  useEffect(() => {
    setSetup((current) => ({
      ...current,
      lessonTopic: current.lessonTopic || promptContext.lessonTopic || promptContext.title || '',
      grammarTopic: current.grammarTopic || promptContext.grammarTopic || '',
      focus: current.focus || promptContext.focus[0] || 'mixed',
      level: current.level || promptContext.level || 'B1',
      notes: current.notes || promptContext.description || '',
    }));
  }, [promptContext.description, promptContext.focus, promptContext.grammarTopic, promptContext.lessonTopic, promptContext.level, promptContext.title]);

  const selectedTaskLabels = useMemo(() => TASK_OPTIONS.filter((entry) => setup.selectedTaskTypes.includes(entry.type)).map((entry) => entry.label), [setup.selectedTaskTypes]);
  const promptPreview = useMemo(() => buildAiGenerationPrompt({
    title: promptContext.title || setup.lessonTopic,
    topic: setup.lessonTopic,
    grammarTopic: setup.grammarTopic,
    focus: setup.focus,
    level: setup.level,
    description: promptContext.description,
    taskTypeLabel: selectedTaskLabels.length > 0 ? selectedTaskLabels.join(', ') : 'a varied lesson task mix',
    taskTypes: setup.selectedTaskTypes,
    slideTypes: setup.selectedSlideTypes,
    slideCount: setup.slideCount,
    taskCount: setup.taskCount,
    count: setup.taskCount,
    presetTemplate: setup.presetTemplate,
    difficultyStyle: setup.difficultyStyle,
    formatSlidesAsMarkdown: setup.formatSlidesAsMarkdown,
    autoSelectTaskTypes: setup.autoSelectTaskTypes,
    alwaysSuggestActivityIntent: setup.alwaysSuggestActivityIntent,
    excludeInputTextTasks: setup.excludeInputTextTasks,
    notes: setup.notes,
    customPrompt: useCustomPrompt ? customPrompt : '',
  }), [customPrompt, promptContext.description, promptContext.title, selectedTaskLabels, setup]);

  const patchSetup = (updates) => setSetup((current) => ({ ...current, ...updates }));

  const toggleTaskType = (taskType) => {
    patchSetup({
      selectedTaskTypes: setup.selectedTaskTypes.includes(taskType)
        ? setup.selectedTaskTypes.filter((entry) => entry !== taskType)
        : [...setup.selectedTaskTypes, taskType],
    });
  };

  const toggleSlideType = (slideType) => {
    patchSetup({
      selectedSlideTypes: setup.selectedSlideTypes.includes(slideType)
        ? setup.selectedSlideTypes.filter((entry) => entry !== slideType)
        : [...setup.selectedSlideTypes, slideType],
    });
  };

  const handleGenerate = async () => {
    if (!useCustomPrompt && !setup.lessonTopic.trim() && !setup.grammarTopic.trim() && !promptContext.title) {
      setError('Add at least a lesson topic or grammar topic before generating.');
      return;
    }

    if (!promptPreview.trim()) {
      setError('The AI prompt is empty. Add setup details or a custom prompt first.');
      return;
    }

    setLoading(true);
    setError('');
    setResult('');
    setResultWarnings([]);
    setRequestMeta(null);

    try {
      const response = await generateAiText({ prompt: promptPreview });
      const normalized = normalizeAiGeneratedDsl(response.text, {
        existingTitle: promptContext.title || setup.lessonTopic || 'Untitled Lesson',
        existingSettings: {
          lessonTopic: setup.lessonTopic,
          grammarTopic: setup.grammarTopic,
          focus: [setup.focus],
          difficulty: [setup.level],
        },
      });
      setResult(normalized.dsl.trim());
      setResultWarnings(normalized.warnings || []);
      setShowParseNotice(true);
      setRequestMeta({
        provider: response.provider,
        model: response.model,
        blockCount: normalized.parsed?.blocks?.length || 0,
      });
    } catch (err) {
      setError(err.message || 'Failed to generate content.');
    } finally {
      setLoading(false);
    }
  };

  const handleInsert = () => {
    if (!result || !onInsertDsl) return;
    onInsertDsl(result);
    setResult('');
    setResultWarnings([]);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f7f4ee] text-zinc-900">
      <div className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <BrainIcon />
          <div>
            <div className="text-sm font-semibold">AI Lesson Builder</div>
            <div className="text-[11px] text-zinc-500">Structured setup, parser-safe DSL generation, and direct block insertion.</div>
          </div>
          <span className="ml-auto border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-zinc-500">
            {aiSettings.provider}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto grid max-w-7xl gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
          <div className="space-y-4">
            {!tokenAvailable && showServerNotice && (
              <DismissibleAlert tone="warning" onClose={() => setShowServerNotice(false)}>
                AI requests run through the app server proxy. If generation fails, verify the server-side AI token and proxy route.
              </DismissibleAlert>
            )}

            <div className="border border-zinc-200 bg-white p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => setUseCustomPrompt(false)} className={`border px-3 py-1.5 text-xs font-medium transition ${!useCustomPrompt ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'}`}>
                  Guided setup
                </button>
                <button type="button" onClick={() => setUseCustomPrompt(true)} className={`border px-3 py-1.5 text-xs font-medium transition ${useCustomPrompt ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'}`}>
                  Custom prompt
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm text-zinc-700">Lesson topic</span>
                  <input value={setup.lessonTopic} onChange={(event) => patchSetup({ lessonTopic: event.target.value })} className="w-full border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" placeholder="Daily routines" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm text-zinc-700">Grammar topic</span>
                  <input value={setup.grammarTopic} onChange={(event) => patchSetup({ grammarTopic: event.target.value })} className="w-full border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" placeholder="Present Simple" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm text-zinc-700">Focus</span>
                  <select value={setup.focus} onChange={(event) => patchSetup({ focus: event.target.value })} className="w-full border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900">
                    {FOCUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm text-zinc-700">Level</span>
                  <select value={setup.level} onChange={(event) => patchSetup({ level: event.target.value })} className="w-full border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900">
                    {LEVEL_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm text-zinc-700">Difficulty style</span>
                  <select value={setup.difficultyStyle} onChange={(event) => patchSetup({ difficultyStyle: event.target.value })} className="w-full border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900">
                    {DIFFICULTY_STYLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm text-zinc-700">Preset template</span>
                  <select value={setup.presetTemplate} onChange={(event) => patchSetup({ presetTemplate: event.target.value })} className="w-full border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900">
                    {PRESET_TEMPLATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm text-zinc-700">Number of slides</span>
                  <input type="number" min={1} max={12} value={setup.slideCount} onChange={(event) => patchSetup({ slideCount: Math.max(1, Math.min(12, Number(event.target.value) || 1)) })} className="w-full border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-sm text-zinc-700">Number of tasks</span>
                  <input type="number" min={1} max={24} value={setup.taskCount} onChange={(event) => patchSetup({ taskCount: Math.max(1, Math.min(24, Number(event.target.value) || 1)) })} className="w-full border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
                </label>
              </div>

              <div className="mt-4 grid gap-3">
                <ToggleRow checked={setup.formatSlidesAsMarkdown} onChange={(checked) => patchSetup({ formatSlidesAsMarkdown: checked })} label="Format slide text as Markdown." />
                <ToggleRow checked={setup.autoSelectTaskTypes} onChange={(checked) => patchSetup({ autoSelectTaskTypes: checked })} label="Auto-select task types. If enabled, the AI chooses the best task mix." />
                <ToggleRow checked={setup.alwaysSuggestActivityIntent} onChange={(checked) => patchSetup({ alwaysSuggestActivityIntent: checked })} label="Always suggest a task or activity intention for each slide." />
                <ToggleRow checked={setup.excludeInputTextTasks} onChange={(checked) => patchSetup({ excludeInputTextTasks: checked })} label="Exclude input-text tasks from the prompt and DSL examples." />
              </div>

              <label className="mt-4 block space-y-1.5">
                <span className="text-sm text-zinc-700">Teaching notes</span>
                <textarea value={setup.notes} onChange={(event) => patchSetup({ notes: event.target.value })} rows={4} className="w-full border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" placeholder="Desired context, vocabulary, learner constraints, pacing, or output expectations." />
              </label>

              {useCustomPrompt && (
                <label className="mt-4 block space-y-1.5">
                  <span className="text-sm text-zinc-700">Custom prompt</span>
                  <textarea value={customPrompt} onChange={(event) => setCustomPrompt(event.target.value)} rows={5} className="w-full border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" placeholder="Describe exactly what the AI should generate. The DSL rules and selected templates will still be included." />
                </label>
              )}
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <TypeSelector
                title="Slide types"
                entries={SLIDE_OPTIONS}
                selected={setup.selectedSlideTypes}
                onToggle={toggleSlideType}
                helper="Choose the structures you want the AI to include."
              />
              <TypeSelector
                title="Task types"
                entries={TASK_OPTIONS}
                selected={setup.selectedTaskTypes}
                onToggle={toggleTaskType}
                helper="Select the exercise formats the AI should prioritize."
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="border border-zinc-200 bg-white p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Slides</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-900">{setup.slideCount}</div>
                </div>
                <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Tasks</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-900">{setup.taskCount}</div>
                </div>
                <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Selected types</div>
                  <div className="mt-1 text-2xl font-semibold text-zinc-900">{setup.selectedTaskTypes.length + setup.selectedSlideTypes.length}</div>
                </div>
              </div>

              <div className="mt-4 rounded-none border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                <div className="flex items-center gap-2 font-medium text-zinc-700"><InfoCircleIcon /> Prompt preview</div>
                <div className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed">{promptPreview || 'Add lesson details to build the AI prompt.'}</div>
              </div>

              <button type="button" onClick={handleGenerate} disabled={loading || !tokenAvailable} className="mt-4 flex w-full items-center justify-center gap-2 border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50">
                {loading ? <span className="animate-pulse">Generating…</span> : <><WandIcon /><span>{tokenAvailable ? 'Generate Parser-Safe DSL' : 'Server AI Not Ready'}</span></>}
              </button>
            </div>

            <TemplatePreview selectedTaskTypes={setup.selectedTaskTypes} selectedSlideTypes={setup.selectedSlideTypes} />

            {error && <DismissibleAlert tone="error" onClose={() => setError('')}>{error}</DismissibleAlert>}

            {resultWarnings.length > 0 && showParseNotice && (
              <DismissibleAlert tone="warning" onClose={() => setShowParseNotice(false)}>
                The generated lesson was normalized before insertion. Parser notes: {resultWarnings[0]}{resultWarnings.length > 1 ? ` (+${resultWarnings.length - 1} more)` : ''}
              </DismissibleAlert>
            )}

            {result && (
              <div className="border border-zinc-200 bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">Generated DSL</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      {requestMeta?.provider && <span className="inline-flex items-center gap-1"><CheckIcon className="text-emerald-600" />{requestMeta.provider}</span>}
                      {requestMeta?.blockCount ? <span>{requestMeta.blockCount} blocks ready</span> : null}
                    </div>
                  </div>
                  <button type="button" onClick={handleInsert} className="border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700">
                    Review Merge
                  </button>
                </div>
                <pre className="mt-3 max-h-[28rem] overflow-auto border border-zinc-200 bg-zinc-50 p-3 text-[11px] text-zinc-700">{result}</pre>
              </div>
            )}

            {!result && (
              <div className="border border-dashed border-zinc-300 bg-white px-4 py-6 text-sm text-zinc-500">
                Generated lesson blocks will appear here as normalized DSL, ready to merge into the current lesson.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}