import { useState } from 'react';
import TaskRenderer from './TaskRenderer';
import { getTaskDefinition } from '../config/taskRegistry';

export default function GroupBlock({ block, results, onCompleteChild }) {
  const children = block.children || [];
  const [activeIndex, setActiveIndex] = useState(0);
  const activeChild = children[activeIndex] || null;

  return (
    <div className="space-y-4">
      <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Multi-task Screen</div>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-950">{block.title || 'Practice Set'}</h2>
            {block.instruction && <p className="mt-2 text-sm text-zinc-500">{block.instruction}</p>}
          </div>
          <div className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-500">{children.length} tasks</div>
        </div>
      </div>
      {children.length > 0 && (
        <div className="space-y-4">
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
          {activeChild && (
            <div className="relative">
              <div className="mb-2 flex items-center justify-between px-1 text-xs uppercase tracking-[0.2em] text-zinc-400">
                <span>Task {activeIndex + 1}</span>
                {results?.[activeChild.id] && <span>{results[activeChild.id].correct === true ? 'Correct' : results[activeChild.id].correct === false ? 'Review' : 'Saved'}</span>}
              </div>
              {activeChild.type === 'group'
                ? <GroupBlock block={activeChild} results={results} onCompleteChild={onCompleteChild} />
                : <TaskRenderer block={activeChild} onComplete={(result) => onCompleteChild?.(activeChild.id, result)} existingResult={results?.[activeChild.id]} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
