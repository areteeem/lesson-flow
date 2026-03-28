import { useState, useEffect } from 'react';
import { CloseIcon } from './Icons';

const FONT_STORAGE_KEY = 'lesson-flow-player-font';

const FONT_OPTIONS = [
  { id: 'system', label: 'System', family: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { id: 'serif', label: 'Serif', family: 'Georgia, "Times New Roman", Times, serif' },
  { id: 'mono', label: 'Mono', family: 'ui-monospace, "Cascadia Code", "Fira Code", Consolas, monospace' },
  { id: 'rounded', label: 'Rounded', family: '"Nunito", "Varela Round", ui-sans-serif, system-ui, sans-serif' },
  { id: 'dyslexic', label: 'Dyslexia-friendly', family: '"OpenDyslexic", "Comic Sans MS", cursive, sans-serif' },
  { id: 'handwriting', label: 'Handwriting', family: '"Caveat", "Patrick Hand", cursive' },
];

const SIZE_OPTIONS = [
  { id: 'sm', label: 'S', scale: 0.9 },
  { id: 'md', label: 'M', scale: 1 },
  { id: 'lg', label: 'L', scale: 1.15 },
  { id: 'xl', label: 'XL', scale: 1.3 },
];

const LINE_HEIGHT_OPTIONS = [
  { id: 'compact', label: 'Compact', value: 1.4 },
  { id: 'normal', label: 'Normal', value: 1.6 },
  { id: 'relaxed', label: 'Relaxed', value: 1.9 },
];

const DEFAULTS = { fontId: 'system', sizeId: 'md', lineHeightId: 'normal' };

export function loadFontSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(FONT_STORAGE_KEY));
    return stored ? { ...DEFAULTS, ...stored } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function saveFontSettings(settings) {
  try {
    localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage write failures and keep the in-memory state.
  }
}

export function getFontCSSVars(settings) {
  const font = FONT_OPTIONS.find(f => f.id === settings.fontId) || FONT_OPTIONS[0];
  const size = SIZE_OPTIONS.find(s => s.id === settings.sizeId) || SIZE_OPTIONS[1];
  const lh = LINE_HEIGHT_OPTIONS.find(l => l.id === settings.lineHeightId) || LINE_HEIGHT_OPTIONS[1];
  return {
    '--player-font-family': font.family,
    '--player-font-scale': size.scale,
    '--player-line-height': lh.value,
  };
}

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
