import { useEffect, useMemo, useState } from 'react';
import { TASK_REGISTRY, getTaskDefinition } from '../config/taskRegistry';
import TaskRenderer from './TaskRenderer';
import BlockEditorForm from './BlockEditorForm';
import { createDefaultBlock, getTaskCategories, getTaskDslExample } from '../utils/builder';
import useFavorites from '../hooks/useFavorites';
import { TaskTypeIcon, KindChoiceIcon, KindTextIcon, KindPairsIcon, KindCollectionIcon, KindGridIcon, KindMediaIcon, KindBranchIcon } from './Icons';

function MiniTaskTypeIcon({ kind, taskType }) {
  if (taskType) return <TaskTypeIcon taskType={taskType} width={16} height={16} className="h-4 w-4 text-zinc-500" />;
  const cls = 'h-4 w-4 text-zinc-500';
  if (kind === 'choice') return <KindChoiceIcon className={cls} />;
  if (kind === 'text') return <KindTextIcon className={cls} />;
  if (kind === 'pairs') return <KindPairsIcon className={cls} />;
  if (kind === 'collection') return <KindCollectionIcon className={cls} />;
  if (kind === 'grid') return <KindGridIcon className={cls} />;
  if (kind === 'media') return <KindMediaIcon className={cls} />;
  if (kind === 'branch') return <KindBranchIcon className={cls} />;
  return <KindTextIcon className={cls} />;
}

function MiniTaskTypePreview({ definition }) {
  if (definition.kind === 'choice') {
    return (
      <div className="border border-zinc-200 bg-white p-2">
        <div className="mb-2 h-2 w-1/2 bg-zinc-900" />
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full border border-zinc-400" />
              <div className="h-2 flex-1 bg-zinc-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (definition.kind === 'text') {
    return (
      <div className="border border-zinc-200 bg-white p-2">
        <div className="mb-2 h-2 w-1/2 bg-zinc-900" />
        <div className="mb-3 h-2 w-full bg-zinc-200" />
        <div className="space-y-2">
          {[0, 1, 2].map((index) => <div key={index} className="h-7 border border-zinc-300 bg-zinc-50" />)}
        </div>
      </div>
    );
  }

  if (definition.kind === 'pairs') {
    return (
      <div className="grid grid-cols-2 gap-2 border border-zinc-200 bg-white p-2">
        {[0, 1, 2, 3].map((index) => <div key={index} className="h-8 border border-zinc-200 bg-zinc-50" />)}
      </div>
    );
  }

  if (definition.kind === 'collection') {
    return (
      <div className="border border-zinc-200 bg-white p-2">
        <div className="mb-2 h-2 w-1/2 bg-zinc-900" />
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((index) => <div key={index} className="h-6 w-[calc(50%-0.25rem)] border border-zinc-200 bg-zinc-50" />)}
        </div>
      </div>
    );
  }

  if (definition.kind === 'grid') {
    return (
      <div className="grid h-24 grid-cols-3 gap-1 border border-zinc-200 bg-white p-2">
        {Array.from({ length: 9 }).map((_, index) => <div key={index} className="border border-zinc-200 bg-zinc-50" />)}
      </div>
    );
  }

  if (definition.kind === 'media') {
    return (
      <div className="grid h-24 grid-cols-[1.1fr_0.9fr] gap-2 border border-zinc-200 bg-white p-2">
        <div className="border border-zinc-200 bg-zinc-50" />
        <div className="space-y-2">
          <div className="h-2 w-1/2 bg-zinc-900" />
          <div className="h-2 w-full bg-zinc-200" />
          <div className="h-2 w-5/6 bg-zinc-200" />
          <div className="mt-3 h-7 border border-zinc-300 bg-zinc-50" />
        </div>
      </div>
    );
  }

  if (definition.kind === 'branch') {
    return (
      <div className="border border-zinc-200 bg-white p-2">
        <div className="mb-2 h-2 w-1/2 bg-zinc-900" />
        <div className="space-y-2">
          <div className="h-8 border border-zinc-200 bg-zinc-50" />
          <div className="h-8 border border-zinc-200 bg-zinc-50" />
          <div className="h-8 border border-dashed border-zinc-300 bg-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="border border-zinc-200 bg-white p-2">
      <div className="mb-2 h-2 w-1/2 bg-zinc-900" />
      <div className="space-y-2">
        <div className="h-2 w-full bg-zinc-200" />
        <div className="h-2 w-5/6 bg-zinc-200" />
        <div className="h-2 w-2/3 bg-zinc-200" />
      </div>
    </div>
  );
}

function MiniPreview({ definition, selectedOrder, showDescription }) {
  return (
    <div className="border border-zinc-200 bg-white p-3 text-left transition group-hover:border-zinc-900">
      <div className="mb-3 overflow-hidden">
        <MiniTaskTypePreview definition={definition} />
      </div>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{definition.category}</div>
          <div className="mt-1 text-sm font-medium text-zinc-900">{definition.label}</div>
        </div>
        {selectedOrder > 0 && <span className="flex h-6 w-6 items-center justify-center border border-zinc-900 bg-zinc-900 text-xs font-semibold text-white">{selectedOrder}</span>}
      </div>
      {showDescription && <div className="text-xs text-zinc-600">{definition.description}</div>}
    </div>
  );
}

export default function AddTaskModal({ isOpen, onClose, onConfirm, initialType = 'multiple_choice' }) {
  const categories = useMemo(() => ['All', '★ Favorites', ...getTaskCategories()], []);
  const { favorites, toggle: toggleFavorite, isFavorite } = useFavorites();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [queue, setQueue] = useState([initialType]);
  const [activeType, setActiveType] = useState(initialType);
  const [drafts, setDrafts] = useState(() => ({ [initialType]: createDefaultBlock(initialType) }));
  const [showDescriptions, setShowDescriptions] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setCategory('All');
    setQueue([initialType]);
    setActiveType(initialType);
    setDrafts({ [initialType]: createDefaultBlock(initialType) });
  }, [initialType, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return TASK_REGISTRY.filter((entry) => {
      if (entry.hiddenFromLibrary) return false;
      const matchesCategory = category === 'All' || (category === '★ Favorites' ? favorites.includes(entry.type) : entry.category === category);
      const haystack = [entry.label, entry.type, entry.category, ...(entry.keywords || [])].join(' ').toLowerCase();
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [category, favorites, query]);

  const activeDraft = drafts[activeType] || createDefaultBlock(activeType);

  if (!isOpen) return null;

  const updateDraft = (type, nextBlock) => {
    setDrafts((current) => ({ ...current, [type]: nextBlock }));
  };

  const toggleType = (type) => {
    setDrafts((current) => current[type] ? current : { ...current, [type]: createDefaultBlock(type) });
    setQueue((current) => current.includes(type) ? current.filter((entry) => entry !== type) : [...current, type]);
    setActiveType(type);
  };

  const handleConfirm = () => {
    const blocks = queue.map((type) => drafts[type] || createDefaultBlock(type));
    onConfirm(blocks);
    onClose();
  };

  const handleInstantAdd = (type) => {
    onConfirm([createDefaultBlock(type)]);
    onClose();
  };

  /* ───── Mobile bottom sheet (<sm) ───── */
  const mobileSheet = (
    <div className="fixed inset-0 z-50 sm:hidden" role="dialog" aria-modal="true" aria-label="Add task">
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col border-t border-zinc-900 bg-white animate-slide-up [padding-bottom:env(safe-area-inset-bottom)]">
        {/* Drag handle */}
        <div className="flex justify-center py-2">
          <div className="h-1 w-10 bg-zinc-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 pb-3">
          <div className="text-sm font-semibold text-zinc-900">Task Library</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowDescriptions((value) => !value)} className={showDescriptions ? 'border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white' : 'border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700'}>Descriptions</button>
            <button type="button" onClick={onClose} className="border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700">Close</button>
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-zinc-200 px-4 py-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks…"
            className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
          />
        </div>

        {/* Horizontal scrolling category tabs */}
        <div className="scrollbar-none flex shrink-0 gap-1.5 overflow-x-auto border-b border-zinc-200 px-4 py-3">
          {categories.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setCategory(entry)}
              className={`shrink-0 px-4 py-2.5 text-sm font-medium whitespace-nowrap ${category === entry ? 'border border-zinc-900 bg-zinc-900 text-white' : 'border border-zinc-200 text-zinc-600'}`}
            >
              {entry}
            </button>
          ))}
        </div>

        {/* Task list — compact single column */}
        <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
          {filtered.length === 0 && <div className="py-8 text-center text-xs text-zinc-400">No tasks found</div>}
          <div className="space-y-1.5">
            {filtered.map((entry) => (
              <div key={entry.type} className="flex items-center gap-3 border border-zinc-200 bg-white p-3 active:bg-zinc-50">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-zinc-200 bg-zinc-50">
                  <MiniTaskTypeIcon kind={entry.kind} taskType={entry.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-900">{entry.label}</div>
                  <div className="truncate text-[11px] text-zinc-500">{entry.category}</div>
                  {showDescriptions && <div className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{entry.description}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => { toggleFavorite(entry.type); }}
                  className={`shrink-0 text-sm ${isFavorite(entry.type) ? 'text-amber-500' : 'text-zinc-300'}`}
                >
                  {isFavorite(entry.type) ? '★' : '☆'}
                </button>
                <button
                  type="button"
                  onClick={() => handleInstantAdd(entry.type)}
                  className="shrink-0 border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white"
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  /* ───── Desktop full-screen modal (sm+) ───── */
  const desktopModal = (
    <div className="fixed inset-0 z-50 hidden bg-black/40 p-2 backdrop-blur-sm sm:block sm:p-4" role="dialog" aria-modal="true" aria-label="Add task">
      <div className="mx-auto grid h-[calc(100vh-1rem)] max-w-7xl grid-cols-1 overflow-hidden border border-zinc-900 bg-[#f7f7f5] sm:h-[calc(100vh-2rem)] lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col border-b border-zinc-200 bg-white lg:border-b-0 lg:border-r">
          <div className="border-b border-zinc-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Task Library</div>
                <div className="mt-1 text-lg font-semibold text-zinc-950">Add Question</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowDescriptions((value) => !value)} className={showDescriptions ? 'border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs font-medium text-white' : 'border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700'}>Descriptions</button>
                <button type="button" onClick={onClose} className="border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700">Close</button>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or category" className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900" />
              <div className="flex flex-wrap gap-2">
                {categories.map((entry) => (
                  <button key={entry} type="button" onClick={() => setCategory(entry)} className={category === entry ? 'border border-zinc-900 bg-zinc-900 px-3 py-1 text-xs font-medium text-white' : 'border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700'}>{entry}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((entry) => {
                const order = queue.indexOf(entry.type) + 1;
                return (
                  <div key={entry.type} className="group relative">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(entry.type); }}
                      className={`absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center text-sm transition ${isFavorite(entry.type) ? 'text-amber-500' : 'text-zinc-300 opacity-0 group-hover:opacity-100'}`}
                      title={isFavorite(entry.type) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      {isFavorite(entry.type) ? '★' : '☆'}
                    </button>
                    <button type="button" draggable onDragStart={(event) => event.dataTransfer.setData('application/x-task-type', entry.type)} onClick={() => toggleType(entry.type)} className={[
                      'w-full border text-left transition',
                      activeType === entry.type ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 bg-white hover:border-zinc-900',
                    ].join(' ')}>
                      <MiniPreview definition={entry} selectedOrder={order} showDescription={showDescriptions} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="border-t border-zinc-200 p-4">
            <div className="mb-3 flex items-center justify-between text-sm text-zinc-700">
              <span>{queue.length} selected</span>
              <span>{getTaskDefinition(activeType).label}</span>
            </div>
            <button type="button" onClick={handleConfirm} className="w-full border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm font-medium text-white">Add Selected Tasks</button>
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-h-0 overflow-auto border-r border-zinc-200 bg-[#fcfcfb] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Selected Type</div>
                <h3 className="mt-1 text-2xl font-semibold text-zinc-950">{getTaskDefinition(activeType).label}</h3>
                <p className="mt-2 max-w-2xl text-sm text-zinc-600">{getTaskDefinition(activeType).description}</p>
              </div>
              <div className="border border-zinc-200 px-3 py-2 text-xs text-zinc-600">#{queue.indexOf(activeType) + 1 || 1}</div>
            </div>
            <div className="mt-5 border border-zinc-200 bg-white p-5">
              <TaskRenderer block={activeDraft} onComplete={() => {}} />
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <section className="border border-zinc-200 bg-white p-4">
                <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Task Fields</div>
                <BlockEditorForm block={activeDraft} compact onChange={(nextBlock) => updateDraft(activeType, nextBlock)} />
              </section>
              <section className="border border-zinc-200 bg-white p-4">
                <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">DSL Example</div>
                <pre className="overflow-auto whitespace-pre-wrap bg-zinc-50 p-4 text-xs leading-6 text-zinc-700">{getTaskDslExample(activeType)}</pre>
              </section>
            </div>
          </div>

          <aside className="min-h-0 overflow-auto bg-white p-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Selection Queue</div>
            <div className="mt-4 space-y-3">
              {queue.map((type, index) => {
                const definition = getTaskDefinition(type);
                return (
                  <button key={`${type}-${index}`} type="button" onClick={() => setActiveType(type)} className={activeType === type ? 'w-full border border-zinc-900 bg-zinc-900 p-3 text-left text-white' : 'w-full border border-zinc-200 p-3 text-left text-zinc-700'}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">{definition.category}</div>
                        <div className="mt-1 text-sm font-medium">{definition.label}</div>
                      </div>
                      <span className="border border-current px-2 py-0.5 text-[10px]">{index + 1}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {mobileSheet}
      {desktopModal}
    </>
  );
}
