import { loadScopedDomainData, saveScopedDomainData } from './accountStorage';

export function loadAppSettings() {
  return loadScopedDomainData('settings', {});
}

export function saveAppSettings(settings) {
  saveScopedDomainData('settings', settings);
}

export const SETTINGS_KEY = 'lesson-flow-settings';
