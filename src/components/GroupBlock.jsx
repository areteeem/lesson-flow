import { useState } from 'react';
import ErrorBoundary from './ErrorBoundary';
import EmbedSlide from './EmbedSlide';
import GenericSlide from './GenericSlide';
import RichSlide from './RichSlide';
import Slide from './Slide';
import StructureSlide from './StructureSlide';
import TableSlide from './TableSlide';
import TaskRenderer from './TaskRenderer';
import SplitView from './SplitView';
import { getTaskDefinition } from '../config/taskRegistry';

const SLIDE_TYPES = new Set(['slide', 'rich', 'structure', 'table', 'embed']);

function renderSlideChild(child) {
  if (child.type === 'slide') return <Slide block={child} />;
  if (child.type === 'rich') return <RichSlide block={child} />;
  if (child.type === 'structure') return <StructureSlide block={child} />;
  if (child.type === 'table') return <TableSlide block={child} />;
  if (child.type === 'embed') return <EmbedSlide block={child} />;
  return <GenericSlide block={child} />;
}

function renderChild(child, results, onCompleteChild, onProgressChild, taskOptions) {
  if (!child) return null;
  if (child.type === 'group' || child.type === 'split_group')
    return (
      <ErrorBoundary message={`Failed to render nested group: ${child.title || child.ref || 'unknown'}`}>
        <GroupBlock block={child} results={results} onCompleteChild={onCompleteChild} onProgressChild={onProgressChild} taskOptions={taskOptions} />
      </ErrorBoundary>
    );
  if (SLIDE_TYPES.has(child.type))
    return (
      <ErrorBoundary message={`Failed to render slide inside group: ${child.type}`}>
        {renderSlideChild(child)}
      </ErrorBoundary>
    );
  return (
    <ErrorBoundary message={`Failed to render task: ${child.taskType || child.type}`}>
      <TaskRenderer
        block={child}
        onComplete={(result) => onCompleteChild?.(child.id, result)}
        onProgress={(result) => onProgressChild?.(child.id, result)}
        existingResult={results?.[child.id]}
        allowRetry={taskOptions?.allowRetry !== false}
        showCheckButton={taskOptions?.showCheckButton !== false}
        lockAfterSubmit={taskOptions?.lockAfterSubmit === true}
        forceLocked={taskOptions?.forceLocked === true}
        lockMessage={taskOptions?.lockMessage || 'Responses are closed for this task.'}
      />
    </ErrorBoundary>
  );
}

export default function GroupBlock({ block, results, onCompleteChild, onProgressChild, taskOptions }) {
  const children = block.children || [];
  const [activeIndex, setActiveIndex] = useState(0);
  const activeChild = children[activeIndex] || null;
  const isSplit = block.layout === 'split' || block.type === 'split_group';

  const [rightIndex, setRightIndex] = useState(1);

  if (children.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200/80 bg-gradient-to-b from-white to-zinc-50/50 p-5 shadow-sm md:p-6 xl:p-8">
        <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-400">{isSplit ? 'Split View' : 'Multi-task Screen'}</div>
        <h2 className="mt-2 text-2xl font-semibold text-zinc-950">{block.title || 'Practice Set'}</h2>
        <div className="mt-4 text-sm text-zinc-400">No tasks in this group yet. Add tasks in the builder.</div>
      </div>
    );
  }

  if (isSplit && children.length >= 2) {
    const safeRightIndex = Math.min(rightIndex, children.length - 1);
    const extraChildren = children.slice(2);
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-zinc-200/80 bg-gradient-to-b from-white to-zinc-50/50 p-5 shadow-sm md:p-6 xl:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-400">Split View</div>
              <h2 className="mt-2 text-xl font-semibold text-zinc-950">{block.title || 'Side by Side'}</h2>
              {block.instruction && <p className="mt-2 text-sm leading-relaxed text-zinc-500">{block.instruction}</p>}
            </div>
            <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[10px] font-medium text-zinc-500">{children.length} tasks</div>
          </div>
          {extraChildren.length > 0 && (
            <div className="mt-4 flex gap-1.5">
              {children.slice(1).map((child, i) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => setRightIndex(i + 1)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${rightIndex === i + 1
                    ? 'bg-zinc-900 text-white shadow-sm'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
                >
                  {child.question || child.title || `Task ${i + 2}`}
                  {results?.[child.id] ? ' ✓' : ''}
                </button>
              ))}
            </div>
          )}
        </div>
        <SplitView
          left={<div className="p-2">{renderChild(children[0], results, onCompleteChild, onProgressChild, taskOptions)}</div>}
          right={<div className="p-2">{renderChild(children[safeRightIndex], results, onCompleteChild, onProgressChild, taskOptions)}</div>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-zinc-200/80 bg-gradient-to-b from-white to-zinc-50/50 p-5 shadow-sm md:p-6 xl:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.22em] text-zinc-400">Multi-task Screen</div>
            <h2 className="mt-2 text-xl font-semibold text-zinc-950">{block.title || 'Practice Set'}</h2>
            {block.instruction && <p className="mt-2 text-sm leading-relaxed text-zinc-500">{block.instruction}</p>}
          </div>
          <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[10px] font-medium text-zinc-500">{children.length} tasks</div>
        </div>
      </div>
      {children.length > 0 && (
        <div className="space-y-3">
          {children.length < 5 ? (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-2 md:overflow-visible md:pb-0">
              {children.map((child, index) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`rounded-xl px-4 py-3 text-left transition-all ${activeIndex === index
                    ? 'bg-zinc-900 text-white shadow-md md:min-h-20 md:p-4'
                    : 'border border-zinc-200/80 bg-white text-zinc-700 shadow-sm hover:shadow-md hover:border-zinc-300 md:min-h-20 md:p-4'}`}
                >
                  <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-0">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold md:mb-2 ${activeIndex === index ? 'bg-white/20' : 'bg-zinc-100'}`}>{index + 1}</span>
                    <span className="truncate text-sm font-medium">{child.question || child.title || `Task ${index + 1}`}</span>
                    <span className="ml-auto text-[10px] opacity-60 md:ml-0 md:mt-1">{results?.[child.id] ? '✓ done' : '○ pending'}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {children.map((child, index) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`min-h-20 rounded-xl p-4 text-left transition-all ${activeIndex === index
                    ? 'bg-zinc-900 text-white shadow-md'
                    : 'border border-zinc-200/80 bg-white text-zinc-700 shadow-sm hover:shadow-md hover:border-zinc-300'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] opacity-60">{child.type === 'task' ? getTaskDefinition(child.taskType).category : child.type}</div>
                      <div className="mt-1.5 text-sm font-medium">{child.question || child.title || `Task ${index + 1}`}</div>
                    </div>
                    <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-semibold ${activeIndex === index ? 'bg-white/20' : 'bg-zinc-100'}`}>{index + 1}</span>
                  </div>
                  <div className="mt-2 text-xs opacity-60">{results?.[child.id] ? (results[child.id].correct === true ? '✓ Completed correctly' : results[child.id].correct === false ? '✗ Needs review' : '● Saved') : '○ Not started'}</div>
                </button>
              ))}
            </div>
          )}
          {activeChild && (
            <div className="relative">
              <div className="mb-2 flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                <span>Task {activeIndex + 1} of {children.length}</span>
                {results?.[activeChild.id] && <span className={results[activeChild.id].correct === true ? 'text-emerald-600' : results[activeChild.id].correct === false ? 'text-amber-600' : 'text-zinc-500'}>{results[activeChild.id].correct === true ? '✓ Correct' : results[activeChild.id].correct === false ? '✗ Review' : '● Saved'}</span>}
              </div>
              {renderChild(activeChild, results, onCompleteChild, onProgressChild, taskOptions)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
