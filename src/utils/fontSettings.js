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

export { FONT_OPTIONS, SIZE_OPTIONS, LINE_HEIGHT_OPTIONS };

export function loadFontSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(FONT_STORAGE_KEY));
    return stored ? { ...DEFAULTS, ...stored } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveFontSettings(settings) {
  try {
    localStorage.setItem(FONT_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage write failures and keep the in-memory state.
  }
}

export function getFontCSSVars(settings) {
  const font = FONT_OPTIONS.find((entry) => entry.id === settings.fontId) || FONT_OPTIONS[0];
  const size = SIZE_OPTIONS.find((entry) => entry.id === settings.sizeId) || SIZE_OPTIONS[1];
  const lineHeight = LINE_HEIGHT_OPTIONS.find((entry) => entry.id === settings.lineHeightId) || LINE_HEIGHT_OPTIONS[1];
  return {
    '--player-font-family': font.family,
    '--player-font-scale': size.scale,
    '--player-line-height': lineHeight.value,
  };
}