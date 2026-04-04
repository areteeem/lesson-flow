import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SLIDE_REGISTRY } from '../config/slideRegistry';
import { TASK_REGISTRY, getTaskDefinition } from '../config/taskRegistry';
import { addBlockToGroup, cloneBlockTree, createDefaultBlock, deleteBlockFromTree, findBlockById, getTaskCategories, reorderChildrenInGroup, updateBlockField, updateBlockInTree } from '../utils/builder';
import { createRephraseVariants, hasAiBridgeToken } from '../utils/aiBridge';
import { flattenBlocks, getBlockLabel } from '../utils/lesson';
import useFavorites from '../hooks/useFavorites';
import { Md } from './FormattedText';
import AddTaskModal from './AddTaskModal';
import BlockEditorForm from './BlockEditorForm';
import { DragHandleIcon as DragHandleIconSharp, PlusIcon as PlusIconSharp, TrashIcon as TrashIconSharp, ChevronUpIcon, ChevronDownIcon } from './Icons';
const BlockPreview = lazy(() => import('./BlockPreview'));

function DragHandleIcon({ className = '' }) {
  return <DragHandleIconSharp className={className} />;
}

function PlusIcon({ className = '' }) {
  return <PlusIconSharp className={className} width={16} height={16} />;
}

function TrashIcon({ className = '' }) {
  return <TrashIconSharp className={className} width={16} height={16} />;
}

function ChevronIcon({ direction = 'up', className = '' }) {
  return direction === 'up' ? <ChevronUpIcon className={className} width={16} height={16} /> : <ChevronDownIcon className={className} width={16} height={16} />;
}

function IconActionButton({ title, onClick, children, className = '', disabled = false }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        'inline-flex h-9 w-9 items-center justify-center border border-current transition disabled:cursor-not-allowed disabled:opacity-30',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function handleSelectableCardKeyDown(event, onActivate) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onActivate();
}

function QuickAddDivider({ onAddTask, onAddSlide, onAddGroup }) {
  return (
    <div className="group relative flex h-7 items-center justify-center">
      <div className="h-px w-full bg-zinc-200 transition group-hover:bg-zinc-400" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition duration-150 group-hover:opacity-100">
        <div className="pointer-events-auto inline-flex items-center gap-1 border border-zinc-300 bg-white/95 px-1.5 py-0.5 text-[10px] shadow-sm backdrop-blur-sm">
          <button type="button" onClick={onAddTask} className="border border-zinc-200 px-1.5 py-0.5 text-zinc-700 transition hover:border-zinc-900">+ Task</button>
          <button type="button" onClick={onAddSlide} className="border border-zinc-200 px-1.5 py-0.5 text-zinc-700 transition hover:border-zinc-900">+ Slide</button>
          <button type="button" onClick={onAddGroup} className="border border-zinc-200 px-1.5 py-0.5 text-zinc-700 transition hover:border-zinc-900">+ Group</button>
        </div>
      </div>
    </div>
  );
}

function QualityRing({ score, checks, onFix }) {
  const normalized = Math.max(0, Math.min(100, Number(score) || 0));
  const radius = 23;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - ((normalized / 100) * circumference);
  const tone = normalized >= 80 ? 'text-emerald-600' : normalized >= 50 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="group fixed right-5 top-[88px] z-20 hidden xl:block">
      <button type="button" title="Lesson health" className="relative h-16 w-16 rounded-full border border-zinc-200 bg-white/85 shadow-[0_10px_30px_rgba(0,0,0,0.12)] backdrop-blur-sm">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
          <circle cx="28" cy="28" r={radius} className="stroke-zinc-200" strokeWidth="6" fill="none" />
          <circle
            cx="28"
            cy="28"
            r={radius}
            className={tone}
            strokeWidth="6"
            strokeLinecap="round"
            fill="none"
            stroke="currentColor"
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-zinc-800">{normalized}</span>
      </button>
        <div className="space-y-1">
          {checks.map((check) => (
            <div key={check.id} className={check.passed ? 'flex items-center justify-between border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700' : 'flex items-center justify-between border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-600'}>
              <span>{check.label}</span>
              {!check.passed && (
                <button type="button" onClick={() => onFix(check.action)} className="border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-600">
                  Fix
                </button>
              )}
            </div>
          ))}
        </div>
    </div>
  );
}

const CATEGORY_META = {
  'Core Practice': { icon: '◉', accent: 'border-zinc-900 text-zinc-900' },
  Input: { icon: '⌨', accent: 'border-zinc-700 text-zinc-700' },
  Matching: { icon: '⇄', accent: 'border-zinc-800 text-zinc-800' },
  Sequencing: { icon: '≡', accent: 'border-zinc-700 text-zinc-700' },
  'Data Entry': { icon: '▦', accent: 'border-zinc-800 text-zinc-800' },
  Reading: { icon: '▤', accent: 'border-zinc-700 text-zinc-700' },
  Speaking: { icon: '◌', accent: 'border-zinc-800 text-zinc-800' },
  Listening: { icon: '♪', accent: 'border-zinc-700 text-zinc-700' },
  Visual: { icon: '◫', accent: 'border-zinc-800 text-zinc-800' },
  Writing: { icon: '✎', accent: 'border-zinc-700 text-zinc-700' },
  Grammar: { icon: '∴', accent: 'border-zinc-800 text-zinc-800' },
  Discussion: { icon: '◍', accent: 'border-zinc-700 text-zinc-700' },
  Recall: { icon: '↺', accent: 'border-zinc-800 text-zinc-800' },
  Review: { icon: '☑', accent: 'border-zinc-700 text-zinc-700' },
  Vocabulary: { icon: '◎', accent: 'border-zinc-800 text-zinc-800' },
};

const SLIDE_GROUPS = {
  Text: ['slide', 'rich', 'structure', 'focus'],
  Split: ['two_column_text_task', 'step_by_step', 'group_task_slide'],
  Media: ['image_task', 'video_task', 'map_diagram'],
  Visual: ['table', 'flashcard_slide', 'scenario', 'carousel'],
  Containers: ['group', 'split_group'],
};

function renderBlockPreview(block) {
  if (!block) return null;
  return <Suspense fallback={<div className="border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">Loading preview…</div>}><BlockPreview block={block} /></Suspense>;
}

function MiniSlidePreview({ layout }) {
  if (layout === 'table') {
    return (
      <div className="grid h-24 grid-cols-3 gap-1 border border-zinc-200 bg-white p-2">
        {Array.from({ length: 9 }).map((_, index) => <div key={index} className="border border-zinc-200 bg-zinc-50" />)}
      </div>
    );
  }

  if (layout === 'split' || layout === 'media_split') {
    return (
      <div className="grid h-24 grid-cols-2 gap-2 border border-zinc-200 bg-white p-2">
        <div className="border border-zinc-200 bg-zinc-50" />
        <div className="space-y-2 border border-zinc-200 bg-white p-2">
          <div className="h-2 w-2/3 bg-zinc-900" />
          <div className="h-2 w-full bg-zinc-200" />
          <div className="h-2 w-5/6 bg-zinc-200" />
          <div className="mt-3 h-7 border border-zinc-300 bg-zinc-50" />
        </div>
      </div>
    );
  }

  if (layout === 'carousel' || layout === 'stepper') {
    return (
      <div className="border border-zinc-200 bg-white p-2">
        <div className="mb-2 h-2 w-1/2 bg-zinc-900" />
        <div className="space-y-1">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex items-center gap-2 border border-zinc-200 bg-zinc-50 px-2 py-2">
              <div className="h-4 w-4 border border-zinc-900" />
              <div className="h-2 flex-1 bg-zinc-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (layout === 'cards') {
    return (
      <div className="grid h-24 grid-cols-2 gap-2 border border-zinc-200 bg-white p-2">
        {[0, 1, 2, 3].map((index) => <div key={index} className="border border-zinc-200 bg-zinc-50" />)}
      </div>
    );
  }

  if (layout === 'scenario') {
    return (
      <div className="border border-zinc-200 bg-white p-2">
        <div className="mb-2 h-2 w-1/2 bg-zinc-900" />
        <div className="space-y-2">
          <div className="ml-0 h-7 w-3/4 border border-zinc-200 bg-zinc-50" />
          <div className="ml-auto h-7 w-3/4 border border-zinc-200 bg-zinc-50" />
          <div className="ml-0 h-7 w-2/3 border border-zinc-200 bg-zinc-50" />
        </div>
      </div>
    );
  }

  if (layout === 'group') {
    return (
      <div className="border border-zinc-200 bg-white p-2">
        <div className="mb-2 flex gap-1">
          {[0, 1, 2].map((index) => <div key={index} className="h-5 flex-1 border border-zinc-200 bg-zinc-50" />)}
        </div>
        <div className="h-12 border border-dashed border-zinc-300 bg-zinc-50" />
      </div>
    );
  }

  if (layout === 'focus') {
    return (
      <div className="border border-zinc-200 bg-white p-2">
        <div className="mb-2 h-2 w-1/2 bg-zinc-900" />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((index) => <div key={index} className="h-12 border border-zinc-200 bg-zinc-50" />)}
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

function MiniTaskPreview({ entry }) {
  if (entry.kind === 'choice') {
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

  if (entry.kind === 'text') {
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

  if (entry.kind === 'pairs') {
    return (
      <div className="grid grid-cols-2 gap-2 border border-zinc-200 bg-white p-2">
        {[0, 1, 2, 3].map((index) => <div key={index} className="h-8 border border-zinc-200 bg-zinc-50" />)}
      </div>
    );
  }

  if (entry.kind === 'collection') {
    return (
      <div className="border border-zinc-200 bg-white p-2">
        <div className="mb-2 h-2 w-1/2 bg-zinc-900" />
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((index) => <div key={index} className="h-6 w-[calc(50%-0.25rem)] border border-zinc-200 bg-zinc-50" />)}
        </div>
      </div>
    );
  }

  if (entry.kind === 'grid') {
    return (
      <div className="grid h-24 grid-cols-3 gap-1 border border-zinc-200 bg-white p-2">
        {Array.from({ length: 9 }).map((_, index) => <div key={index} className="border border-zinc-200 bg-zinc-50" />)}
      </div>
    );
  }

  if (entry.kind === 'media') {
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

  if (entry.kind === 'branch') {
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

const PaletteCard = memo(function PaletteCard({ entry, label, kind = 'task', onAdd, isFavorite, onToggleFavorite }) {
  const meta = CATEGORY_META[entry.category] || { icon: '•', accent: 'border-zinc-300 text-zinc-700' };
  return (
    <div className="group relative w-full border border-zinc-200 bg-white text-left transition hover:border-zinc-900">
      {kind === 'task' && onToggleFavorite && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(entry.type); }}
          className={`absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center text-sm transition ${isFavorite ? 'text-amber-500' : 'text-zinc-300 opacity-0 group-hover:opacity-100'}`}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFavorite ? '★' : '☆'}
        </button>
      )}
      <button
        type="button"
        draggable
        onDragStart={(event) => event.dataTransfer.setData('application/x-builder-type', entry.type)}
        onClick={() => onAdd(createDefaultBlock(entry.type, { blank: true }))}
        className="w-full text-left"
      >
        <div className="p-3">
          {kind === 'slide' && <div className="mb-2 overflow-hidden"><MiniSlidePreview layout={entry.layout || ((entry.type === 'group' || entry.type === 'split_group') ? 'group' : 'single')} /></div>}
          {kind === 'task' && <div className="mb-2 overflow-hidden"><MiniTaskPreview entry={entry} /></div>}
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className={`inline-flex h-4 w-4 items-center justify-center border text-[9px] ${meta.accent}`}>{kind === 'slide' ? '□' : meta.icon}</span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">{label}</span>
          </div>
          <div className="text-sm font-medium text-zinc-900">{entry.label}</div>
          {'description' in entry && entry.description && <div className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{entry.description}</div>}
        </div>
        <div className="border-t border-zinc-100 px-3 py-1.5 text-[10px] font-medium text-zinc-400 opacity-0 transition group-hover:opacity-100">Click to add · Drag to place</div>
      </button>
    </div>
  );
});

function MobileSlideLibrarySheet({ isOpen, onClose, onAdd }) {
  const [activeTab, setActiveTab] = useState('slides');
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/40">
      <button type="button" onClick={onClose} className="absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 max-h-[90vh] animate-soft-rise overflow-hidden border-t border-zinc-200 bg-white">
        <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Add Content</div>
            <button type="button" onClick={onClose} className="border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-900">Close</button>
          </div>
          <div className="flex border-t border-zinc-100">
            <button type="button" onClick={() => setActiveTab('slides')} className={activeTab === 'slides' ? 'flex-1 border-b-2 border-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900' : 'flex-1 px-3 py-2 text-xs text-zinc-500'}>Slides</button>
            <button type="button" onClick={() => setActiveTab('groups')} className={activeTab === 'groups' ? 'flex-1 border-b-2 border-zinc-900 px-3 py-2 text-xs font-medium text-zinc-900' : 'flex-1 px-3 py-2 text-xs text-zinc-500'}>Groups</button>
          </div>
        </div>
        <div className="overflow-auto p-4" style={{ maxHeight: 'calc(90vh - 100px)' }}>
          <div className="space-y-3">
            {Object.entries(SLIDE_GROUPS).map(([groupName, types]) => {
              const filter = activeTab === 'groups' ? ['group'] : types.filter((t) => t !== 'group');
              const entries = [...SLIDE_REGISTRY, { type: 'group', label: 'Nested Group', layout: 'group' }].filter((entry) => filter.includes(entry.type));
              if (entries.length === 0) return null;
              return (
                <section key={groupName}>
                  <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-zinc-400">{groupName}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {entries.map((entry) => (
                      <PaletteCard key={entry.type} entry={entry} label={groupName} kind="slide" onAdd={(block) => { onAdd(block); onClose(); }} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const DropIndicator = memo(function DropIndicator({ active, label = 'Drop here' }) {
  return (
    <div className={active ? 'pointer-events-none flex min-h-10 items-center justify-center border-2 border-dashed border-zinc-900 bg-zinc-50 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-700 transition-all' : 'pointer-events-none h-1 transition-all'}>
      {active ? label : ''}
    </div>
  );
});

const BlockNavigator = memo(function BlockNavigator({ blocks, selectedId, onSelect }) {
  return (
    <div className="flex gap-1 overflow-auto pb-0.5 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
      {blocks.map((block, index) => (
        <button key={block.id} type="button" onClick={() => onSelect(block.id)} className={selectedId === block.id ? 'flex min-w-0 shrink-0 items-center gap-1 border border-zinc-900 bg-zinc-900 px-2 py-1 text-left text-white' : 'flex min-w-0 shrink-0 items-center gap-1 border border-zinc-200 bg-white px-2 py-1 text-left text-zinc-600 hover:border-zinc-400'}>
          <span className="text-[9px] font-semibold opacity-60">{index + 1}</span>
          <div className="min-w-0">
            <div className="max-w-[80px] truncate text-[10px] font-medium">{getBlockLabel(block, index)}</div>
          </div>
        </button>
      ))}
    </div>
  );
});

const GroupNodeEditor = memo(function GroupNodeEditor({ block, selectedId, onSelect, onUpdateChild, onOpenModalForGroup, onDropBuilder, onDragOverTarget, onDragLeaveTarget, onCombineHover, onCombineLeave, onCombineDrop, dropTarget, onDeleteChild, onMoveChild, onUngroupChild, onVariantChild, onBeginMobileDrag, onEndMobileDragPress, onMobileDropGroup, mobileDragItem, level = 0 }) {
  return (
    <div className="space-y-2 border border-zinc-200 bg-zinc-50 p-2 sm:space-y-3 sm:p-4" style={{ marginLeft: level > 0 ? `${level * 12}px` : 0 }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500"><DragHandleIcon /> <span>Group</span></div>
          <div className="text-sm font-medium text-zinc-900">{block.title || 'Nested group'}</div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => onOpenModalForGroup(block.id)} className="inline-flex items-center justify-center gap-2 border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs text-white"><PlusIcon /> Add Task</button>
          <button type="button" onClick={() => onUpdateChild(addGroupPlaceholder(block))} className="inline-flex items-center justify-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700"><PlusIcon /> Add Group</button>
        </div>
      </div>
      <div className="space-y-2">
          {(block.children || []).map((child, index) => (
            <div
              key={child.id}
              onDragOver={(event) => onDragOverTarget(event, block.id, index)}
              onDragLeave={(event) => onDragLeaveTarget(event, block.id, index)}
              onDrop={(event) => onDropBuilder(event, block.id, index)}
              onClick={() => {
                if (mobileDragItem) onMobileDropGroup(block.id, index);
              }}
              className="space-y-2"
            >
              <DropIndicator active={dropTarget?.scope === 'group' && dropTarget.groupId === block.id && dropTarget.index === index} label={mobileDragItem ? 'Tap to place inside group' : 'Insert inside group here'} />
              <div
                role="button"
                tabIndex={0}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-group-id', block.id);
                  event.dataTransfer.setData('application/x-group-child-id', child.id);
                }}
                onPointerDown={() => onBeginMobileDrag({ kind: 'group-child', groupId: block.id, childId: child.id })}
                onPointerUp={onEndMobileDragPress}
                onPointerLeave={onEndMobileDragPress}
                onPointerCancel={onEndMobileDragPress}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onCombineHover(block.id, child.id);
                }}
                onDragLeave={() => onCombineLeave(block.id, child.id)}
                onDrop={(event) => onCombineDrop(event, block.id, child.id)}
                onClick={() => onSelect(child.id)}
                onKeyDown={(event) => handleSelectableCardKeyDown(event, () => onSelect(child.id))}
                className={selectedId === child.id ? 'w-full border border-zinc-900 bg-zinc-900 p-2 text-left text-white sm:p-3' : dropTarget?.scope === 'group-combine' && dropTarget.groupId === block.id && dropTarget.targetId === child.id ? 'w-full border-2 border-zinc-900 bg-zinc-100 p-2 text-left text-zinc-900 sm:p-3' : mobileDragItem?.childId === child.id ? 'w-full border-2 border-zinc-900 bg-zinc-100 p-2 text-left text-zinc-900 sm:p-3' : 'w-full border border-zinc-200 bg-white p-2 text-left text-zinc-900 sm:p-3'}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] opacity-70"><DragHandleIcon className="text-current/70" /> <span>{child.type === 'task' ? getTaskDefinition(child.taskType).category : child.type}</span></div>
                    <div className="mt-1 text-sm font-semibold">{getBlockLabel(child, index)}</div>
                    <div className="mt-1 hidden text-xs opacity-80 sm:block">{child.instruction || child.text || child.content || (child.type === 'task' ? getTaskDefinition(child.taskType).description : 'Nested group')}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="border border-current px-2 py-0.5 text-[10px] uppercase">{index + 1}</span>
                    {child.type === 'task' && (
                      <IconActionButton
                        title={child.enabled === false ? 'Enable task' : 'Disable task'}
                        onClick={(event) => {
                          event.stopPropagation();
                          onUpdateChild({ ...child, enabled: child.enabled === false });
                        }}
                      >
                        <span className="text-[10px]">{child.enabled === false ? 'OFF' : 'ON'}</span>
                      </IconActionButton>
                    )}
                    {aiEnabled && child.type === 'task' && (
                      <IconActionButton title="AI Rephrase" onClick={(event) => { event.stopPropagation(); rephraseTaskBlock(child); }}>
                        <span className="text-[10px]">AI</span>
                      </IconActionButton>
                    )}
                    <IconActionButton title="Duplicate variant" onClick={(event) => { event.stopPropagation(); onVariantChild(block.id, child.id); }}><span className="text-xs">⋇</span></IconActionButton>
                    <IconActionButton title="Move up" onClick={(event) => { event.stopPropagation(); onMoveChild(block.id, child.id, -1); }}><ChevronIcon direction="up" /></IconActionButton>
                    <IconActionButton title="Move down" onClick={(event) => { event.stopPropagation(); onMoveChild(block.id, child.id, 1); }}><ChevronIcon direction="down" /></IconActionButton>
                    <IconActionButton title="Delete block" onClick={(event) => { event.stopPropagation(); onDeleteChild(child.id); }}><TrashIcon /></IconActionButton>
                  </div>
                </div>
              </div>
              {selectedId === child.id && child.type !== 'group' && (
                <div className="border border-zinc-200 bg-white p-2 sm:p-4">
                  <div>
                    <BlockEditorForm block={child} onChange={onUpdateChild} compact />
                  </div>
                  <div className="mt-3 lg:hidden border-t border-zinc-200 pt-3">
                    {renderBlockPreview(child)}
                  </div>
                </div>
              )}
              {(child.type === 'group' || child.type === 'split_group') && (
                <GroupNodeEditor
                  block={child}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onUpdateChild={onUpdateChild}
                  onOpenModalForGroup={onOpenModalForGroup}
                  onDropBuilder={onDropBuilder}
                  onDragOverTarget={onDragOverTarget}
                  onDragLeaveTarget={onDragLeaveTarget}
                  onCombineHover={onCombineHover}
                  onCombineLeave={onCombineLeave}
                  onCombineDrop={onCombineDrop}
                  dropTarget={dropTarget}
                  onDeleteChild={onDeleteChild}
                  onMoveChild={onMoveChild}
                  onUngroupChild={onUngroupChild}
                  onVariantChild={onVariantChild}
                  onBeginMobileDrag={onBeginMobileDrag}
                  onEndMobileDragPress={onEndMobileDragPress}
                  onMobileDropGroup={onMobileDropGroup}
                  mobileDragItem={mobileDragItem}
                  level={level + 1}
                />
              )}
            </div>
          ))}
          <div
            onDragOver={(event) => onDragOverTarget(event, block.id, block.children?.length || 0)}
            onDragLeave={(event) => onDragLeaveTarget(event, block.id, block.children?.length || 0)}
            onDrop={(event) => onDropBuilder(event, block.id, block.children?.length || 0)}
            onClick={() => {
              if (mobileDragItem) onMobileDropGroup(block.id, block.children?.length || 0);
            }}
            className={dropTarget?.scope === 'group' && dropTarget.groupId === block.id && dropTarget.index === (block.children?.length || 0) ? 'border-2 border-zinc-900 bg-zinc-100 p-3 text-sm font-medium text-zinc-900' : 'border border-dashed border-zinc-300 bg-white p-3 text-sm text-zinc-500'}
          >
            {mobileDragItem ? 'Tap to place at the end of this group.' : 'Drop a task or nested group here.'}
          </div>
        </div>
    </div>
  );
});

function addGroupPlaceholder(group) {
  const nestedGroup = createDefaultBlock('group');
  return {
    ...group,
    children: [...(group.children || []), nestedGroup],
    itemRefs: [...(group.children || []), nestedGroup].map((child) => child.ref),
  };
}

function createAdHocGroup(children, title = 'New Group') {
  const group = createDefaultBlock('group');
  group.title = title;
  group.children = children;
  group.itemRefs = children.map((child) => child.ref);
  return group;
}

function sectionKeyForBlock(block) {
  if (block?.type === 'task') return 'tasks';
  if (block?.type === 'group' || block?.type === 'split_group') return 'groups';
  return 'slides';
}

function sectionLabelFromKey(key) {
  if (key === 'tasks') return 'Practice Tasks';
  if (key === 'groups') return 'Groups';
  return 'Slides';
}

function cleanText(value = '') {
  return String(value || '')
    .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[>#*_~|\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countSyllables(value = '') {
  const word = String(value || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!word) return 0;
  const compact = word.replace(/e$/, '');
  const matches = compact.match(/[aeiouy]{1,2}/g);
  return Math.max(1, matches ? matches.length : 1);
}

function analyzeReadability(text = '') {
  const normalized = cleanText(text);
  if (!normalized) {
    return {
      words: 0,
      sentences: 0,
      score: null,
      gradeLevel: null,
    };
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  const sentences = Math.max(1, normalized.split(/[.!?]+/).filter((entry) => entry.trim().length > 0).length);
  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);

  const wordsPerSentence = words.length / sentences;
  const syllablesPerWord = words.length > 0 ? syllables / words.length : 0;
  const score = 206.835 - (1.015 * wordsPerSentence) - (84.6 * syllablesPerWord);
  const gradeLevel = (0.39 * wordsPerSentence) + (11.8 * syllablesPerWord) - 15.59;

  return {
    words: words.length,
    sentences,
    score: Number.isFinite(score) ? Math.round(score * 10) / 10 : null,
    gradeLevel: Number.isFinite(gradeLevel) ? Math.max(0, Math.round(gradeLevel * 10) / 10) : null,
  };
}

function estimateTaskMinutes(block) {
  const definition = getTaskDefinition(block?.taskType);
  const baseByKind = {
    choice: 0.8,
    text: 1.7,
    pairs: 1.1,
    collection: 1.2,
    grid: 1.6,
    media: 1.4,
    branch: 1.5,
    generic: 1.0,
  };
  const base = baseByKind[definition.kind] || 1;
  const questionWordCount = cleanText(block?.question || '').split(/\s+/).filter(Boolean).length;
  const readingMinutes = questionWordCount / 160;
  return Math.max(0.4, base + readingMinutes);
}

function estimateBlockMinutes(block) {
  if (!block) return 0;
  if (block.type === 'task') return estimateTaskMinutes(block);
  if (block.type === 'group' || block.type === 'split_group') {
    return (block.children || []).reduce((sum, child) => sum + estimateBlockMinutes(child), 0);
  }
  const contentWords = cleanText([block.title, block.content, block.text, block.instruction].filter(Boolean).join(' ')).split(/\s+/).filter(Boolean).length;
  return Math.max(0.5, contentWords / 170);
}

function withVariantSuffix(value = '') {
  const text = String(value || '').trim();
  if (!text) return 'Variant prompt';
  if (/\(variant\)$/i.test(text)) return text;
  return `${text} (Variant)`;
}

function createVariantBlock(sourceBlock) {
  const variant = cloneBlockTree(sourceBlock);

  if (variant.type === 'task') {
    variant.question = withVariantSuffix(variant.question || variant.title || variant.instruction || 'Task');
    if (Array.isArray(variant.options) && variant.options.length > 1) {
      variant.options = [...variant.options.slice(1), variant.options[0]];
    }
    if (Array.isArray(variant.items) && variant.items.length > 1) {
      variant.items = [...variant.items.slice(1), variant.items[0]];
    }
    if (Array.isArray(variant.pairs) && variant.pairs.length > 1) {
      variant.pairs = [...variant.pairs].reverse();
    }
    if (typeof variant.answer === 'string' && variant.answer.includes('|')) {
      const answers = variant.answer.split('|').map((entry) => entry.trim()).filter(Boolean);
      if (answers.length > 1) {
        variant.answer = [...answers.slice(1), answers[0]].join(' | ');
      }
    }
  } else {
    variant.title = withVariantSuffix(variant.title || variant.question || variant.instruction || variant.type);
  }

  return variant;
}

function findTopLevelContainerId(blocks = [], targetId = '') {
  const visit = (block) => {
    if (!block) return false;
    if (block.id === targetId) return true;
    return (block.children || []).some((child) => visit(child));
  };

  for (const block of blocks) {
    if (visit(block)) return block.id;
  }
  return null;
}

export default function BuilderPanel({ lesson, selectedId, onSelect, onReplaceLesson, onAddBlock, onDeleteBlock, onOpenGuide }) {
  const { favorites, toggle: toggleFavorite, isFavorite } = useFavorites();
  const aiEnabled = hasAiBridgeToken();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [libraryMode, setLibraryMode] = useState('catalog');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTargetGroupId, setModalTargetGroupId] = useState(null);
  const [previewWidth, setPreviewWidth] = useState(36);
  const [showMobileFab, setShowMobileFab] = useState(false);
  const [showSlideLibrary, setShowSlideLibrary] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [collapsedTopSections, setCollapsedTopSections] = useState({ slides: false, tasks: false, groups: false });
  const [batchPoints, setBatchPoints] = useState('1');
  const [batchRequiredMode, setBatchRequiredMode] = useState('keep');
  const [batchScope, setBatchScope] = useState('all');
  const [batchMessage, setBatchMessage] = useState('');
  const [showUtilityPanels, setShowUtilityPanels] = useState(false);

  const [collapsedLibrarySections, setCollapsedLibrarySections] = useState(() => {
    const initial = {};
    return initial;
  });
  const [dropTarget, setDropTarget] = useState(null);
  const [prefersCoarsePointer, setPrefersCoarsePointer] = useState(false);
  const [mobileDragItem, setMobileDragItem] = useState(null);
  const [recentTypes, setRecentTypes] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('lf-recent-types') || '[]'); } catch { return []; }
  });
  const resizeRef = useRef(null);
  const blockRefs = useRef(new Map());
  const longPressRef = useRef(null);
  const quickAddRef = useRef(null);
  const categories = useMemo(() => ['All', ...getTaskCategories()], []);
  const blocks = lesson.blocks || [];
  const selected = useMemo(() => findBlockById(blocks, selectedId) || flattenBlocks(blocks)[0] || null, [blocks, selectedId]);
  const flatBlocks = useMemo(() => flattenBlocks(blocks), [blocks]);
  const taskBlocks = useMemo(() => flatBlocks.filter((block) => block.type === 'task'), [flatBlocks]);

  const sectionCounts = useMemo(() => {
    const counts = { slides: 0, tasks: 0, groups: 0 };
    blocks.forEach((block) => {
      const key = sectionKeyForBlock(block);
      counts[key] += 1;
    });
    return counts;
  }, [blocks]);

  const allSectionsCollapsed = useMemo(() => (
    collapsedTopSections.slides && collapsedTopSections.tasks && collapsedTopSections.groups
  ), [collapsedTopSections]);

  const duplicateQuestionGroups = useMemo(() => {
    const byQuestion = new Map();
    taskBlocks.forEach((block, index) => {
      const raw = cleanText(block.question || block.instruction || block.title || '');
      const normalized = raw.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!normalized || normalized.length < 8) return;
      if (!byQuestion.has(normalized)) byQuestion.set(normalized, []);
      byQuestion.get(normalized).push({
        id: block.id,
        label: getBlockLabel(block, index),
      });
    });

    return [...byQuestion.entries()]
      .filter(([, items]) => items.length > 1)
      .map(([question, items]) => ({ question, items }));
  }, [taskBlocks]);

  const duplicateQuestionIdSet = useMemo(() => {
    const next = new Set();
    duplicateQuestionGroups.forEach((group) => {
      group.items.forEach((item) => next.add(item.id));
    });
    return next;
  }, [duplicateQuestionGroups]);

  const readability = useMemo(() => {
    const sourceText = flatBlocks
      .map((block) => (block.type === 'task'
        ? [block.question, block.hint, block.explanation].join(' ')
        : [block.title, block.content, block.instruction, block.text].join(' ')))
      .join(' ');
    return analyzeReadability(sourceText);
  }, [flatBlocks]);

  const estimatedMinutes = useMemo(() => {
    const total = blocks.reduce((sum, block) => sum + estimateBlockMinutes(block), 0);
    return Math.max(1, Math.round(total * 10) / 10);
  }, [blocks]);

  const qualityChecks = useMemo(() => {
    const firstBlock = blocks[0] || null;
    const missingPoints = taskBlocks.some((block) => {
      const points = Number(block.points);
      return !Number.isFinite(points) || points <= 0;
    });
    const readabilityBalanced = readability.score === null || readability.score >= 45;
    const timeBalanced = estimatedMinutes >= 5 && estimatedMinutes <= 35;

    return [
      {
        id: 'intro',
        label: 'Start with a context slide before tasks',
        passed: Boolean(firstBlock) && firstBlock.type !== 'task',
        action: 'add_intro_slide',
      },
      {
        id: 'task-count',
        label: 'Include at least 3 practice tasks',
        passed: taskBlocks.length >= 3,
        action: 'add_core_task',
      },
      {
        id: 'duplicates',
        label: 'Avoid duplicate prompts',
        passed: duplicateQuestionGroups.length === 0,
        action: 'focus_duplicate',
      },
      {
        id: 'points',
        label: 'Every task has positive points',
        passed: !missingPoints,
        action: 'apply_points',
      },
      {
        id: 'readability',
        label: 'Prompt readability remains student-friendly',
        passed: readabilityBalanced,
        action: 'review_readability',
      },
      {
        id: 'timing',
        label: 'Estimated runtime stays between 5 and 35 minutes',
        passed: timeBalanced,
        action: 'review_timing',
      },
    ];
  }, [blocks, duplicateQuestionGroups.length, estimatedMinutes, readability.score, taskBlocks]);

  const qualityScore = useMemo(() => {
    if (qualityChecks.length === 0) return 0;
    const passed = qualityChecks.filter((entry) => entry.passed).length;
    return Math.round((passed / qualityChecks.length) * 100);
  }, [qualityChecks]);

  useEffect(() => {
    const onPointerMove = (event) => {
      if (!resizeRef.current) return;
      const container = resizeRef.current;
      const bounds = container.getBoundingClientRect();
      const nextWidth = ((bounds.right - event.clientX) / bounds.width) * 100;
      setPreviewWidth(Math.max(26, Math.min(48, nextWidth)));
    };
    const onPointerUp = () => {
      resizeRef.current = null;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setPrefersCoarsePointer(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    if (mobileDragItem) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileDragItem]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return TASK_REGISTRY.filter((entry) => {
      if (entry.hiddenFromLibrary) return false;
      const haystack = [entry.label, entry.type, entry.category, ...(entry.keywords || [])].join(' ').toLowerCase();
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
      const matchesCategory = category === 'All' || (category === '★ Favorites' ? favorites.includes(entry.type) : entry.category === category);
      return matchesQuery && matchesCategory;
    });
  }, [category, favorites, query]);

  const filteredSlides = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const slideEntries = [...SLIDE_REGISTRY, { type: 'group', label: 'Nested Group', layout: 'group' }];
    return slideEntries.filter((entry) => {
      if (category !== 'All' && category !== 'Slides') return false;
      const haystack = [entry.label, entry.type, entry.layout || 'slide', 'slide'].join(' ').toLowerCase();
      return !normalizedQuery || haystack.includes(normalizedQuery);
    });
  }, [category, query]);

  const groupedTasks = useMemo(() => {
    const grouped = new Map();
    filteredTasks.forEach((entry) => {
      if (!grouped.has(entry.category)) grouped.set(entry.category, []);
      grouped.get(entry.category).push(entry);
    });
    return [...grouped.entries()];
  }, [filteredTasks]);

  const groupedSlides = useMemo(() => {
    return Object.entries(SLIDE_GROUPS)
      .map(([groupName, types]) => [groupName, filteredSlides.filter((entry) => types.includes(entry.type))])
      .filter(([, items]) => items.length > 0);
  }, [filteredSlides]);

  const catalogSections = useMemo(() => {
    const sections = [];
    // Favorites section first
    const favEntries = TASK_REGISTRY.filter((entry) => !entry.hiddenFromLibrary && favorites.includes(entry.type));
    if (favEntries.length > 0) sections.push({ id: 'fav-Favorites', title: '★ Favorites', kind: 'task', entries: favEntries });
    sections.push(
      ...groupedTasks.map(([groupName, entries]) => ({ id: `task-${groupName}`, title: groupName, kind: 'task', entries })),
      ...groupedSlides.map(([groupName, entries]) => ({ id: `slide-${groupName}`, title: groupName, kind: 'slide', entries })),
    );
    return sections;
  }, [favorites, groupedSlides, groupedTasks]);

  useEffect(() => {
    setCollapsedLibrarySections((current) => {
      const next = { ...current };
      let changed = false;
      catalogSections.forEach((section) => {
        if (!(section.id in next)) {
          next[section.id] = section.id.startsWith('fav-') ? false : true;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [catalogSections]);

  const unifiedLibraryEntries = useMemo(() => ([
    ...filteredTasks.map((entry) => ({ ...entry, kind: 'task', groupLabel: entry.category })),
    ...filteredSlides.map((entry) => ({ ...entry, kind: 'slide', groupLabel: entry.layout || 'Slides' })),
  ].sort((left, right) => left.label.localeCompare(right.label))), [filteredSlides, filteredTasks]);

  const trackRecentType = (type) => {
    setRecentTypes((prev) => {
      const next = [type, ...prev.filter((t) => t !== type)].slice(0, 6);
      try { sessionStorage.setItem('lf-recent-types', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const suggestions = useMemo(() => {
    const tips = [];
    const taskTypes = new Set(flattenBlocks(blocks).filter((b) => b.type === 'task').map((b) => b.taskType));
    const slideCount = blocks.filter((b) => b.type !== 'task' && b.type !== 'group').length;
    const taskCount = flattenBlocks(blocks).filter((b) => b.type === 'task').length;

    if (blocks.length === 0) {
      tips.push({ text: 'Start by adding a slide or task from the library', action: null });
    } else {
      if (slideCount === 0 && taskCount > 0) tips.push({ text: 'Add an intro slide to set the context', action: () => addBlockAndTrack(createDefaultBlock('slide', { blank: true })) });
      if (taskCount > 3 && !taskTypes.has('multiple_choice')) tips.push({ text: 'Add a multiple choice for quick comprehension check', action: () => addBlockAndTrack(createDefaultBlock('multiple_choice', { blank: true })) });
      if (taskCount > 3 && !taskTypes.has('match') && !taskTypes.has('drag_match')) tips.push({ text: 'Add a matching task for vocabulary practice', action: () => addBlockAndTrack(createDefaultBlock('match', { blank: true })) });
      if (taskCount > 5 && slideCount < 2) tips.push({ text: 'Add a review slide to break up tasks', action: () => addBlockAndTrack(createDefaultBlock('slide', { blank: true })) });
      if (taskTypes.has('multiple_choice') && !taskTypes.has('short_answer') && !taskTypes.has('long_answer')) tips.push({ text: 'Add a writing task for deeper practice', action: () => addBlockAndTrack(createDefaultBlock('short_answer', { blank: true })) });
      if (blocks.length > 8 && blocks.every((b) => b.type !== 'group')) tips.push({ text: 'Group related blocks together for better organization', action: null });
    }
    return tips.slice(0, 2);
  }, [blocks]);

  const addBlockAndTrack = (block) => {
    trackRecentType(block.taskType || block.type);
    onAddBlock(block);
  };

  const applyBatchTaskUpdates = () => {
    const numericPoints = Number(batchPoints);
    const updatePoints = Number.isFinite(numericPoints) && numericPoints > 0;
    const scopedContainerId = batchScope === 'section' && selected?.id
      ? findTopLevelContainerId(blocks, selected.id)
      : null;
    const scopeBlocks = batchScope === 'section' && scopedContainerId
      ? blocks.filter((block) => block.id === scopedContainerId)
      : blocks;
    const targetTaskIds = new Set(flattenBlocks(scopeBlocks).filter((block) => block.type === 'task').map((block) => block.id));

    if (targetTaskIds.size === 0) {
      setBatchMessage('No tasks in the selected scope.');
      return;
    }

    let changedCount = 0;
    const patchTree = (items = []) => items.map((block) => {
      let nextBlock = block;
      if (block.type === 'task' && targetTaskIds.has(block.id)) {
        const patch = {};
        if (updatePoints) patch.points = String(Math.round(numericPoints * 100) / 100);
        if (batchRequiredMode === 'required') patch.required = true;
        if (batchRequiredMode === 'optional') patch.required = false;
        if (Object.keys(patch).length > 0) {
          nextBlock = { ...block, ...patch };
          changedCount += 1;
        }
      }

      if (block.children?.length) {
        const nextChildren = patchTree(block.children);
        if (nextChildren !== block.children) {
          nextBlock = {
            ...nextBlock,
            children: nextChildren,
            itemRefs: nextChildren.map((child) => child.ref),
          };
        }
      }

      return nextBlock;
    });

    const nextBlocks = patchTree(blocks);
    replaceBlocks(nextBlocks);
    setBatchMessage(`Batch updated ${changedCount} task${changedCount === 1 ? '' : 's'}.`);
  };

  const runQualityAction = (action) => {
    if (action === 'add_intro_slide') {
      const intro = createDefaultBlock('slide', { blank: true });
      intro.title = 'Lesson Kickoff';
      intro.content = '## Objective\nSummarize the goal for students before practice starts.';
      replaceBlocks([intro, ...blocks]);
      onSelect(intro.id);
      return;
    }

    if (action === 'add_core_task') {
      const task = createDefaultBlock('multiple_choice', { blank: true });
      task.question = 'New comprehension check';
      addBlockAndTrack(task);
      return;
    }

    if (action === 'focus_duplicate' && duplicateQuestionGroups.length > 0) {
      onSelect(duplicateQuestionGroups[0].items[0].id);
      return;
    }

    if (action === 'apply_points') {
      setBatchPoints('1');
      setBatchRequiredMode('required');
      setBatchMessage('Set points and required mode, then click Apply Batch Edit.');
      return;
    }

    if (action === 'review_readability') {
      setBatchMessage('Consider shortening prompts or splitting long instructions into bullet points.');
      return;
    }

    if (action === 'review_timing') {
      setBatchMessage('Adjust task count or complexity to fit your target runtime window.');
    }
  };

  const stableRef = useRef({});
  stableRef.current = { selectedId, onDeleteBlock, blocks, onSelect, lesson, onReplaceLesson };

  useEffect(() => {
    const onKeyDown = (event) => {
      // Don't intercept keystrokes inside inputs/textareas
      const tag = event.target?.tagName;
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable;
      const { selectedId: sid, onDeleteBlock: delBlock, blocks: blks, onSelect: sel, lesson: lsn, onReplaceLesson: replaceLsn } = stableRef.current;

      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        setShowQuickAdd((v) => !v);
        return;
      }
      if (isEditing) return;
      // Delete selected block
      if (event.key === 'Delete' && sid) {
        event.preventDefault();
        delBlock(sid);
        return;
      }
      // Duplicate selected block
      if ((event.ctrlKey || event.metaKey) && event.key === 'd' && sid) {
        event.preventDefault();
        const idx = blks.findIndex((b) => b.id === sid);
        if (idx >= 0) {
          const clone = cloneBlockTree(blks[idx]);
          const next = [...blks];
          next.splice(idx + 1, 0, clone);
          replaceLsn({ ...lsn, blocks: next });
          sel(clone.id);
        }
        return;
      }
      // Move selected block up/down
      if (event.altKey && event.key === 'ArrowUp' && sid) {
        event.preventDefault();
        const idx = blks.findIndex((b) => b.id === sid);
        if (idx > 0) {
          const next = [...blks];
          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
          replaceLsn({ ...lsn, blocks: next });
        }
        return;
      }
      if (event.altKey && event.key === 'ArrowDown' && sid) {
        event.preventDefault();
        const idx = blks.findIndex((b) => b.id === sid);
        if (idx >= 0 && idx < blks.length - 1) {
          const next = [...blks];
          [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
          replaceLsn({ ...lsn, blocks: next });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const replaceBlocks = (nextBlocks) => onReplaceLesson({ ...lesson, blocks: nextBlocks });

  const insertBlockAtIndex = (index, block) => {
    trackRecentType(block.taskType || block.type);
    const nextBlocks = [...blocks];
    nextBlocks.splice(Math.max(0, Math.min(index, nextBlocks.length)), 0, block);
    replaceBlocks(nextBlocks);
    onSelect(block.id);
  };

  const clearLongPress = () => {
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  const beginMobileDrag = (payload) => {
    if (!prefersCoarsePointer) return;
    clearLongPress();
    longPressRef.current = window.setTimeout(() => {
      setMobileDragItem(payload);
      setDropTarget({ scope: payload.kind === 'top' ? 'top' : 'group', groupId: payload.groupId, index: 0 });
    }, 280);
  };

  const endMobileDragPress = () => {
    clearLongPress();
  };

  const finishMobileDrag = () => {
    setMobileDragItem(null);
    setDropTarget(null);
  };

  const focusBlock = (blockId) => {
    onSelect(blockId);
    requestAnimationFrame(() => {
      blockRefs.current.get(blockId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const moveMobileItemToTop = (targetIndex) => {
    if (!mobileDragItem) return;
    if (mobileDragItem.kind === 'top') {
      const sourceIndex = blocks.findIndex((block) => block.id === mobileDragItem.blockId);
      if (sourceIndex === -1) return finishMobileDrag();
      const nextBlocks = [...blocks];
      const [moved] = nextBlocks.splice(sourceIndex, 1);
      const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      nextBlocks.splice(insertIndex, 0, moved);
      replaceBlocks(nextBlocks);
      onSelect(moved.id);
      return finishMobileDrag();
    }

    const sourceGroup = findBlockById(blocks, mobileDragItem.groupId);
    const movingChild = sourceGroup?.children?.find((child) => child.id === mobileDragItem.childId);
    if (!movingChild) return finishMobileDrag();
    const removed = updateBlockInTree(blocks, mobileDragItem.groupId, (group) => {
      const children = (group.children || []).filter((child) => child.id !== mobileDragItem.childId);
      return { ...group, children, itemRefs: children.map((child) => child.ref) };
    });
    const nextBlocks = [...removed];
    nextBlocks.splice(targetIndex, 0, movingChild);
    replaceBlocks(nextBlocks);
    onSelect(movingChild.id);
    finishMobileDrag();
  };

  const moveMobileItemToGroup = (groupId, targetIndex) => {
    if (!mobileDragItem) return;
    if (mobileDragItem.kind === 'group-child' && mobileDragItem.groupId === groupId) {
      const nextBlocks = reorderChildrenInGroup(blocks, groupId, mobileDragItem.childId, targetIndex);
      replaceBlocks(nextBlocks);
      onSelect(mobileDragItem.childId);
      return finishMobileDrag();
    }

    if (mobileDragItem.kind === 'top') {
      const movingBlock = blocks.find((block) => block.id === mobileDragItem.blockId);
      if (!movingBlock) return finishMobileDrag();
      const nextTopLevel = blocks.filter((block) => block.id !== mobileDragItem.blockId);
      const nextBlocks = addBlockToGroup(nextTopLevel, groupId, movingBlock, targetIndex);
      replaceBlocks(nextBlocks);
      onSelect(movingBlock.id);
      return finishMobileDrag();
    }

    const sourceGroup = findBlockById(blocks, mobileDragItem.groupId);
    const movingChild = sourceGroup?.children?.find((child) => child.id === mobileDragItem.childId);
    if (!movingChild) return finishMobileDrag();
    const removed = updateBlockInTree(blocks, mobileDragItem.groupId, (group) => {
      const children = (group.children || []).filter((child) => child.id !== mobileDragItem.childId);
      return { ...group, children, itemRefs: children.map((child) => child.ref) };
    });
    const nextBlocks = addBlockToGroup(removed, groupId, movingChild, targetIndex);
    replaceBlocks(nextBlocks);
    onSelect(movingChild.id);
    finishMobileDrag();
  };

  const updateSelected = (nextBlock) => replaceBlocks(updateBlockInTree(blocks, nextBlock.id, () => nextBlock));

  const moveTopLevelBlock = (blockId, direction) => {
    const sourceIndex = blocks.findIndex((block) => block.id === blockId);
    if (sourceIndex === -1) return;
    const targetIndex = Math.max(0, Math.min(blocks.length - 1, sourceIndex + direction));
    if (sourceIndex === targetIndex) return;
    const nextBlocks = [...blocks];
    const [moved] = nextBlocks.splice(sourceIndex, 1);
    nextBlocks.splice(targetIndex, 0, moved);
    replaceBlocks(nextBlocks);
    onSelect(moved.id);
  };

  const ungroupTopLevelBlock = (groupId) => {
    const sourceIndex = blocks.findIndex((block) => block.id === groupId);
    const source = blocks[sourceIndex];
    if (sourceIndex === -1 || source?.type !== 'group') return;
    const nextBlocks = [...blocks];
    nextBlocks.splice(sourceIndex, 1, ...(source.children || []));
    replaceBlocks(nextBlocks);
    onSelect(source.children?.[0]?.id || null);
  };

  const duplicateTopLevelBlock = (blockId) => {
    const sourceIndex = blocks.findIndex((block) => block.id === blockId);
    if (sourceIndex === -1) return;
    const duplicate = cloneBlockTree(blocks[sourceIndex]);
    const nextBlocks = [...blocks];
    nextBlocks.splice(sourceIndex + 1, 0, duplicate);
    replaceBlocks(nextBlocks);
    onSelect(duplicate.id);
  };

  const duplicateVariantTopLevelBlock = (blockId) => {
    const sourceIndex = blocks.findIndex((block) => block.id === blockId);
    if (sourceIndex === -1) return;
    const variant = createVariantBlock(blocks[sourceIndex]);
    const nextBlocks = [...blocks];
    nextBlocks.splice(sourceIndex + 1, 0, variant);
    replaceBlocks(nextBlocks);
    onSelect(variant.id);
  };

  const wrapTopLevelBlockInGroup = (blockId) => {
    const sourceIndex = blocks.findIndex((block) => block.id === blockId);
    if (sourceIndex === -1) return;
    const source = blocks[sourceIndex];
    if (source.type === 'group' || source.type === 'split_group') return;
    const group = createDefaultBlock('group');
    group.title = `${getBlockLabel(source, sourceIndex)} Group`;
    group.instruction = 'Grouped for multi-step practice.';
    group.children = [source];
    group.itemRefs = [source.ref];
    const nextBlocks = [...blocks];
    nextBlocks.splice(sourceIndex, 1, group);
    replaceBlocks(nextBlocks);
    onSelect(source.id);
  };

  const duplicateChildBlock = (groupId, childId) => {
    const parent = findBlockById(blocks, groupId);
    const sourceIndex = parent?.children?.findIndex((child) => child.id === childId) ?? -1;
    if (sourceIndex === -1) return;
    const duplicate = cloneBlockTree(parent.children[sourceIndex]);
    replaceBlocks(updateBlockInTree(blocks, groupId, (group) => {
      const children = [...(group.children || [])];
      children.splice(sourceIndex + 1, 0, duplicate);
      return { ...group, children, itemRefs: children.map((child) => child.ref) };
    }));
    onSelect(duplicate.id);
  };

  const duplicateVariantChildBlock = (groupId, childId) => {
    const parent = findBlockById(blocks, groupId);
    const sourceIndex = parent?.children?.findIndex((child) => child.id === childId) ?? -1;
    if (sourceIndex === -1) return;
    const variant = createVariantBlock(parent.children[sourceIndex]);
    replaceBlocks(updateBlockInTree(blocks, groupId, (group) => {
      const children = [...(group.children || [])];
      children.splice(sourceIndex + 1, 0, variant);
      return { ...group, children, itemRefs: children.map((child) => child.ref) };
    }));
    onSelect(variant.id);
  };

  const rephraseTaskBlock = (block) => {
    if (!block || block.type !== 'task') return;
    const sourceText = block.question || block.instruction || block.title || '';
    const variants = createRephraseVariants(sourceText);
    if (variants.length === 0) return;
    const nextQuestion = variants[Math.floor(Math.random() * variants.length)];
    const nextBlock = {
      ...block,
      question: nextQuestion,
    };
    replaceBlocks(updateBlockInTree(blocks, block.id, () => nextBlock));
    onSelect(block.id);
  };

  const wrapChildBlockInGroup = (groupId, childId) => {
    replaceBlocks(updateBlockInTree(blocks, groupId, (group) => {
      const sourceIndex = (group.children || []).findIndex((child) => child.id === childId);
      if (sourceIndex === -1) return group;
      const source = group.children[sourceIndex];
      if (source.type === 'group' || source.type === 'split_group') return group;
      const nestedGroup = createDefaultBlock('group');
      nestedGroup.title = `${getBlockLabel(source, sourceIndex)} Group`;
      nestedGroup.instruction = 'Grouped for multi-step practice.';
      nestedGroup.children = [source];
      nestedGroup.itemRefs = [source.ref];
      const children = [...group.children];
      children.splice(sourceIndex, 1, nestedGroup);
      return { ...group, children, itemRefs: children.map((child) => child.ref) };
    }));
    onSelect(childId);
  };

  const moveChildInGroup = (groupId, childId, direction) => {
    replaceBlocks(updateBlockInTree(blocks, groupId, (group) => {
      const children = [...(group.children || [])];
      const sourceIndex = children.findIndex((child) => child.id === childId);
      if (sourceIndex === -1) return group;
      const targetIndex = Math.max(0, Math.min(children.length - 1, sourceIndex + direction));
      if (targetIndex === sourceIndex) return group;
      const [moved] = children.splice(sourceIndex, 1);
      children.splice(targetIndex, 0, moved);
      return { ...group, children, itemRefs: children.map((child) => child.ref) };
    }));
    onSelect(childId);
  };

  const ungroupChildBlock = (groupId, childId) => {
    replaceBlocks(updateBlockInTree(blocks, groupId, (group) => {
      const children = [...(group.children || [])];
      const sourceIndex = children.findIndex((child) => child.id === childId);
      const source = children[sourceIndex];
      if (sourceIndex === -1 || source?.type !== 'group') return group;
      children.splice(sourceIndex, 1, ...(source.children || []));
      return { ...group, children, itemRefs: children.map((child) => child.ref) };
    }));
  };

  const combineTopLevelBlocks = (event, targetBlockId) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    const builderType = event.dataTransfer.getData('application/x-builder-type');
    const draggedBlockId = event.dataTransfer.getData('application/x-block-id');
    const targetIndex = blocks.findIndex((block) => block.id === targetBlockId);
    if (targetIndex === -1) return;
    const target = blocks[targetIndex];
    if (draggedBlockId) {
      const sourceIndex = blocks.findIndex((block) => block.id === draggedBlockId);
      if (sourceIndex === -1 || sourceIndex === targetIndex) return;
      const source = blocks[sourceIndex];
      const children = sourceIndex < targetIndex ? [source, target] : [target, source];
      const group = createAdHocGroup(children, `${getBlockLabel(target, targetIndex)} Group`);
      const nextBlocks = blocks.filter((block) => block.id !== source.id && block.id !== target.id);
      nextBlocks.splice(Math.min(sourceIndex, targetIndex), 0, group);
      replaceBlocks(nextBlocks);
      onSelect(group.id);
      return;
    }
    if (builderType) {
      const newBlock = createDefaultBlock(builderType, { blank: true });
      const group = createAdHocGroup([target, newBlock], `${getBlockLabel(target, targetIndex)} Group`);
      const nextBlocks = [...blocks];
      nextBlocks.splice(targetIndex, 1, group);
      replaceBlocks(nextBlocks);
      onSelect(group.id);
    }
  };

  const combineGroupChildren = (event, groupId, targetChildId) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);
    const builderType = event.dataTransfer.getData('application/x-builder-type');
    const sourceGroupId = event.dataTransfer.getData('application/x-group-id');
    const childId = event.dataTransfer.getData('application/x-group-child-id');
    if (builderType) {
      replaceBlocks(updateBlockInTree(blocks, groupId, (group) => {
        const targetIndex = (group.children || []).findIndex((child) => child.id === targetChildId);
        if (targetIndex === -1) return group;
        const target = group.children[targetIndex];
        const newBlock = createDefaultBlock(builderType, { blank: true });
        const nestedGroup = createAdHocGroup([target, newBlock], `${getBlockLabel(target, targetIndex)} Group`);
        const children = [...group.children];
        children.splice(targetIndex, 1, nestedGroup);
        return { ...group, children, itemRefs: children.map((child) => child.ref) };
      }));
      return;
    }
    if (sourceGroupId && childId && sourceGroupId === groupId) {
      replaceBlocks(updateBlockInTree(blocks, groupId, (group) => {
        const children = [...(group.children || [])];
        const sourceIndex = children.findIndex((child) => child.id === childId);
        const targetIndex = children.findIndex((child) => child.id === targetChildId);
        if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return group;
        const source = children[sourceIndex];
        const target = children[targetIndex];
        const pair = sourceIndex < targetIndex ? [source, target] : [target, source];
        const nestedGroup = createAdHocGroup(pair, `${getBlockLabel(target, targetIndex)} Group`);
        const nextChildren = children.filter((child) => child.id !== source.id && child.id !== target.id);
        nextChildren.splice(Math.min(sourceIndex, targetIndex), 0, nestedGroup);
        return { ...group, children: nextChildren, itemRefs: nextChildren.map((child) => child.ref) };
      }));
    }
  };

  const handleTopLevelDrop = (event, targetIndex) => {
    event.preventDefault();
    setDropTarget(null);
    const builderType = event.dataTransfer.getData('application/x-builder-type');
    const draggedBlockId = event.dataTransfer.getData('application/x-block-id');
    const sourceGroupId = event.dataTransfer.getData('application/x-group-id');
    const childId = event.dataTransfer.getData('application/x-group-child-id');
    if (builderType) {
      const nextBlock = createDefaultBlock(builderType, { blank: true });
      const nextBlocks = [...blocks];
      nextBlocks.splice(targetIndex, 0, nextBlock);
      replaceBlocks(nextBlocks);
      onSelect(nextBlock.id);
      return;
    }
    if (draggedBlockId) {
      const sourceIndex = blocks.findIndex((block) => block.id === draggedBlockId);
      if (sourceIndex === -1 || sourceIndex === targetIndex) return;
      const nextBlocks = [...blocks];
      const [moved] = nextBlocks.splice(sourceIndex, 1);
      const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      nextBlocks.splice(insertIndex, 0, moved);
      replaceBlocks(nextBlocks);
      onSelect(moved.id);
      return;
    }
    if (sourceGroupId && childId) {
      const sourceGroup = findBlockById(blocks, sourceGroupId);
      const movingChild = sourceGroup?.children?.find((child) => child.id === childId);
      if (!movingChild) return;
      const removed = updateBlockInTree(blocks, sourceGroupId, (group) => {
        const children = (group.children || []).filter((child) => child.id !== childId);
        return { ...group, children, itemRefs: children.map((child) => child.ref) };
      });
      const nextBlocks = [...removed];
      nextBlocks.splice(targetIndex, 0, movingChild);
      replaceBlocks(nextBlocks);
      onSelect(movingChild.id);
    }
  };

  const handleGroupDrop = (event, groupId, targetIndex) => {
    event.preventDefault();
    setDropTarget(null);
    const builderType = event.dataTransfer.getData('application/x-builder-type');
    const draggedBlockId = event.dataTransfer.getData('application/x-block-id');
    const sourceGroupId = event.dataTransfer.getData('application/x-group-id');
    const childId = event.dataTransfer.getData('application/x-group-child-id');

    if (builderType) {
      const nextBlocks = addBlockToGroup(blocks, groupId, createDefaultBlock(builderType, { blank: true }), targetIndex);
      replaceBlocks(nextBlocks);
      return;
    }

    if (sourceGroupId && childId && sourceGroupId === groupId) {
      const nextBlocks = reorderChildrenInGroup(blocks, groupId, childId, targetIndex);
      replaceBlocks(nextBlocks);
      onSelect(childId);
      return;
    }

    if (draggedBlockId) {
      const movingBlock = blocks.find((block) => block.id === draggedBlockId);
      if (!movingBlock) return;
      const nextTopLevel = blocks.filter((block) => block.id !== draggedBlockId);
      const nextBlocks = addBlockToGroup(nextTopLevel, groupId, movingBlock, targetIndex);
      replaceBlocks(nextBlocks);
      onSelect(movingBlock.id);
      return;
    }

    if (sourceGroupId && childId && sourceGroupId !== groupId) {
      const sourceGroup = findBlockById(blocks, sourceGroupId);
      const movingChild = sourceGroup?.children?.find((child) => child.id === childId);
      if (!movingChild) return;
      const removed = updateBlockInTree(blocks, sourceGroupId, (group) => {
        const children = (group.children || []).filter((child) => child.id !== childId);
        return { ...group, children, itemRefs: children.map((child) => child.ref) };
      });
      const nextBlocks = addBlockToGroup(removed, groupId, movingChild, targetIndex);
      replaceBlocks(nextBlocks);
      onSelect(movingChild.id);
    }
  };

  const handleGroupDragOver = (event, groupId, targetIndex) => {
    event.preventDefault();
    setDropTarget({ scope: 'group', groupId, index: targetIndex });
  };

  const handleGroupDragLeave = (event, groupId, targetIndex) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setDropTarget((current) => current?.scope === 'group' && current.groupId === groupId && current.index === targetIndex ? null : current);
    }
  };

  const handleGroupCombineHover = (groupId, targetId) => {
    setDropTarget({ scope: 'group-combine', groupId, targetId });
  };

  const handleGroupCombineLeave = (groupId, targetId) => {
    setDropTarget((current) => current?.scope === 'group-combine' && current.groupId === groupId && current.targetId === targetId ? null : current);
  };

  return (
    <>
      <div className="flex h-full min-h-0 overflow-x-hidden bg-white" ref={resizeRef}>
        {/* Desktop sidebar library */}
        <aside className="hidden h-full min-h-0 w-[320px] shrink-0 overflow-hidden border-r border-zinc-200 bg-[#fbfbfa] lg:flex lg:flex-col">
          <div className="border-b border-zinc-200 bg-[#fbfbfa] px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-400">Library</div>
              <div className="flex gap-1">
                <button type="button" onClick={() => setLibraryMode('catalog')} className={libraryMode === 'catalog' ? 'border border-zinc-900 bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white' : 'border border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-500'}>Browse</button>
                <button type="button" onClick={() => setLibraryMode('list')} className={libraryMode === 'list' ? 'border border-zinc-900 bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white' : 'border border-zinc-200 px-2 py-1 text-[10px] font-medium text-zinc-500'}>Search</button>
              </div>
            </div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks, slides…" className="mt-2.5 w-full border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900" />
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 outline-none focus:border-zinc-900">
              <option value="All">All types</option>
              <option value="★ Favorites">★ Favorites</option>
              <option value="Slides">Slides only</option>
              {categories.filter((entry) => entry !== 'All').map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </select>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
            {libraryMode === 'catalog' && !query.trim() ? (
              <div className="space-y-2">
                {catalogSections.map((section) => (
                  <section key={section.id}>
                    <button type="button" onClick={() => setCollapsedLibrarySections((current) => ({ ...current, [section.id]: !current[section.id] }))} className="flex w-full items-center justify-between gap-2 px-1 py-2 text-left">
                      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">{section.title}</span>
                      <span className="text-[10px] text-zinc-400">{collapsedLibrarySections[section.id] ? `+ ${section.entries.length}` : `${section.entries.length}`}</span>
                    </button>
                    {!collapsedLibrarySections[section.id] && (
                      <div className="grid grid-cols-1 gap-2 pb-2">
                        {section.entries.map((entry) => <PaletteCard key={entry.type} entry={entry} label={section.title} kind={section.kind} onAdd={addBlockAndTrack} isFavorite={isFavorite(entry.type)} onToggleFavorite={toggleFavorite} />)}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 px-1 py-1">
                  <span className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">{unifiedLibraryEntries.length} results</span>
                  <button type="button" onClick={() => setIsModalOpen(true)} className="text-[10px] text-zinc-500 underline decoration-zinc-300 hover:text-zinc-900">Full library</button>
                </div>
                {unifiedLibraryEntries.map((entry) => <PaletteCard key={`${entry.kind}-${entry.type}`} entry={entry} label={entry.groupLabel} kind={entry.kind} onAdd={addBlockAndTrack} isFavorite={isFavorite(entry.type)} onToggleFavorite={toggleFavorite} />)}
                {unifiedLibraryEntries.length === 0 && <div className="border border-dashed border-zinc-200 px-4 py-6 text-center text-xs text-zinc-400">No matches found.</div>}
              </div>
            )}
          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col lg:flex-row" style={{ '--preview-width': `${previewWidth}%` }}>
          <div className="flex min-w-0 flex-1 flex-col">
            {/* Mobile quick-add bar — replaced with FAB, see bottom of component */}

            <div className="min-h-0 flex-1 overflow-auto">
              <div className="mx-auto max-w-3xl space-y-2 p-2 pb-6 sm:space-y-3 sm:p-4 sm:pb-8">
                <QualityRing score={qualityScore} checks={qualityChecks} onFix={runQualityAction} />
                {/* Sticky header with navigator + add buttons */}
                <div className="sticky top-0 z-10 -mx-2 border-b border-zinc-200 bg-white/95 px-2 py-2 backdrop-blur-sm sm:-mx-4 sm:px-4">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{blocks.length} block{blocks.length !== 1 ? 's' : ''}</span>
                      <span className="hidden border border-zinc-200 bg-white px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-500 sm:inline">Est. {estimatedMinutes} min</span>
                      <span className="hidden border border-zinc-200 bg-white px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-500 sm:inline">Quality {qualityScore}</span>
                    </div>
                    <div className="hidden items-center gap-1 lg:flex">
                      <button type="button" onClick={() => setShowSlideLibrary(true)} className="inline-flex items-center gap-1 border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 transition hover:border-zinc-900"><PlusIcon /> Slide</button>
                      <button type="button" onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-1 border border-zinc-900 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white"><PlusIcon /> Task</button>
                      <button type="button" onClick={() => addBlockAndTrack(createDefaultBlock('group', { blank: true }))} className="inline-flex items-center gap-1 border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 transition hover:border-zinc-900"><PlusIcon /> Group</button>
                      <button type="button" onClick={() => setCollapsedTopSections(allSectionsCollapsed ? { slides: false, tasks: false, groups: false } : { slides: true, tasks: true, groups: true })} className="inline-flex items-center gap-1 border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 transition hover:border-zinc-900">{allSectionsCollapsed ? 'Expand all' : 'Collapse all'}</button>
                      <button type="button" onClick={() => setShowUtilityPanels((current) => !current)} className="inline-flex items-center gap-1 border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 transition hover:border-zinc-900">{showUtilityPanels ? 'Hide utilities' : 'Show utilities'}</button>
                      <button type="button" onClick={() => setShowQuickAdd(true)} className="ml-0.5 border border-zinc-200 px-1.5 py-1 text-[9px] text-zinc-400 transition hover:border-zinc-400 hover:text-zinc-600" title="Quick add (Ctrl+K)">⌘K</button>
                    </div>
                  </div>
                  <div className="mt-1.5">
                    <BlockNavigator blocks={blocks} selectedId={selected?.id} onSelect={focusBlock} />
                  </div>
                </div>

                {/* Recently used quick strip */}
                {recentTypes.length > 0 && (
                  <div className="hidden flex-wrap gap-1.5 sm:flex">
                    <span className="self-center text-[9px] font-medium uppercase tracking-[0.16em] text-zinc-300">Recent:</span>
                    {recentTypes.slice(0, 4).map((type) => {
                      const def = getTaskDefinition(type);
                      if (!def || def.type === 'generic') return null;
                      return (
                        <button key={type} type="button" onClick={() => addBlockAndTrack(createDefaultBlock(type, { blank: true }))} className="border border-zinc-200 bg-white px-2 py-1 text-[10px] text-zinc-600 transition hover:border-zinc-400">{def.label}</button>
                      );
                    })}
                  </div>
                )}

                {showUtilityPanels && <div className="grid gap-2 lg:grid-cols-2">
                  <div className="border border-zinc-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Batch edit tasks</div>
                        <div className="text-[11px] text-zinc-500">Apply points and required flags in one action.</div>
                      </div>
                      <div className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] text-zinc-600">{taskBlocks.length} tasks</div>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <label className="space-y-1">
                        <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Scope</span>
                        <select value={batchScope} onChange={(event) => setBatchScope(event.target.value)} className="w-full border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 outline-none focus:border-zinc-900">
                          <option value="all">All tasks</option>
                          <option value="section">Selected section</option>
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Points</span>
                        <input type="number" min="0.1" step="0.1" value={batchPoints} onChange={(event) => setBatchPoints(event.target.value)} className="w-full border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 outline-none focus:border-zinc-900" />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Required</span>
                        <select value={batchRequiredMode} onChange={(event) => setBatchRequiredMode(event.target.value)} className="w-full border border-zinc-200 px-2 py-1.5 text-xs text-zinc-700 outline-none focus:border-zinc-900">
                          <option value="keep">Keep as-is</option>
                          <option value="required">Set required</option>
                          <option value="optional">Set optional</option>
                        </select>
                      </label>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={applyBatchTaskUpdates} className="border border-zinc-900 bg-zinc-900 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white">Apply batch edit</button>
                      {batchMessage && <span className="text-[10px] text-zinc-500">{batchMessage}</span>}
                    </div>
                  </div>

                  <div className="border border-zinc-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Lesson quality</div>
                        <div className="text-[11px] text-zinc-500">Readability, timing, and duplication checks.</div>
                      </div>
                      <div className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-700">Score {qualityScore}</div>
                    </div>
                    <div className="mt-2 grid gap-1 text-[11px] text-zinc-600 sm:grid-cols-3">
                      <div className="border border-zinc-200 bg-zinc-50 px-2 py-1">Readability: {readability.score === null ? 'n/a' : readability.score}</div>
                      <div className="border border-zinc-200 bg-zinc-50 px-2 py-1">Grade level: {readability.gradeLevel === null ? 'n/a' : readability.gradeLevel}</div>
                      <div className="border border-zinc-200 bg-zinc-50 px-2 py-1">Estimate: {estimatedMinutes} min</div>
                    </div>
                    {duplicateQuestionGroups.length > 0 && (
                      <div className="mt-2 border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
                        Duplicate prompts detected: {duplicateQuestionGroups.length}. <button type="button" onClick={() => runQualityAction('focus_duplicate')} className="underline">Jump to first duplicate</button>
                      </div>
                    )}
                    <div className="mt-2 space-y-1">
                      {qualityChecks.map((check) => (
                        <div key={check.id} className={check.passed ? 'flex items-center justify-between gap-2 border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-700' : 'flex items-center justify-between gap-2 border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] text-zinc-600'}>
                          <span>{check.label}</span>
                          {!check.passed && <button type="button" onClick={() => runQualityAction(check.action)} className="shrink-0 border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] uppercase tracking-[0.12em] text-zinc-600">Fix</button>}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>}

                {/* Smart suggestions */}
                {suggestions.length > 0 && !mobileDragItem && (
                  <div className="hidden space-y-1.5 sm:block">
                    {suggestions.map((tip, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2">
                        <span className="text-[11px] text-zinc-500">💡 {tip.text}</span>
                        {tip.action && <button type="button" onClick={tip.action} className="shrink-0 border border-zinc-300 px-2 py-1 text-[10px] font-medium text-zinc-600 transition hover:border-zinc-900">+ Add</button>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Mobile drag mode banner */}
                {mobileDragItem && (
                  <div className="border-2 border-zinc-900 bg-zinc-950 px-4 py-3 text-white">
                    <div className="text-sm font-semibold">Moving block…</div>
                    <div className="mt-1 text-xs text-zinc-400">Tap a highlighted zone to place it, or tap Cancel to abort.</div>
                    <button type="button" onClick={finishMobileDrag} className="mt-2 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-800">Cancel</button>
                  </div>
                )}
                {!mobileDragItem && blocks.length > 0 && (
                  <QuickAddDivider
                    onAddTask={() => insertBlockAtIndex(0, createDefaultBlock('multiple_choice', { blank: true }))}
                    onAddSlide={() => insertBlockAtIndex(0, createDefaultBlock('slide', { blank: true }))}
                    onAddGroup={() => insertBlockAtIndex(0, createDefaultBlock('group', { blank: true }))}
                  />
                )}
                {blocks.map((block, index) => {
                  const definition = block.type === 'task' ? getTaskDefinition(block.taskType) : null;
                  const selectedTopLevel = selected?.id === block.id;
                  const catMeta = CATEGORY_META[definition?.category] || { icon: (block.type === 'group' || block.type === 'split_group') ? '▤' : '□', accent: 'border-zinc-300 text-zinc-600' };
                  const sectionKey = sectionKeyForBlock(block);
                  const previousSectionKey = index > 0 ? sectionKeyForBlock(blocks[index - 1]) : null;
                  const showSectionHeader = index === 0 || sectionKey !== previousSectionKey;
                  const sectionCollapsed = Boolean(collapsedTopSections[sectionKey]);
                  const blockHasDuplicateQuestion = duplicateQuestionIdSet.has(block.id);

                  if (sectionCollapsed && !showSectionHeader) {
                    return null;
                  }

                  return (
                    <div
                      key={block.id}
                      className="space-y-1"
                    >
                      {!mobileDragItem && index > 0 && (
                        <QuickAddDivider
                          onAddTask={() => insertBlockAtIndex(index, createDefaultBlock('multiple_choice', { blank: true }))}
                          onAddSlide={() => insertBlockAtIndex(index, createDefaultBlock('slide', { blank: true }))}
                          onAddGroup={() => insertBlockAtIndex(index, createDefaultBlock('group', { blank: true }))}
                        />
                      )}
                      {showSectionHeader && (
                        <div className="flex items-center justify-between border border-zinc-200 bg-zinc-50 px-3 py-2">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{sectionLabelFromKey(sectionKey)} ({sectionCounts[sectionKey] || 0})</div>
                          <button type="button" title={sectionCollapsed ? 'Expand section' : 'Collapse section'} onClick={() => setCollapsedTopSections((current) => ({ ...current, [sectionKey]: !current[sectionKey] }))} className="inline-flex h-7 w-7 items-center justify-center border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-900">
                            <ChevronIcon direction={sectionCollapsed ? 'down' : 'up'} />
                          </button>
                        </div>
                      )}

                      {sectionCollapsed ? (
                        <div className="border border-dashed border-zinc-200 px-3 py-2 text-[11px] text-zinc-500">Section collapsed. Expand to edit blocks.</div>
                      ) : (
                        <div
                          ref={(node) => {
                            if (node) blockRefs.current.set(block.id, node); else blockRefs.current.delete(block.id);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setDropTarget({ scope: 'top', index });
                          }}
                          onDragLeave={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget((current) => current?.scope === 'top' && current.index === index ? null : current);
                          }}
                          onDrop={(event) => handleTopLevelDrop(event, index)}
                          onClick={() => {
                            if (mobileDragItem) moveMobileItemToTop(index);
                          }}
                          className="space-y-1"
                        >
                          <DropIndicator active={dropTarget?.scope === 'top' && dropTarget.index === index} label={mobileDragItem ? 'Tap to place here' : 'Drop here'} />
                          <div
                            draggable
                            onDragStart={(event) => event.dataTransfer.setData('application/x-block-id', block.id)}
                            onPointerDown={() => beginMobileDrag({ kind: 'top', blockId: block.id })}
                            onPointerUp={endMobileDragPress}
                            onPointerLeave={endMobileDragPress}
                            onPointerCancel={endMobileDragPress}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setDropTarget({ scope: 'top-combine', targetId: block.id });
                            }}
                            onDragLeave={(event) => {
                              if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget((current) => current?.scope === 'top-combine' && current.targetId === block.id ? null : current);
                            }}
                            onDrop={(event) => combineTopLevelBlocks(event, block.id)}
                            className={selectedTopLevel ? 'border border-zinc-900 bg-white' : dropTarget?.scope === 'top-combine' && dropTarget.targetId === block.id ? 'border-2 border-dashed border-zinc-900 bg-zinc-50' : mobileDragItem?.blockId === block.id ? 'border-2 border-zinc-900 bg-zinc-50' : 'border border-zinc-200 bg-white transition hover:border-zinc-400'}
                          >
                        {/* Block card header — always visible */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelect(block.id)}
                          onKeyDown={(event) => handleSelectableCardKeyDown(event, () => onSelect(block.id))}
                          className="flex w-full items-start gap-2 p-2 text-left sm:gap-3 sm:p-3"
                        >
                          {/* Left: Index + drag handle */}
                          <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                            <span className={selectedTopLevel ? 'flex h-6 w-6 items-center justify-center bg-zinc-900 text-[10px] font-semibold text-white' : 'flex h-6 w-6 items-center justify-center border border-zinc-200 text-[10px] font-semibold text-zinc-500'}>{index + 1}</span>
                            <DragHandleIcon className="hidden text-zinc-300 sm:block" />
                          </div>
                          {/* Center: Content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex h-4 items-center gap-1 px-1.5 text-[9px] font-medium uppercase tracking-[0.1em] ${selectedTopLevel ? 'bg-zinc-900 text-white' : `border ${catMeta.accent} bg-white`}`}>
                                {catMeta.icon} {definition?.category || block.type}
                              </span>
                              {!block.enabled && <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-400">Disabled</span>}
                              {blockHasDuplicateQuestion && <span className="border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-amber-700">Duplicate prompt</span>}
                            </div>
                            <div className={selectedTopLevel ? 'hidden' : 'mt-1 text-sm font-semibold text-zinc-800'}>
                              {getBlockLabel(block, index)}
                            </div>
                            {!selectedTopLevel && <div className="mt-1 hidden line-clamp-2 text-xs leading-relaxed text-zinc-500 sm:block"><Md text={block.instruction || block.content || block.text || block.question || definition?.description || ''} /></div>}
                          </div>
                          {/* Right: Quick actions — horizontal row */}
                          <div className={`shrink-0 flex-row gap-1 ${selectedTopLevel ? 'flex' : 'hidden sm:flex'}`}>
                            {block.type === 'task' && (
                              <IconActionButton title={block.enabled === false ? 'Enable task' : 'Disable task'} onClick={(event) => { event.stopPropagation(); replaceBlocks(updateBlockInTree(blocks, block.id, (current) => ({ ...current, enabled: current.enabled === false }))); }} className="border-zinc-200 text-zinc-400 hover:text-zinc-900"><span className="text-[10px]">{block.enabled === false ? 'OFF' : 'ON'}</span></IconActionButton>
                            )}
                            {aiEnabled && block.type === 'task' && (
                              <IconActionButton title="AI Rephrase" onClick={(event) => { event.stopPropagation(); rephraseTaskBlock(block); }} className="border-zinc-200 text-zinc-400 hover:text-zinc-900"><span className="text-[10px]">AI</span></IconActionButton>
                            )}
                            <IconActionButton title="Move up" onClick={(event) => { event.stopPropagation(); moveTopLevelBlock(block.id, -1); }} className="border-zinc-200 text-zinc-400 hover:text-zinc-900"><ChevronIcon direction="up" /></IconActionButton>
                            <IconActionButton title="Move down" onClick={(event) => { event.stopPropagation(); moveTopLevelBlock(block.id, 1); }} className="border-zinc-200 text-zinc-400 hover:text-zinc-900"><ChevronIcon direction="down" /></IconActionButton>
                            <IconActionButton title="Duplicate" onClick={(event) => { event.stopPropagation(); duplicateTopLevelBlock(block.id); }} className="border-zinc-200 text-zinc-400 hover:text-zinc-900"><span className="text-xs">⧉</span></IconActionButton>
                            <IconActionButton title="Duplicate variant" onClick={(event) => { event.stopPropagation(); duplicateVariantTopLevelBlock(block.id); }} className="border-zinc-200 text-zinc-400 hover:text-zinc-900"><span className="text-xs">⋇</span></IconActionButton>
                            <IconActionButton title="Delete" onClick={(event) => { event.stopPropagation(); onDeleteBlock(block.id); }} className="border-zinc-200 text-zinc-400 hover:text-red-600"><TrashIcon /></IconActionButton>
                          </div>
                        </div>

                        {/* Expanded editor — shown when selected */}
                        {selectedTopLevel && block.type !== 'group' && (
                          <div className="border-t border-zinc-200 bg-[#fcfcfb] p-2 sm:p-4">
                            <div>
                              <BlockEditorForm block={block} onChange={updateSelected} />
                            </div>
                            <div className="mt-3 border-t border-zinc-200 pt-3 sm:mt-4 sm:pt-4 lg:hidden">
                              {renderBlockPreview(block)}
                            </div>
                          </div>
                        )}
                      </div>

                      {(block.type === 'group' || block.type === 'split_group') && (
                        <GroupNodeEditor
                          block={block}
                          selectedId={selected?.id}
                          onSelect={onSelect}
                          onUpdateChild={(nextChild) => replaceBlocks(updateBlockInTree(blocks, nextChild.id, () => nextChild))}
                          onOpenModalForGroup={(groupId) => {
                            setModalTargetGroupId(groupId);
                            setIsModalOpen(true);
                          }}
                          onDropBuilder={handleGroupDrop}
                          onDragOverTarget={handleGroupDragOver}
                          onDragLeaveTarget={handleGroupDragLeave}
                          onCombineHover={handleGroupCombineHover}
                          onCombineLeave={handleGroupCombineLeave}
                          onCombineDrop={combineGroupChildren}
                          dropTarget={dropTarget}
                          onDeleteChild={(childId) => replaceBlocks(deleteBlockFromTree(blocks, childId))}
                          onMoveChild={moveChildInGroup}
                          onUngroupChild={ungroupChildBlock}
                          onVariantChild={duplicateVariantChildBlock}
                          onBeginMobileDrag={beginMobileDrag}
                          onEndMobileDragPress={endMobileDragPress}
                          onMobileDropGroup={moveMobileItemToGroup}
                          mobileDragItem={mobileDragItem}
                        />
                      )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropTarget({ scope: 'top', index: blocks.length });
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget((current) => current?.scope === 'top' && current.index === blocks.length ? null : current);
                  }}
                  onDrop={(event) => handleTopLevelDrop(event, blocks.length)}
                  onClick={() => {
                    if (mobileDragItem) moveMobileItemToTop(blocks.length);
                  }}
                  className={dropTarget?.scope === 'top' && dropTarget.index === blocks.length ? 'flex min-h-20 items-center justify-center border-2 border-dashed border-zinc-900 bg-zinc-50 text-xs font-medium text-zinc-700' : 'flex min-h-16 items-center justify-center border border-dashed border-zinc-200 text-xs text-zinc-400 transition hover:border-zinc-400 hover:text-zinc-600'}
                >
                  {mobileDragItem ? 'Tap to place at end' : blocks.length === 0 ? 'Drop or add your first block' : 'Drop here to add at end'}
                </div>
              </div>
            </div>
          </div>

          <div role="separator" aria-orientation="vertical" className="hidden w-1.5 cursor-col-resize bg-zinc-100 transition hover:bg-zinc-300 lg:block" onPointerDownCapture={(event) => { resizeRef.current = event.currentTarget.parentElement; }} />

          <aside className="hidden min-w-[300px] border-l border-zinc-200 bg-[#fcfcfb] lg:block" style={{ width: `var(--preview-width)` }}>
            <div className="sticky top-0 border-b border-zinc-200 bg-[#fcfcfb] px-4 py-2">
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">Preview</div>
            </div>
            <div className="h-full overflow-auto p-4">
              {selected ? renderBlockPreview(selected) : <div className="py-12 text-center text-xs text-zinc-400">Select a block to preview</div>}
            </div>
          </aside>
        </section>
      </div>

      {/* Quick-add command palette (Ctrl+K) */}
      {showQuickAdd && (
        <div className="fixed inset-0 z-50 bg-black/30 p-4 backdrop-blur-[2px]">
          <button type="button" onClick={() => setShowQuickAdd(false)} className="absolute inset-0" />
          <div className="relative mx-auto mt-[10vh] max-w-lg animate-soft-rise border border-zinc-900 bg-white">
            <input ref={quickAddRef} autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search for a task or slide to add…" className="w-full border-b border-zinc-200 px-4 py-3 text-sm outline-none" onKeyDown={(event) => { if (event.key === 'Escape') setShowQuickAdd(false); }} />
            <div className="max-h-[50vh] overflow-auto p-2">
              {[...filteredTasks.slice(0, 8), ...filteredSlides.slice(0, 4)].map((entry) => (
                <button key={entry.type} type="button" onClick={() => { addBlockAndTrack(createDefaultBlock(entry.type, { blank: true })); setShowQuickAdd(false); setQuery(''); }} className="flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-zinc-50">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center border border-zinc-200 text-[9px]">{(CATEGORY_META[entry.category] || {}).icon || '□'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-900">
                      {entry.label}
                      {isFavorite(entry.type) && <span className="text-amber-500 text-[10px]">★</span>}
                    </div>
                    <div className="truncate text-[11px] text-zinc-500">{entry.description || entry.category || entry.layout}</div>
                  </div>
                  <span className="text-[10px] text-zinc-400">↵</span>
                </button>
              ))}
              {filteredTasks.length === 0 && filteredSlides.length === 0 && <div className="px-3 py-4 text-center text-xs text-zinc-400">No matches</div>}
            </div>
          </div>
        </div>
      )}

      <AddTaskModal
        isOpen={isModalOpen}
        initialType="multiple_choice"
        onClose={() => {
          setIsModalOpen(false);
          setModalTargetGroupId(null);
        }}
        onConfirm={(newBlocks) => {
          newBlocks.forEach((b) => trackRecentType(b.taskType || b.type));
          if (modalTargetGroupId) {
            let nextBlocks = blocks;
            newBlocks.forEach((block) => {
              nextBlocks = addBlockToGroup(nextBlocks, modalTargetGroupId, block);
            });
            replaceBlocks(nextBlocks);
            onSelect(newBlocks.at(-1)?.id || selectedId);
          } else {
            const nextBlocks = [...blocks, ...newBlocks];
            replaceBlocks(nextBlocks);
            onSelect(newBlocks.at(-1)?.id || selectedId);
          }
        }}
      />
      {/* Mobile FAB */}
      <button type="button" onClick={() => setShowMobileFab(true)} className="fixed bottom-28 right-4 z-30 flex h-14 w-14 items-center justify-center border border-zinc-900 bg-zinc-900 text-white shadow-[0_4px_20px_rgba(0,0,0,0.25)] sm:bottom-20 lg:hidden" aria-label="Add content">
        <PlusIconSharp width={24} height={24} />
      </button>

      {/* Mobile add bottom sheet */}
      {showMobileFab && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden">
          <button type="button" onClick={() => setShowMobileFab(false)} className="absolute inset-0" />
          <div className="absolute inset-x-0 bottom-0 max-h-[70vh] animate-soft-rise overflow-auto border-t border-zinc-200 bg-white [padding-bottom:env(safe-area-inset-bottom)]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3">
              <div className="text-sm font-semibold text-zinc-900">Add Content</div>
              <button type="button" onClick={() => setShowMobileFab(false)} className="border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700">Close</button>
            </div>
            <div className="grid grid-cols-3 gap-px bg-zinc-100 p-0">
              <button type="button" onClick={() => { setShowMobileFab(false); setIsModalOpen(true); }} className="flex flex-col items-center gap-2 bg-white px-3 py-5 active:bg-zinc-50">
                <span className="flex h-10 w-10 items-center justify-center border border-zinc-900 bg-zinc-900 text-white"><PlusIconSharp width={20} height={20} /></span>
                <span className="text-xs font-medium text-zinc-800">Task</span>
                <span className="text-[10px] text-zinc-400">Full library</span>
              </button>
              <button type="button" onClick={() => { setShowMobileFab(false); setShowSlideLibrary(true); }} className="flex flex-col items-center gap-2 bg-white px-3 py-5 active:bg-zinc-50">
                <span className="flex h-10 w-10 items-center justify-center border border-zinc-200 text-zinc-600"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="14" height="12"/><path d="M3 8h14"/></svg></span>
                <span className="text-xs font-medium text-zinc-800">Slide</span>
                <span className="text-[10px] text-zinc-400">Info, rich, table</span>
              </button>
              <button type="button" onClick={() => { setShowMobileFab(false); addBlockAndTrack(createDefaultBlock('group', { blank: true })); }} className="flex flex-col items-center gap-2 bg-white px-3 py-5 active:bg-zinc-50">
                <span className="flex h-10 w-10 items-center justify-center border border-zinc-200 text-zinc-600"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="6" height="6"/><rect x="11" y="3" width="6" height="6"/><rect x="3" y="11" width="6" height="6"/><rect x="11" y="11" width="6" height="6"/></svg></span>
                <span className="text-xs font-medium text-zinc-800">Group</span>
                <span className="text-[10px] text-zinc-400">Multi-task set</span>
              </button>
              {onOpenGuide && (
                <button type="button" onClick={() => { setShowMobileFab(false); onOpenGuide(); }} className="flex flex-col items-center gap-2 bg-white px-3 py-5 active:bg-zinc-50">
                  <span className="flex h-10 w-10 items-center justify-center border border-zinc-900 bg-zinc-900 text-white text-lg font-bold">?</span>
                  <span className="text-xs font-medium text-zinc-800">Guide</span>
                  <span className="text-[10px] text-zinc-400">AI assistant</span>
                </button>
              )}
            </div>
            {recentTypes.length > 0 && (
              <div className="border-t border-zinc-200 px-4 py-3">
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">Recently Used</div>
                <div className="flex flex-wrap gap-2">
                  {recentTypes.slice(0, 6).map((type) => {
                    const def = getTaskDefinition(type);
                    if (!def || def.type === 'generic') return null;
                    return (
                      <button key={type} type="button" onClick={() => { setShowMobileFab(false); addBlockAndTrack(createDefaultBlock(type, { blank: true })); }} className="border border-zinc-200 px-3 py-2 text-xs text-zinc-700 active:bg-zinc-50">{def.label}</button>
                    );
                  })}
                </div>
              </div>
            )}
            {favorites.length > 0 && (
              <div className="border-t border-zinc-200 px-4 py-3">
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">★ Favorites</div>
                <div className="flex flex-wrap gap-2">
                  {favorites.slice(0, 8).map((type) => {
                    const def = getTaskDefinition(type);
                    if (!def || def.type === 'generic') return null;
                    return (
                      <button key={type} type="button" onClick={() => { setShowMobileFab(false); addBlockAndTrack(createDefaultBlock(type, { blank: true })); }} className="border border-zinc-200 px-3 py-2 text-xs text-zinc-700 active:bg-zinc-50">★ {def.label}</button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <MobileSlideLibrarySheet isOpen={showSlideLibrary} onClose={() => setShowSlideLibrary(false)} onAdd={addBlockAndTrack} />
    </>
  );
}
