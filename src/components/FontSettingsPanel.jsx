import { useState } from 'react';
import { CloseIcon } from './Icons';
import { FONT_OPTIONS, LINE_HEIGHT_OPTIONS, SIZE_OPTIONS, saveFontSettings } from '../utils/fontSettings';

export default function FontSettingsPanel({ settings, onChange, onClose }) {
  const [local, setLocal] = useState(settings);

  const update = (patch) => {
    const next = { ...local, ...patch };
    setLocal(next);
    saveFontSettings(next);
    onChange(next);
  };

  return (
    <div className="absolute right-0 top-full z-40 mt-1 w-72 border border-zinc-200 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.1)]">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-600">Font Settings</span>
        <button type="button" onClick={onClose} className="p-0.5 text-zinc-400 hover:text-zinc-900">
          <CloseIcon width={14} height={14} />
        </button>
      </div>

      {/* Font Family */}
      <div className="border-b border-zinc-50 px-4 py-3">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">Font Family</div>
        <div className="space-y-1">
          {FONT_OPTIONS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => update({ fontId: f.id })}
              className={[
                'w-full px-3 py-1.5 text-left text-sm transition',
                local.fontId === f.id ? 'border border-zinc-900 bg-zinc-900 text-white' : 'border border-zinc-100 text-zinc-700 hover:border-zinc-300',
              ].join(' ')}
              style={{ fontFamily: f.family }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Font Size */}
      <div className="border-b border-zinc-50 px-4 py-3">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">Text Size</div>
        <div className="flex gap-1">
          {SIZE_OPTIONS.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => update({ sizeId: s.id })}
              className={[
                'flex-1 py-1.5 text-center text-xs font-medium transition',
                local.sizeId === s.id ? 'border border-zinc-900 bg-zinc-900 text-white' : 'border border-zinc-200 text-zinc-600 hover:border-zinc-400',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Line Height */}
      <div className="px-4 py-3">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">Line Spacing</div>
        <div className="flex gap-1">
          {LINE_HEIGHT_OPTIONS.map(l => (
            <button
              key={l.id}
              type="button"
              onClick={() => update({ lineHeightId: l.id })}
              className={[
                'flex-1 py-1.5 text-center text-xs font-medium transition',
                local.lineHeightId === l.id ? 'border border-zinc-900 bg-zinc-900 text-white' : 'border border-zinc-200 text-zinc-600 hover:border-zinc-400',
              ].join(' ')}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
