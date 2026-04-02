// Shared color palettes — muted earth tones ("Quiet Luxe")

export const SPEAKER_COLORS = [
  { bg: 'bg-blue-50',    text: 'text-blue-900',    border: 'border-blue-200',    avatar: 'bg-blue-600' },
  { bg: 'bg-zinc-100',   text: 'text-zinc-900',    border: 'border-zinc-200',    avatar: 'bg-zinc-600' },
  { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', avatar: 'bg-emerald-600' },
  { bg: 'bg-violet-50',  text: 'text-violet-800',  border: 'border-violet-200',  avatar: 'bg-violet-600' },
  { bg: 'bg-amber-50',   text: 'text-amber-800',   border: 'border-amber-200',   avatar: 'bg-amber-600' },
  { bg: 'bg-rose-50',    text: 'text-rose-800',     border: 'border-rose-200',    avatar: 'bg-rose-500' },
  { bg: 'bg-cyan-50',    text: 'text-cyan-800',    border: 'border-cyan-200',    avatar: 'bg-cyan-600' },
  { bg: 'bg-orange-50',  text: 'text-orange-800',  border: 'border-orange-200',  avatar: 'bg-orange-600' },
];

export const PALETTE_COLORS = [
  { bg: 'bg-red-50', border: 'border-red-200', activeBg: 'bg-red-500', activeText: 'text-white', hoverBorder: 'hover:border-red-300' },
  { bg: 'bg-blue-50', border: 'border-blue-200', activeBg: 'bg-blue-500', activeText: 'text-white', hoverBorder: 'hover:border-blue-300' },
  { bg: 'bg-amber-50', border: 'border-amber-200', activeBg: 'bg-amber-500', activeText: 'text-white', hoverBorder: 'hover:border-amber-300' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', activeBg: 'bg-emerald-500', activeText: 'text-white', hoverBorder: 'hover:border-emerald-300' },
  { bg: 'bg-purple-50', border: 'border-purple-200', activeBg: 'bg-purple-500', activeText: 'text-white', hoverBorder: 'hover:border-purple-300' },
  { bg: 'bg-pink-50', border: 'border-pink-200', activeBg: 'bg-pink-500', activeText: 'text-white', hoverBorder: 'hover:border-pink-300' },
];

export const CATEGORY_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-500' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-500' },
  { bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-500' },
  { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-500' },
  { bg: 'bg-rose-50', border: 'border-rose-200', badge: 'bg-rose-500' },
  { bg: 'bg-cyan-50', border: 'border-cyan-200', badge: 'bg-cyan-500' },
];

export const DIALOGUE_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', avatar: 'bg-blue-500', text: 'text-blue-700' },
  { bg: 'bg-zinc-50', border: 'border-zinc-200', avatar: 'bg-zinc-500', text: 'text-zinc-700' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', avatar: 'bg-emerald-500', text: 'text-emerald-700' },
  { bg: 'bg-purple-50', border: 'border-purple-200', avatar: 'bg-purple-500', text: 'text-purple-700' },
  { bg: 'bg-amber-50', border: 'border-amber-200', avatar: 'bg-amber-500', text: 'text-amber-700' },
  { bg: 'bg-rose-50', border: 'border-rose-200', avatar: 'bg-rose-500', text: 'text-rose-700' },
];

// Scoring thresholds — prefer block-level overrides when available
export const FUZZY_MATCH_THRESHOLD = 0.85;
export const STRICT_MATCH_THRESHOLD = 0.95;
export const PASS_SCORE = 0.8;
