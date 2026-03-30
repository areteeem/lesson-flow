import { useRef } from 'react';

export default function PromptModal({ open, title, placeholder, defaultValue = '', onConfirm, onCancel }) {
  const inputRef = useRef(null);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const value = String(formData.get('value') || '').trim();
    if (value) onConfirm(value);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onCancel}>
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="mx-4 w-full max-w-sm border border-zinc-200 bg-white p-6 shadow-[0_20px_60px_rgba(0,0,0,0.15)]"
      >
        <div className="mb-4 text-sm font-semibold text-zinc-900">{title}</div>
        <input
          ref={inputRef}
          name="value"
          key={defaultValue}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="mb-4 w-full border border-zinc-200 px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900"
          onKeyDown={(e) => e.key === 'Escape' && onCancel()}
          required
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="border border-zinc-200 px-4 py-2 text-xs text-zinc-600 hover:border-zinc-400">Cancel</button>
          <button type="submit" className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800">Confirm</button>
        </div>
      </form>
    </div>
  );
}
