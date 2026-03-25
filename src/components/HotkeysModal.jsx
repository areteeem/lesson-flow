const HOTKEYS = [
  ['Ctrl/Cmd + Z', 'Undo the last change'],
  ['Ctrl/Cmd + Shift + Z', 'Redo the last undone change'],
  ['Ctrl/Cmd + Y', 'Redo on Windows'],
  ['Ctrl + /', 'Open or close this hotkeys panel'],
  ['Esc', 'Close active modal'],
];

export default function HotkeysModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 p-4">
      <div className="mx-auto max-w-2xl border border-zinc-900 bg-white p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Hotkeys</div>
            <div className="mt-1 text-xl font-semibold text-zinc-950">Builder shortcuts</div>
          </div>
          <button type="button" onClick={onClose} className="border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700">Close</button>
        </div>
        <div className="mt-6 space-y-3">
          {HOTKEYS.map(([key, description]) => (
            <div key={key} className="flex items-center justify-between gap-4 border border-zinc-200 px-4 py-3">
              <span className="text-sm font-medium text-zinc-900">{key}</span>
              <span className="text-sm text-zinc-600">{description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
