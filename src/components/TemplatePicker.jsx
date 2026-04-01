import { useState, useMemo } from 'react';
import { createLessonTemplate } from '../utils/builder';
import { parseLesson, generateDSL } from '../parser';
import { CloseIcon, TemplateIcon, TrashIcon } from './Icons';

const CUSTOM_TEMPLATES_KEY = 'lesson-flow-custom-templates';
function loadCustomTemplates() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_TEMPLATES_KEY) || '[]'); } catch { return []; }
}
function saveCustomTemplates(templates) {
  try {
    localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
  } catch {
    // Ignore storage write failures so the picker does not crash.
  }
}

const BUILTIN_TEMPLATES = [
  {
    id: 'blank',
    templateKind: 'blank',
    name: 'Blank Lesson',
    description: 'Start from scratch with an empty slide.',
    focus: 'general',
    difficulty: '',
    topic: 'General',
    cefr: '',
    gradeBand: 'Any',
    pack: 'Starter',
    color: 'bg-zinc-100 border-zinc-300 text-zinc-700',
  },
  {
    id: 'grammar-a1-basics',
    templateKind: 'grammar',
    name: 'Grammar Foundations (A1)',
    description: 'Sentence structure starter for present simple and basic routines.',
    focus: 'grammar',
    difficulty: 'A1',
    topic: 'Grammar',
    cefr: 'A1',
    gradeBand: 'Grade 4-6',
    pack: 'Core Grammar',
    color: 'bg-emerald-50 border-emerald-300 text-emerald-800',
    lessonTitle: 'Present Simple Foundations',
    grammarTopic: 'Present Simple',
    firstPrompt: 'Choose the correct verb form for each sentence.',
  },
  {
    id: 'grammar-b1-accuracy',
    templateKind: 'grammar',
    name: 'Grammar Accuracy Clinic (B1)',
    description: 'Error correction and precision-focused grammar check flow.',
    focus: 'grammar',
    difficulty: 'B1',
    topic: 'Grammar',
    cefr: 'B1',
    gradeBand: 'Grade 8-10',
    pack: 'Core Grammar',
    color: 'bg-emerald-50 border-emerald-300 text-emerald-800',
    lessonTitle: 'Grammar Accuracy Clinic',
    grammarTopic: 'Tense consistency',
    firstPrompt: 'Identify and correct the tense mistake in each item.',
  },
  {
    id: 'vocabulary-a2-school',
    templateKind: 'vocabulary',
    name: 'Vocabulary Builder (A2)',
    description: 'Classroom and routines vocabulary with scaffolded practice.',
    focus: 'vocabulary',
    difficulty: 'A2',
    topic: 'Vocabulary',
    cefr: 'A2',
    gradeBand: 'Grade 5-7',
    pack: 'Lexis Pack',
    color: 'bg-sky-50 border-sky-300 text-sky-800',
    lessonTitle: 'Daily Routines Vocabulary',
    firstPrompt: 'Choose the best vocabulary word for each routine.',
  },
  {
    id: 'vocabulary-b1-academic',
    templateKind: 'vocabulary',
    name: 'Academic Vocabulary (B1)',
    description: 'Higher-utility terms with context and quick retrieval tasks.',
    focus: 'vocabulary',
    difficulty: 'B1',
    topic: 'Vocabulary',
    cefr: 'B1',
    gradeBand: 'Grade 8-10',
    pack: 'Lexis Pack',
    color: 'bg-sky-50 border-sky-300 text-sky-800',
    lessonTitle: 'Academic Word Workshop',
    firstPrompt: 'Match each term to its best academic definition.',
  },
  {
    id: 'reading-b1-core',
    templateKind: 'reading',
    name: 'Reading Comprehension Core (B1)',
    description: 'Two-column text + highlight flow for inference and details.',
    focus: 'reading',
    difficulty: 'B1',
    topic: 'Reading',
    cefr: 'B1',
    gradeBand: 'Grade 7-9',
    pack: 'Reading Studio',
    color: 'bg-amber-50 border-amber-300 text-amber-800',
    lessonTitle: 'Reading Comprehension Core',
    firstPrompt: 'Highlight evidence that supports the main idea.',
  },
  {
    id: 'reading-b2-analysis',
    templateKind: 'reading',
    name: 'Reading Analysis (B2)',
    description: 'Deeper reading with claims-evidence framing and targeted checks.',
    focus: 'reading',
    difficulty: 'B2',
    topic: 'Reading',
    cefr: 'B2',
    gradeBand: 'Grade 9-12',
    pack: 'Reading Studio',
    color: 'bg-amber-50 border-amber-300 text-amber-800',
    lessonTitle: 'Reading Analysis Lab',
    firstPrompt: 'Find and mark the strongest evidence for each claim.',
  },
  {
    id: 'speaking-b1-discussion',
    templateKind: 'blank',
    name: 'Speaking Discussion Loop (B1)',
    description: 'Prompt-driven speaking checks with confidence calibration.',
    focus: 'speaking',
    difficulty: 'B1',
    topic: 'Speaking',
    cefr: 'B1',
    gradeBand: 'Grade 8-10',
    pack: 'Speaking & Discussion',
    color: 'bg-orange-50 border-orange-300 text-orange-800',
    lessonTitle: 'Speaking Discussion Loop',
    firstPrompt: 'Choose a position and explain your reasoning in 2-3 sentences.',
  },
  {
    id: 'exam-mixed-b2',
    templateKind: 'reading',
    name: 'Exam Mix Warm-up (B2)',
    description: 'Mixed skills rehearsal template for timed exam prep sessions.',
    focus: 'mixed',
    difficulty: 'B2',
    topic: 'Exam Prep',
    cefr: 'B2',
    gradeBand: 'Grade 10-12',
    pack: 'Assessment Prep',
    color: 'bg-indigo-50 border-indigo-300 text-indigo-800',
    lessonTitle: 'Exam Mix Warm-up',
    firstPrompt: 'Answer quickly, then justify the choice with one evidence phrase.',
  },
  {
    id: 'catalog',
    templateKind: 'catalog',
    name: 'Full Catalog',
    description: 'All slide and task types in one lesson. Great for exploration and testing.',
    focus: 'mixed',
    difficulty: 'B1',
    topic: 'Mixed',
    cefr: 'B1',
    gradeBand: 'Any',
    pack: 'Reference',
    color: 'bg-violet-50 border-violet-300 text-violet-800',
  },
];

function buildTemplateLesson(definition) {
  const baseLesson = createLessonTemplate(definition.templateKind || 'blank');
  const blocks = Array.isArray(baseLesson.blocks) ? [...baseLesson.blocks] : [];
  const firstTaskIndex = blocks.findIndex((entry) => entry.type === 'task');

  if (firstTaskIndex >= 0 && definition.firstPrompt) {
    blocks[firstTaskIndex] = {
      ...blocks[firstTaskIndex],
      question: definition.firstPrompt,
    };
  }

  if (blocks.length > 0 && definition.topic) {
    const firstBlock = blocks[0];
    if (firstBlock.type !== 'task') {
      blocks[0] = {
        ...firstBlock,
        title: firstBlock.title || `${definition.topic} kickoff`,
        content: firstBlock.content || `## ${definition.topic}\nFocus: ${definition.focus || 'general'} · Level: ${definition.difficulty || 'mixed'}`,
      };
    }
  }

  return {
    ...baseLesson,
    title: definition.lessonTitle || baseLesson.title,
    settings: {
      ...(baseLesson.settings || {}),
      focus: definition.focus || baseLesson.settings?.focus || '',
      difficulty: definition.difficulty || baseLesson.settings?.difficulty || '',
      lessonTopic: definition.topic || baseLesson.settings?.lessonTopic || '',
      grammarTopic: definition.grammarTopic || baseLesson.settings?.grammarTopic || '',
      gradeBand: definition.gradeBand || baseLesson.settings?.gradeBand || '',
    },
    blocks,
  };
}

function MiniBlockBadge({ block }) {
  const label = block.type === 'task' ? (block.taskType || 'task') : block.type;
  const isTask = block.type === 'task';
  const isGroup = block.type === 'group' || block.type === 'split_group';
  return (
    <span className={[
      'inline-block px-1.5 py-0.5 text-[10px] font-medium truncate max-w-[120px]',
      isTask ? 'bg-zinc-100 text-zinc-600' : isGroup ? 'bg-zinc-200 text-zinc-700' : 'bg-zinc-50 text-zinc-500',
    ].join(' ')}>
      {label.replace(/_/g, ' ')}
    </span>
  );
}

function TemplatePreviewPanel({ template, parsed, onUse, onClose }) {
  const blocks = parsed?.blocks || [];
  const slideCount = blocks.filter(b => b.type !== 'task' && b.type !== 'group' && b.type !== 'split_group').length;
  const taskCount = blocks.filter(b => b.type === 'task').length;
  const groupCount = blocks.filter(b => b.type === 'group' || b.type === 'split_group').length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-zinc-900">{template.name}</h3>
          {template.description && <p className="mt-0.5 truncate text-xs text-zinc-500">{template.description}</p>}
        </div>
        <button type="button" onClick={onClose} className="shrink-0 p-1 text-zinc-400 hover:text-zinc-900">
          <CloseIcon />
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-100 px-5 py-2.5">
        <span className="text-xs text-zinc-500">{slideCount} slide{slideCount !== 1 ? 's' : ''}</span>
        <span className="text-xs text-zinc-300">·</span>
        <span className="text-xs text-zinc-500">{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
        {groupCount > 0 && <>
          <span className="text-xs text-zinc-300">·</span>
          <span className="text-xs text-zinc-500">{groupCount} group{groupCount !== 1 ? 's' : ''}</span>
        </>}
        {template.focus && template.focus !== 'general' && <>
          <span className="text-xs text-zinc-300">·</span>
          <span className="text-xs font-medium capitalize text-zinc-600">{template.focus}</span>
        </>}
        {template.difficulty && <>
          <span className="text-xs text-zinc-300">·</span>
          <span className="text-[10px] font-bold text-zinc-600 border border-zinc-300 px-1 py-0.5">{template.difficulty}</span>
        </>}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">Block structure</div>
        {blocks.length === 0 ? (
          <p className="text-sm text-zinc-400">No blocks in this template.</p>
        ) : (
          <div className="space-y-1.5">
            {blocks.map((block, i) => {
              const isGroup = block.type === 'group' || block.type === 'split_group';
              return (
                <div key={block.id || i} className="border border-zinc-100 bg-zinc-50 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-zinc-200 text-[10px] font-bold text-zinc-600">{i + 1}</span>
                    <MiniBlockBadge block={block} />
                    {(block.title || block.question) && (
                      <span className="min-w-0 truncate text-xs text-zinc-600">{block.title || block.question}</span>
                    )}
                  </div>
                  {isGroup && block.children?.length > 0 && (
                    <div className="mt-1.5 ml-7 flex flex-wrap gap-1">
                      {block.children.map((child, ci) => (
                        <MiniBlockBadge key={child.id || ci} block={child} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-zinc-200 px-5 py-3">
        <button type="button" onClick={onUse} className="w-full border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800">
          Use this template
        </button>
      </div>
    </div>
  );
}

export default function TemplatePicker({ onSelect, onClose }) {
  const [customTemplates, setCustomTemplates] = useState(loadCustomTemplates);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState('builtin');
  const [topicFilter, setTopicFilter] = useState('all');
  const [cefrFilter, setCefrFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');

  const templates = useMemo(() => {
    const builtins = BUILTIN_TEMPLATES.map((t) => {
      const lesson = buildTemplateLesson(t);
      let dsl = '';
      try {
        dsl = generateDSL(lesson);
      } catch {
        dsl = '';
      }
      return { ...t, parsed: lesson, dsl, isCustom: false };
    });
    const customs = customTemplates.map((t) => {
      let parsed;
      try { parsed = parseLesson(t.dsl); } catch { parsed = { blocks: [] }; }
      return {
        id: `custom-${t.id}`,
        customId: t.id,
        name: t.name,
        description: `Custom template · ${new Date(t.createdAt).toLocaleDateString()}`,
        focus: '',
        difficulty: '',
        color: 'bg-rose-50 border-rose-200 text-rose-700',
        parsed,
        isCustom: true,
        dsl: t.dsl,
      };
    });
    return { builtins, customs };
  }, [customTemplates]);

  const builtinTopics = useMemo(() => {
    return ['all', ...new Set(templates.builtins.map((entry) => entry.topic).filter(Boolean))];
  }, [templates.builtins]);

  const builtinCefrLevels = useMemo(() => {
    return ['all', ...new Set(templates.builtins.map((entry) => entry.cefr).filter(Boolean))];
  }, [templates.builtins]);

  const builtinGrades = useMemo(() => {
    return ['all', ...new Set(templates.builtins.map((entry) => entry.gradeBand).filter(Boolean))];
  }, [templates.builtins]);

  const filteredBuiltins = useMemo(() => {
    return templates.builtins.filter((entry) => {
      const topicMatches = topicFilter === 'all' || entry.topic === topicFilter;
      const cefrMatches = cefrFilter === 'all' || entry.cefr === cefrFilter;
      const gradeMatches = gradeFilter === 'all' || entry.gradeBand === gradeFilter;
      return topicMatches && cefrMatches && gradeMatches;
    });
  }, [cefrFilter, gradeFilter, templates.builtins, topicFilter]);

  const visibleTemplates = tab === 'builtin' ? filteredBuiltins : templates.customs;
  const selected = visibleTemplates.find(t => t.id === selectedId);

  const handleUse = () => {
    if (!selected) return;
    onSelect(selected.id.startsWith('custom-') ? selected.customId : selected.id, selected.dsl || null);
    onClose();
  };

  const deleteCustom = (customId) => {
    const next = customTemplates.filter(t => t.id !== customId);
    saveCustomTemplates(next);
    setCustomTemplates(next);
    if (selectedId === `custom-${customId}`) setSelectedId(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-full max-h-[680px] w-full max-w-[900px] flex-col overflow-hidden border border-zinc-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.15)] sm:h-[80vh]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <TemplateIcon size={18} />
            <h2 className="text-lg font-semibold text-zinc-900">Choose a template</h2>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-900">
            <CloseIcon />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 gap-0 border-b border-zinc-200">
          <button type="button" onClick={() => { setTab('builtin'); setSelectedId(null); }} className={[
            'px-5 py-2.5 text-sm font-medium transition',
            tab === 'builtin' ? 'border-b-2 border-zinc-900 text-zinc-900' : 'text-zinc-500 hover:text-zinc-700',
          ].join(' ')}>
            Built-in ({templates.builtins.length})
          </button>
          <button type="button" onClick={() => { setTab('custom'); setSelectedId(null); }} className={[
            'px-5 py-2.5 text-sm font-medium transition',
            tab === 'custom' ? 'border-b-2 border-zinc-900 text-zinc-900' : 'text-zinc-500 hover:text-zinc-700',
          ].join(' ')}>
            My Templates ({templates.customs.length})
          </button>
        </div>

        {tab === 'builtin' && (
          <div className="grid shrink-0 gap-2 border-b border-zinc-200 px-5 py-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Topic pack</span>
              <select value={topicFilter} onChange={(event) => setTopicFilter(event.target.value)} className="w-full border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-700 outline-none focus:border-zinc-900">
                {builtinTopics.map((entry) => <option key={entry} value={entry}>{entry === 'all' ? 'All topics' : entry}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">CEFR level</span>
              <select value={cefrFilter} onChange={(event) => setCefrFilter(event.target.value)} className="w-full border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-700 outline-none focus:border-zinc-900">
                {builtinCefrLevels.map((entry) => <option key={entry} value={entry}>{entry === 'all' ? 'All CEFR' : entry}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Grade band</span>
              <select value={gradeFilter} onChange={(event) => setGradeFilter(event.target.value)} className="w-full border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-700 outline-none focus:border-zinc-900">
                {builtinGrades.map((entry) => <option key={entry} value={entry}>{entry === 'all' ? 'All grades' : entry}</option>)}
              </select>
            </label>
          </div>
        )}

        {/* Content: grid + preview */}
        <div className="flex min-h-0 flex-1">
          {/* Template grid */}
          <div className={[
            'min-h-0 overflow-auto p-4',
            selected ? 'hidden sm:block sm:w-1/2 sm:border-r sm:border-zinc-200' : 'w-full',
          ].join(' ')}>
            {visibleTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-2 text-sm text-zinc-400">No custom templates yet</div>
                <div className="text-xs text-zinc-400">Save a lesson as a template from the editor menu.</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {visibleTemplates.map(t => {
                  const blocks = t.parsed?.blocks || [];
                  const slideCount = blocks.filter(b => b.type !== 'task' && b.type !== 'group' && b.type !== 'split_group').length;
                  const taskCount = blocks.filter(b => b.type === 'task').length;
                  const isSelected = selectedId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedId(isSelected ? null : t.id)}
                      onDoubleClick={() => { setSelectedId(t.id); setTimeout(handleUse, 0); }}
                      className={[
                        'group relative border p-4 text-left transition',
                        isSelected ? 'border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900' : 'border-zinc-200 bg-white hover:border-zinc-400 hover:shadow-sm',
                      ].join(' ')}
                    >
                      {t.isCustom && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteCustom(t.customId); }}
                          className="absolute right-2 top-2 hidden p-1 text-zinc-300 hover:text-red-500 group-hover:block"
                          title="Delete template"
                        >
                          <TrashIcon width={14} height={14} />
                        </button>
                      )}
                      <div className={[
                        'mb-2 inline-block border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                        t.color,
                      ].join(' ')}>
                        {t.pack || t.focus || 'custom'}
                      </div>
                      <h3 className="mb-1 text-sm font-semibold text-zinc-900">{t.name}</h3>
                      <p className="mb-3 text-xs text-zinc-500 line-clamp-2">{t.description}</p>
                      <div className="flex flex-wrap gap-1">
                        <span className="bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">{slideCount} slide{slideCount !== 1 ? 's' : ''}</span>
                        <span className="bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
                        {t.difficulty && <span className="border border-zinc-300 px-1 py-0.5 text-[10px] font-bold text-zinc-600">{t.difficulty}</span>}
                        {!t.isCustom && t.topic && <span className="bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">{t.topic}</span>}
                        {!t.isCustom && t.gradeBand && <span className="bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">{t.gradeBand}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview panel (desktop) */}
          {selected && (
            <div className="hidden min-h-0 sm:flex sm:w-1/2 sm:flex-col sm:border-l sm:border-zinc-200">
              <TemplatePreviewPanel template={selected} parsed={selected.parsed} onUse={handleUse} onClose={() => setSelectedId(null)} />
            </div>
          )}

          {/* Preview panel (mobile — full overlay) */}
          {selected && (
            <div className="fixed inset-0 z-60 flex flex-col bg-white sm:hidden">
              <TemplatePreviewPanel template={selected} parsed={selected.parsed} onUse={handleUse} onClose={() => setSelectedId(null)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
