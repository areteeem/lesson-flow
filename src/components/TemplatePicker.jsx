import { useState, useMemo } from 'react';
import { createLessonTemplate } from '../utils/builder';
import { parseLesson, generateDSL } from '../parser';
import { CloseIcon, TemplateIcon, TrashIcon } from './Icons';

const CUSTOM_TEMPLATES_KEY = 'lesson-flow-custom-templates';
function loadCustomTemplates() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_TEMPLATES_KEY) || '[]'); } catch { return []; }
}
function saveCustomTemplates(templates) {
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
}

const BUILTIN_TEMPLATES = [
  {
    id: 'blank',
    name: 'Blank Lesson',
    description: 'Start from scratch with an empty slide.',
    focus: 'general',
    difficulty: '',
    color: 'bg-zinc-100 border-zinc-300 text-zinc-700',
  },
  {
    id: 'grammar',
    name: 'Grammar Lesson',
    description: 'Structure slide + multiple choice task. Ready for grammar drills.',
    focus: 'grammar',
    difficulty: 'A2',
    color: 'bg-emerald-50 border-emerald-300 text-emerald-800',
  },
  {
    id: 'vocabulary',
    name: 'Vocabulary Lesson',
    description: 'Vocab slide + flashcards task. Perfect for word study sessions.',
    focus: 'vocabulary',
    difficulty: 'A2',
    color: 'bg-sky-50 border-sky-300 text-sky-800',
  },
  {
    id: 'reading',
    name: 'Reading Lesson',
    description: 'Two-column layout + highlight task. Designed for reading comprehension.',
    focus: 'reading',
    difficulty: 'B1',
    color: 'bg-amber-50 border-amber-300 text-amber-800',
  },
  {
    id: 'catalog',
    name: 'Full Catalog',
    description: 'All slide and task types in one lesson. Great for exploration and testing.',
    focus: 'mixed',
    difficulty: 'B1',
    color: 'bg-violet-50 border-violet-300 text-violet-800',
  },
];

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

  const templates = useMemo(() => {
    const builtins = BUILTIN_TEMPLATES.map(t => {
      const lesson = createLessonTemplate(t.id);
      return { ...t, parsed: lesson, isCustom: false };
    });
    const customs = customTemplates.map(t => {
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

  const visibleTemplates = tab === 'builtin' ? templates.builtins : templates.customs;
  const selected = visibleTemplates.find(t => t.id === selectedId);

  const handleUse = () => {
    if (!selected) return;
    onSelect(selected.id.startsWith('custom-') ? selected.customId : selected.id, selected.isCustom ? selected.dsl : null);
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
                        {t.focus || 'custom'}
                      </div>
                      <h3 className="mb-1 text-sm font-semibold text-zinc-900">{t.name}</h3>
                      <p className="mb-3 text-xs text-zinc-500 line-clamp-2">{t.description}</p>
                      <div className="flex flex-wrap gap-1">
                        <span className="bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">{slideCount} slide{slideCount !== 1 ? 's' : ''}</span>
                        <span className="bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-600">{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
                        {t.difficulty && <span className="border border-zinc-300 px-1 py-0.5 text-[10px] font-bold text-zinc-600">{t.difficulty}</span>}
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
