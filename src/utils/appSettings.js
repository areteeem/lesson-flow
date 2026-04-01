import { loadScopedDomainData, saveScopedDomainData } from './accountStorage';

export function loadAppSettings() {
  return loadScopedDomainData('settings', {});
}

export function saveAppSettings(settings) {
  saveScopedDomainData('settings', settings);
}

export function applyCompactMode(enabled) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.compact = enabled ? 'true' : 'false';
}

export function readCompactModeFromSettings() {
  const settings = loadAppSettings();
  return settings?.compactMode === true;
}

export const SETTINGS_KEY = 'lesson-flow-settings';
