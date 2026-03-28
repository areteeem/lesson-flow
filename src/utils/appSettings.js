const SETTINGS_KEY = 'lesson-flow-settings';

export function loadAppSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveAppSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage write failures and keep current settings in memory.
  }
}

export { SETTINGS_KEY };
