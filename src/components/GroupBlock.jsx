import { useState } from 'react';
import TaskRenderer from './TaskRenderer';
import SplitView from './SplitView';
import { getTaskDefinition } from '../config/taskRegistry';

function renderChild(child, results, onCompleteChild) {
  if (!child) return null;
  if (child.type === 'group' || child.type === 'split_group')
    return <GroupBlock block={child} results={results} onCompleteChild={onCompleteChild} />;
  return <TaskRenderer block={child} onComplete={(result) => onCompleteChild?.(child.id, result)} existingResult={results?.[child.id]} />;
}

export default function GroupBlock({ block, results, onCompleteChild }) {
  const children = block.children || [];
  const [activeIndex, setActiveIndex] = useState(0);
  const activeChild = children[activeIndex] || null;
  const isSplit = block.layout === 'split' || block.type === 'split_group';

  const [rightIndex, setRightIndex] = useState(1);

  if (isSplit && children.length >= 2) {
    const extraChildren = children.slice(2);
    return (
      <div className="space-y-4">
        <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Split View</div>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-950">{block.title || 'Side by Side'}</h2>
              {block.instruction && <p className="mt-2 text-sm text-zinc-500">{block.instruction}</p>}
            </div>
            <div className="border border-zinc-200 px-3 py-1 text-xs text-zinc-500">{children.length} tasks</div>
          </div>
          {extraChildren.length > 0 && (
            <div className="mt-3 flex gap-1">
              {children.slice(1).map((child, i) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => setRightIndex(i + 1)}
                  className={rightIndex === i + 1
                    ? 'border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs text-white'
                    : 'border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 hover:border-zinc-400'}
                >
                  {child.question || child.title || `Task ${i + 2}`}
                  {results?.[child.id] ? ' ✓' : ''}
                </button>
              ))}
            </div>
          )}
        </div>
        <SplitView
          left={<div className="p-2">{renderChild(children[0], results, onCompleteChild)}</div>}
          right={<div className="p-2">{renderChild(children[rightIndex], results, onCompleteChild)}</div>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Multi-task Screen</div>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-950">{block.title || 'Practice Set'}</h2>
            {block.instruction && <p className="mt-2 text-sm text-zinc-500">{block.instruction}</p>}
          </div>
          <div className="border border-zinc-200 px-3 py-1 text-xs text-zinc-500">{children.length} tasks</div>
        </div>
      </div>
      {children.length > 0 && (
        <div className="space-y-4">
          {/* Horizontal numbered tabs for small groups on mobile, grid on desktop */}
          {children.length < 5 ? (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-3 md:overflow-visible md:pb-0">
              {children.map((child, index) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={activeIndex === index
                    ? 'flex shrink-0 items-center gap-2 border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-left text-white md:min-h-24 md:flex-col md:items-start md:gap-0 md:p-4'
                    : 'flex shrink-0 items-center gap-2 border border-zinc-200 bg-white px-4 py-2.5 text-left text-zinc-700 md:min-h-24 md:flex-col md:items-start md:gap-0 md:p-4'}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-current text-xs font-semibold md:mb-2">{index + 1}</span>
                  <span className="truncate text-sm font-medium">{child.question || child.title || `Task ${index + 1}`}</span>
                  <span className="ml-auto text-[10px] opacity-60 md:ml-0 md:mt-2">{results?.[child.id] ? '✓' : '○'}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {children.map((child, index) => (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={activeIndex === index ? 'min-h-24 border border-zinc-900 bg-zinc-900 p-4 text-left text-white' : 'min-h-24 border border-zinc-200 bg-white p-4 text-left text-zinc-700'}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">{child.type === 'task' ? getTaskDefinition(child.taskType).category : child.type}</div>
                      <div className="mt-2 text-sm font-medium">{child.question || child.title || `Task ${index + 1}`}</div>
                    </div>
                    <span className="border border-current px-2 py-0.5 text-[10px] uppercase">{index + 1}</span>
                  </div>
                  <div className="mt-3 text-xs opacity-75">{results?.[child.id] ? (results[child.id].correct === true ? 'Completed correctly' : results[child.id].correct === false ? 'Needs review' : 'Saved') : 'Not started'}</div>
                </button>
              ))}
            </div>
          )}
          {activeChild && (
            <div className="relative">
              <div className="mb-2 flex items-center justify-between px-1 text-xs uppercase tracking-[0.2em] text-zinc-400">
                <span>Task {activeIndex + 1}</span>
                {results?.[activeChild.id] && <span>{results[activeChild.id].correct === true ? 'Correct' : results[activeChild.id].correct === false ? 'Review' : 'Saved'}</span>}
              </div>
              {renderChild(activeChild, results, onCompleteChild)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
