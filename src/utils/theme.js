export const THEME_KEY = 'lf_theme';

export function getThemePreference() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Ignore storage issues and fallback to system theme.
  }
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyThemePreference(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

export function setThemePreference(theme) {
  const resolved = theme === 'dark' ? 'dark' : 'light';
  applyThemePreference(resolved);
  try {
    localStorage.setItem(THEME_KEY, resolved);
  } catch {
    // Ignore storage write failures.
  }
  return resolved;
}
