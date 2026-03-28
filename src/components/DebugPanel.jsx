import { useEffect, useState } from 'react';
import { clearDebugLog, isDebugMode, readDebugLog } from '../utils/debug';

function formatTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString();
  } catch {
    return 'unknown';
  }
}

export default function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState(() => readDebugLog());

  useEffect(() => {
    if (!isDebugMode()) return undefined;
    const handle = (event) => setEntries(event.detail || readDebugLog());
    window.addEventListener('lf-debug-log', handle);
    return () => window.removeEventListener('lf-debug-log', handle);
  }, []);

  if (!isDebugMode()) return null;

  return (
    <div className="fixed bottom-6 left-6 z-50 max-w-[min(28rem,calc(100vw-3rem))]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs font-medium uppercase tracking-[0.14em] text-white shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
      >
        Debug {open ? 'Hide' : 'Show'}
      </button>
      {open && (
        <div className="mt-2 max-h-[70vh] overflow-auto border border-zinc-300 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Debug Mode</div>
              <div className="mt-1 text-sm font-semibold text-zinc-900">Recent events and errors</div>
            </div>
            <button
              type="button"
              onClick={() => { clearDebugLog(); setEntries([]); }}
              className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-zinc-900 hover:text-zinc-900"
            >
              Clear
            </button>
          </div>
          <div className="space-y-3 p-4">
            {entries.length === 0 && (
              <div className="border border-dashed border-zinc-200 px-3 py-4 text-sm text-zinc-400">No debug events yet.</div>
            )}
            {entries.slice().reverse().map((entry) => (
              <div key={entry.id} className="border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">{entry.type}</div>
                  <div className="text-[11px] text-zinc-400">{formatTime(entry.timestamp)}</div>
                </div>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words text-xs text-zinc-700">{JSON.stringify(entry.payload, null, 2)}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}