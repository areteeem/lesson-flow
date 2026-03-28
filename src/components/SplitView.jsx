import { useEffect, useRef, useState } from 'react';

export default function SplitView({ left, right, layout = 'side-by-side', leftLabel = 'Content', rightLabel = 'Task' }) {
  const [leftWidth, setLeftWidth] = useState(50);
  const [collapsed, setCollapsed] = useState(null); // null | 'left' | 'right'
  const [mobilePanel, setMobilePanel] = useState('left'); // 'left' | 'right'
  const dragging = useRef(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragging.current || !containerRef.current) return;
      const bounds = containerRef.current.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const pct = ((clientX - bounds.left) / bounds.width) * 100;
      setLeftWidth(Math.max(20, Math.min(80, pct)));
    };
    const handleUp = () => { dragging.current = false; };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => { window.removeEventListener('pointermove', handleMove); window.removeEventListener('pointerup', handleUp); };
  }, []);

  if (layout === 'stacked') {
    return (
      <div className="space-y-4">
        <div>{left}</div>
        <div>{right}</div>
      </div>
    );
  }

  return (
    <>
      {/* Mobile panel toggle — below 960px */}
      <div className="flex gap-0 min-[960px]:hidden">
        <button
          type="button"
          onClick={() => setMobilePanel('left')}
          className={mobilePanel === 'left'
            ? 'flex-1 border border-zinc-900 bg-zinc-900 py-2.5 text-xs font-medium text-white'
            : 'flex-1 border border-zinc-200 bg-white py-2.5 text-xs font-medium text-zinc-500'}
        >
          {leftLabel}
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel('right')}
          className={mobilePanel === 'right'
            ? 'flex-1 border border-zinc-900 bg-zinc-900 py-2.5 text-xs font-medium text-white'
            : 'flex-1 border border-zinc-200 bg-white py-2.5 text-xs font-medium text-zinc-500'}
        >
          {rightLabel}
        </button>
      </div>

      {/* Mobile panel content */}
      <div className="min-[960px]:hidden">
        {mobilePanel === 'left' ? left : right}
      </div>

      {/* Desktop side-by-side */}
      <div ref={containerRef} className="relative hidden min-[960px]:grid min-[960px]:grid-cols-[var(--left)_8px_var(--right)]" style={{
        '--left': collapsed === 'left' ? '0fr' : collapsed === 'right' ? '1fr' : `${leftWidth}%`,
        '--right': collapsed === 'right' ? '0fr' : collapsed === 'left' ? '1fr' : `${100 - leftWidth}%`,
      }}>
        {/* Left panel */}
        <div className={`min-w-0 overflow-hidden transition-all ${collapsed === 'left' ? 'max-h-0 min-[960px]:max-h-none' : ''}`}>
          {left}
        </div>

        {/* Drag handle + collapse buttons */}
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed((c) => c === 'left' ? null : 'left')}
            className="flex h-8 w-8 items-center justify-center border border-zinc-200 bg-white text-xs text-zinc-400 hover:border-zinc-400 hover:text-zinc-700"
            title={collapsed === 'left' ? 'Expand left' : 'Collapse left'}
          >
            {collapsed === 'left' ? '▸' : '◂'}
          </button>
          <div
            onPointerDown={() => { dragging.current = true; }}
            className="w-2 flex-1 cursor-col-resize bg-zinc-100 transition hover:bg-zinc-300"
          />
          <button
            type="button"
            onClick={() => setCollapsed((c) => c === 'right' ? null : 'right')}
            className="flex h-8 w-8 items-center justify-center border border-zinc-200 bg-white text-xs text-zinc-400 hover:border-zinc-400 hover:text-zinc-700"
            title={collapsed === 'right' ? 'Expand right' : 'Collapse right'}
          >
            {collapsed === 'right' ? '◂' : '▸'}
          </button>
        </div>

        {/* Right panel */}
        <div className={`min-w-0 overflow-hidden transition-all ${collapsed === 'right' ? 'max-h-0 min-[960px]:max-h-none' : ''}`}>
          {right}
        </div>
      </div>
    </>
  );
}
