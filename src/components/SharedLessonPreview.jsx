import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchSharedLessonById } from '../utils/lessonSharing';

function flattenBlocks(blocks = []) {
  return blocks.flatMap((block) => [block, ...flattenBlocks(Array.isArray(block.children) ? block.children : [])]);
}

function summarizeLesson(lesson) {
  const flatBlocks = flattenBlocks(Array.isArray(lesson?.blocks) ? lesson.blocks : []);
  const taskCount = flatBlocks.filter((block) => block?.type === 'task').length;
  const contentCount = flatBlocks.length - taskCount;
  return {
    totalBlocks: flatBlocks.length,
    taskCount,
    contentCount,
  };
}

function blockLabel(block, index) {
  if (!block) return `Block ${index + 1}`;
  return block.title || block.question || block.instruction || `Block ${index + 1}`;
}

export default function SharedLessonPreview({ onMakeCopy, onBack }) {
  const { shareId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lesson, setLesson] = useState(null);
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');
      const result = await fetchSharedLessonById(shareId);
      if (!active) return;

      if (!result.ok) {
        setLesson(null);
        setMeta(null);
        setError(result.reason || 'Failed to load shared lesson');
        setLoading(false);
        return;
      }

      setLesson(result.lesson || null);
      setMeta(result.meta || null);
      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [shareId]);

  const stats = useMemo(() => summarizeLesson(lesson), [lesson]);
  const flatBlocks = useMemo(() => flattenBlocks(Array.isArray(lesson?.blocks) ? lesson.blocks : []), [lesson]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-6">
        <div className="w-full max-w-2xl border border-zinc-200 bg-white p-8">
          <div className="h-6 w-56 animate-pulse bg-zinc-200" />
          <div className="mt-3 h-4 w-80 animate-pulse bg-zinc-100" />
          <div className="mt-6 grid grid-cols-3 gap-2">
            <div className="h-16 animate-pulse bg-zinc-100" />
            <div className="h-16 animate-pulse bg-zinc-100" />
            <div className="h-16 animate-pulse bg-zinc-100" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !lesson) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-6">
        <div className="w-full max-w-lg border border-zinc-200 bg-white p-8 text-center">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Shared lesson unavailable</div>
          <div className="mt-3 text-lg font-semibold text-zinc-950">This link is invalid or expired</div>
          <div className="mt-2 text-sm text-zinc-500">{error || 'Unable to load this shared lesson right now.'}</div>
          <button type="button" onClick={onBack} className="mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white">Back to lessons</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="border border-zinc-200 bg-white p-5 sm:p-6">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Shared lesson preview</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-950">{meta?.title || lesson.title || 'Untitled lesson'}</div>
          <div className="mt-2 text-sm text-zinc-500">Read-only preview. Make a copy to edit, assign, or run this lesson in your workspace.</div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Blocks</div>
              <div className="mt-1 text-lg font-semibold text-zinc-950">{stats.totalBlocks}</div>
            </div>
            <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Tasks</div>
              <div className="mt-1 text-lg font-semibold text-zinc-950">{stats.taskCount}</div>
            </div>
            <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Slides</div>
              <div className="mt-1 text-lg font-semibold text-zinc-950">{stats.contentCount}</div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const copied = {
                  ...lesson,
                  id: crypto.randomUUID(),
                  title: `${lesson.title || meta?.title || 'Untitled lesson'} (Copy)`,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                };
                onMakeCopy(copied);
              }}
              className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
            >
              Make a copy
            </button>
            <button type="button" onClick={onBack} className="border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-900">Back</button>
          </div>
        </header>

        <section className="border border-zinc-200 bg-white p-5 sm:p-6">
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Lesson outline</div>
          {flatBlocks.length === 0 ? (
            <div className="mt-3 text-sm text-zinc-500">No blocks found in this shared lesson.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {flatBlocks.map((block, index) => (
                <div key={block.id || `${block.type || 'block'}-${index}`} className="border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{block.taskType || block.type || 'block'}</div>
                  <div className="mt-1 text-sm font-medium text-zinc-900">{blockLabel(block, index)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
