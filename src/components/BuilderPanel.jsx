import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { SLIDE_REGISTRY } from '../config/slideRegistry';
import { TASK_REGISTRY, getTaskDefinition } from '../config/taskRegistry';
import { addBlockToGroup, cloneBlockTree, createDefaultBlock, deleteBlockFromTree, findBlockById, getTaskCategories, reorderChildrenInGroup, updateBlockField, updateBlockInTree } from '../utils/builder';
import { flattenBlocks, getBlockLabel } from '../utils/lesson';
import useFavorites from '../hooks/useFavorites';
import { Md } from './FormattedText';
import AddTaskModal from './AddTaskModal';
import BlockEditorForm from './BlockEditorForm';
const BlockPreview = lazy(() => import('./BlockPreview'));

function DragHandleIcon({ className = '' }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M5 3.5h.01M5 8h.01M5 12.5h.01M11 3.5h.01M11 8h.01M11 12.5h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon({ className = '' }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M8 3.25v9.5M3.25 8h9.5" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon({ className = '' }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2.75 4.25h10.5M6.25 2.75h3.5M5.25 6.25v5.5M8 6.25v5.5M10.75 6.25v5.5M4.5 4.25l.5 8h6l.5-8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ direction = 'up', className = '' }) {
  const path = direction === 'up' ? 'M4 10 8 6l4 4' : 'M4 6l4 4 4-4';
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d={path} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
        'inline-flex h-8 w-8 items-center justify-center border border-current transition disabled:cursor-not-allowed disabled:opacity-30',
        className,
      ].join(' ')}
    >
      {children}
    </button>
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
  Containers: ['group'],
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

function PaletteCard({ entry, label, kind = 'task', onAdd, isFavorite, onToggleFavorite }) {
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
          {kind === 'slide' && <div className="mb-2 overflow-hidden"><MiniSlidePreview layout={entry.layout || (entry.type === 'group' ? 'group' : 'single')} /></div>}
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
}

function MobilePreviewSheet({ block, isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/40 lg:hidden">
      <button type="button" onClick={onClose} className="absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 max-h-[85vh] animate-soft-rise overflow-auto border-t border-zinc-200 bg-white">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Preview</div>
          <button type="button" onClick={onClose} className="border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-900">Close</button>
        </div>
        <div className="p-4">
          {block ? renderBlockPreview(block) : <div className="py-8 text-center text-sm text-zinc-400">Select a block to preview.</div>}
        </div>
      </div>
    </div>
  );
}

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

function DropIndicator({ active, label = 'Drop here' }) {
  return (
    <div className={active ? 'pointer-events-none flex min-h-10 items-center justify-center border-2 border-dashed border-zinc-900 bg-zinc-50 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-700 transition-all' : 'pointer-events-none h-1 transition-all'}>
      {active ? label : ''}
    </div>
  );
}

function InlineQuickFields({ block, onChange }) {
  if (!block) return null;
  const isTask = block.type === 'task';
  if (!isTask) {
    return (
      <div className="space-y-3">
        <input value={block.title || ''} onChange={(event) => onChange(updateBlockField(block, 'title', event.target.value))} placeholder="Slide title" className="w-full border-b border-zinc-200 bg-transparent px-1 py-2 text-base font-semibold text-zinc-900 outline-none placeholder:text-zinc-300 focus:border-zinc-900" />
        <input value={block.instruction || ''} onChange={(event) => onChange(updateBlockField(block, 'instruction', event.target.value))} placeholder="Brief instruction or subtitle" className="w-full border-b border-zinc-100 bg-transparent px-1 py-2 text-sm text-zinc-600 outline-none placeholder:text-zinc-300 focus:border-zinc-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <textarea value={block.question || ''} onChange={(event) => onChange(updateBlockField(block, 'question', event.target.value))} rows={2} placeholder="Type your question here…" className="w-full resize-none border-b border-zinc-200 bg-transparent px-1 py-2 text-base font-semibold text-zinc-900 outline-none placeholder:text-zinc-300 focus:border-zinc-900" />
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={block.hint || ''} onChange={(event) => onChange(updateBlockField(block, 'hint', event.target.value))} placeholder="Hint (optional)" className="w-full border-b border-zinc-100 bg-transparent px-1 py-2 text-sm text-zinc-600 outline-none placeholder:text-zinc-300 focus:border-zinc-400" />
        <input value={Array.isArray(block.answer) ? block.answer.join(' | ') : (block.answer || '')} onChange={(event) => onChange(updateBlockField(block, 'answer', event.target.value))} placeholder="Correct answer" className="w-full border-b border-zinc-100 bg-transparent px-1 py-2 text-sm text-zinc-600 outline-none placeholder:text-zinc-300 focus:border-zinc-400" />
      </div>
    </div>
  );
}

function BlockNavigator({ blocks, selectedId, onSelect }) {
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
}

function GroupNodeEditor({ block, selectedId, onSelect, onUpdateChild, onOpenModalForGroup, onDropBuilder, onDragOverTarget, onDragLeaveTarget, onCombineHover, onCombineLeave, onCombineDrop, dropTarget, onDeleteChild, onMoveChild, onUngroupChild, onBeginMobileDrag, onEndMobileDragPress, onMobileDropGroup, mobileDragItem, level = 0 }) {
  return (
    <div className="space-y-3 border border-zinc-200 bg-zinc-50 p-4" style={{ marginLeft: level > 0 ? `${level * 12}px` : 0 }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500"><DragHandleIcon /> <span>Group</span></div>
          <div className="text-sm font-medium text-zinc-900">{block.title || 'Nested group'}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onOpenModalForGroup(block.id)} className="inline-flex items-center gap-2 border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs text-white"><PlusIcon /> Add Task</button>
          <button type="button" onClick={() => onUpdateChild(addGroupPlaceholder(block))} className="inline-flex items-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700"><PlusIcon /> Add Group</button>
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
              <button
                type="button"
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
                className={selectedId === child.id ? 'w-full border border-zinc-900 bg-zinc-900 p-3 text-left text-white' : dropTarget?.scope === 'group-combine' && dropTarget.groupId === block.id && dropTarget.targetId === child.id ? 'w-full border-2 border-zinc-900 bg-zinc-100 p-3 text-left text-zinc-900' : mobileDragItem?.childId === child.id ? 'w-full border-2 border-zinc-900 bg-zinc-100 p-3 text-left text-zinc-900' : 'w-full border border-zinc-200 bg-white p-3 text-left text-zinc-900'}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] opacity-70"><DragHandleIcon className="text-current/70" /> <span>{child.type === 'task' ? getTaskDefinition(child.taskType).category : child.type}</span></div>
                    <div className="mt-1 text-sm font-semibold">{getBlockLabel(child, index)}</div>
                    <div className="mt-1 text-xs opacity-80">{child.instruction || child.text || child.content || (child.type === 'task' ? getTaskDefinition(child.taskType).description : 'Nested group')}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="border border-current px-2 py-0.5 text-[10px] uppercase">{index + 1}</span>
                    <IconActionButton title="Move up" onClick={(event) => { event.stopPropagation(); onMoveChild(block.id, child.id, -1); }}><ChevronIcon direction="up" /></IconActionButton>
                    <IconActionButton title="Move down" onClick={(event) => { event.stopPropagation(); onMoveChild(block.id, child.id, 1); }}><ChevronIcon direction="down" /></IconActionButton>
                    <IconActionButton title="Delete block" onClick={(event) => { event.stopPropagation(); onDeleteChild(child.id); }}><TrashIcon /></IconActionButton>
                  </div>
                </div>
              </button>
              {selectedId === child.id && child.type !== 'group' && (
                <div className="border border-zinc-200 bg-white p-4">
                  <InlineQuickFields block={child} onChange={onUpdateChild} />
                  <div className="mt-3">
                    <BlockEditorForm block={child} onChange={onUpdateChild} compact />
                  </div>
                  <div className="mt-3 lg:hidden border-t border-zinc-200 pt-3">
                    {renderBlockPreview(child)}
                  </div>
                </div>
              )}
              {child.type === 'group' && (
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
}

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

export default function BuilderPanel({ lesson, selectedId, onSelect, onReplaceLesson, onAddBlock, onDeleteBlock }) {
  const { favorites, toggle: toggleFavorite, isFavorite } = useFavorites();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [libraryMode, setLibraryMode] = useState('catalog');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTargetGroupId, setModalTargetGroupId] = useState(null);
  const [previewWidth, setPreviewWidth] = useState(36);
  const [showSlideLibrary, setShowSlideLibrary] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
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
  const selected = findBlockById(blocks, selectedId) || flattenBlocks(blocks)[0] || null;

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

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        setShowQuickAdd((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const replaceBlocks = (nextBlocks) => onReplaceLesson({ ...lesson, blocks: nextBlocks });

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

  const wrapTopLevelBlockInGroup = (blockId) => {
    const sourceIndex = blocks.findIndex((block) => block.id === blockId);
    if (sourceIndex === -1) return;
    const source = blocks[sourceIndex];
    if (source.type === 'group') return;
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

  const wrapChildBlockInGroup = (groupId, childId) => {
    replaceBlocks(updateBlockInTree(blocks, groupId, (group) => {
      const sourceIndex = (group.children || []).findIndex((child) => child.id === childId);
      if (sourceIndex === -1) return group;
      const source = group.children[sourceIndex];
      if (source.type === 'group') return group;
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
            {/* Mobile quick-add bar */}
            <div className="border-b border-zinc-200 px-3 py-2 lg:hidden">
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setIsModalOpen(true)} className="flex flex-1 items-center justify-center gap-1 border border-zinc-900 bg-zinc-900 px-2 py-1.5 text-[11px] font-medium text-white"><PlusIcon /> Task</button>
                <button type="button" onClick={() => setShowSlideLibrary(true)} className="flex items-center justify-center gap-1 border border-zinc-200 px-2 py-1.5 text-[11px] text-zinc-700"><PlusIcon /> Slide</button>
                <button type="button" onClick={() => addBlockAndTrack(createDefaultBlock('group', { blank: true }))} className="flex items-center justify-center gap-1 border border-zinc-200 px-2 py-1.5 text-[11px] text-zinc-700"><PlusIcon /> Group</button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <div className="mx-auto max-w-3xl space-y-3 p-4 pb-8">
                {/* Sticky header with navigator + add buttons */}
                <div className="sticky top-0 z-10 -mx-4 border-b border-zinc-200 bg-white/95 px-4 py-2 backdrop-blur-sm">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{blocks.length} block{blocks.length !== 1 ? 's' : ''}</span>
                      <button type="button" onClick={() => setCompactMode((v) => !v)} className={compactMode ? 'border border-zinc-900 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-medium text-white' : 'border border-zinc-200 px-1.5 py-0.5 text-[9px] text-zinc-400 hover:border-zinc-400'} title="Toggle compact mode">{compactMode ? 'Compact ✓' : 'Compact'}</button>
                    </div>
                    <div className="hidden items-center gap-1 lg:flex">
                      <button type="button" onClick={() => setShowSlideLibrary(true)} className="inline-flex items-center gap-1 border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 transition hover:border-zinc-900"><PlusIcon /> Slide</button>
                      <button type="button" onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-1 border border-zinc-900 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-white"><PlusIcon /> Task</button>
                      <button type="button" onClick={() => addBlockAndTrack(createDefaultBlock('group', { blank: true }))} className="inline-flex items-center gap-1 border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-600 transition hover:border-zinc-900"><PlusIcon /> Group</button>
                      <button type="button" onClick={() => setShowQuickAdd(true)} className="ml-0.5 border border-zinc-200 px-1.5 py-1 text-[9px] text-zinc-400 transition hover:border-zinc-400 hover:text-zinc-600" title="Quick add (Ctrl+K)">⌘K</button>
                    </div>
                  </div>
                  <div className="mt-1.5">
                    <BlockNavigator blocks={blocks} selectedId={selected?.id} onSelect={focusBlock} />
                  </div>
                </div>

                {/* Recently used quick strip */}
                {recentTypes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
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

                {/* Smart suggestions */}
                {suggestions.length > 0 && !mobileDragItem && (
                  <div className="space-y-1.5">
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
                {blocks.map((block, index) => {
                  const definition = block.type === 'task' ? getTaskDefinition(block.taskType) : null;
                  const selectedTopLevel = selected?.id === block.id;
                  const catMeta = CATEGORY_META[definition?.category] || { icon: block.type === 'group' ? '▤' : '□', accent: 'border-zinc-300 text-zinc-600' };
                  return (
                    <div
                      key={block.id}
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
                        <button
                          type="button"
                          onClick={() => onSelect(block.id)}
                          className={compactMode && !selectedTopLevel ? 'flex w-full items-center gap-2 px-3 py-2 text-left' : 'flex w-full items-start gap-3 p-3 text-left'}
                        >
                          {/* Left: Index + drag handle */}
                          <div className={compactMode && !selectedTopLevel ? 'flex shrink-0 items-center gap-1' : 'flex shrink-0 flex-col items-center gap-1 pt-0.5'}>
                            <span className={selectedTopLevel ? 'flex h-6 w-6 items-center justify-center bg-zinc-900 text-[10px] font-semibold text-white' : 'flex h-6 w-6 items-center justify-center border border-zinc-200 text-[10px] font-semibold text-zinc-500'}>{index + 1}</span>
                            {(!compactMode || selectedTopLevel) && <DragHandleIcon className="text-zinc-300" />}
                          </div>
                          {/* Center: Content */}
                          <div className="min-w-0 flex-1">
                            {(!compactMode || selectedTopLevel) && (
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex h-4 items-center gap-1 px-1.5 text-[9px] font-medium uppercase tracking-[0.1em] ${selectedTopLevel ? 'bg-zinc-900 text-white' : `border ${catMeta.accent} bg-white`}`}>
                                  {catMeta.icon} {definition?.category || block.type}
                                </span>
                                {!block.enabled && <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-400">Disabled</span>}
                              </div>
                            )}
                            <div className={compactMode && !selectedTopLevel ? 'flex items-center gap-2 text-xs' : `mt-1.5 text-sm font-semibold ${selectedTopLevel ? 'text-zinc-950' : 'text-zinc-800'}`}>
                              {compactMode && !selectedTopLevel && <span className="text-[9px] text-zinc-400">{catMeta.icon}</span>}
                              <span className={compactMode && !selectedTopLevel ? 'truncate font-medium text-zinc-700' : ''}>{getBlockLabel(block, index)}</span>
                            </div>
                            {(!compactMode || selectedTopLevel) && <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500"><Md text={block.instruction || block.content || block.text || block.question || definition?.description || ''} /></div>}
                          </div>
                          {/* Right: Quick actions */}
                          {(!compactMode || selectedTopLevel) && (
                            <div className="flex shrink-0 flex-col gap-1">
                              <IconActionButton title="Move up" onClick={(event) => { event.stopPropagation(); moveTopLevelBlock(block.id, -1); }} className="border-zinc-200 text-zinc-400 hover:text-zinc-900"><ChevronIcon direction="up" /></IconActionButton>
                              <IconActionButton title="Move down" onClick={(event) => { event.stopPropagation(); moveTopLevelBlock(block.id, 1); }} className="border-zinc-200 text-zinc-400 hover:text-zinc-900"><ChevronIcon direction="down" /></IconActionButton>
                              <IconActionButton title="Duplicate" onClick={(event) => { event.stopPropagation(); duplicateTopLevelBlock(block.id); }} className="border-zinc-200 text-zinc-400 hover:text-zinc-900"><span className="text-xs">⧉</span></IconActionButton>
                              <IconActionButton title="Delete" onClick={(event) => { event.stopPropagation(); onDeleteBlock(block.id); }} className="border-zinc-200 text-zinc-400 hover:text-red-600"><TrashIcon /></IconActionButton>
                            </div>
                          )}
                        </button>

                        {/* Mobile gesture action bar — shown when selected on touch */}
                        {selectedTopLevel && prefersCoarsePointer && (
                          <div className="flex border-t border-zinc-200 lg:hidden">
                            <button type="button" onClick={(e) => { e.stopPropagation(); moveTopLevelBlock(block.id, -1); }} className="flex flex-1 items-center justify-center gap-1 border-r border-zinc-200 py-2.5 text-[10px] text-zinc-500 active:bg-zinc-100">↑ Up</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); moveTopLevelBlock(block.id, 1); }} className="flex flex-1 items-center justify-center gap-1 border-r border-zinc-200 py-2.5 text-[10px] text-zinc-500 active:bg-zinc-100">↓ Down</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); duplicateTopLevelBlock(block.id); }} className="flex flex-1 items-center justify-center gap-1 border-r border-zinc-200 py-2.5 text-[10px] text-zinc-500 active:bg-zinc-100">⧉ Clone</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); wrapTopLevelBlockInGroup(block.id); }} className="flex flex-1 items-center justify-center gap-1 border-r border-zinc-200 py-2.5 text-[10px] text-zinc-500 active:bg-zinc-100">▤ Group</button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); onDeleteBlock(block.id); }} className="flex flex-1 items-center justify-center gap-1 py-2.5 text-[10px] text-rose-500 active:bg-rose-50">✕ Delete</button>
                          </div>
                        )}

                        {/* Expanded editor — shown when selected */}
                        {selectedTopLevel && block.type !== 'group' && (
                          <div className="border-t border-zinc-200 bg-[#fcfcfb] p-4">
                            <InlineQuickFields block={block} onChange={updateSelected} />
                            <div className="mt-4">
                              <BlockEditorForm block={block} onChange={updateSelected} />
                            </div>
                            <div className="mt-4 border-t border-zinc-200 pt-4 lg:hidden">
                              {renderBlockPreview(block)}
                            </div>
                          </div>
                        )}
                      </div>

                      {block.type === 'group' && (
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
                          onBeginMobileDrag={beginMobileDrag}
                          onEndMobileDragPress={endMobileDragPress}
                          onMobileDropGroup={moveMobileItemToGroup}
                          mobileDragItem={mobileDragItem}
                        />
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
      <MobileSlideLibrarySheet isOpen={showSlideLibrary} onClose={() => setShowSlideLibrary(false)} onAdd={(block) => addBlockAndTrack(block)} />
    </>
  );
}
