const DEBUG_MODE_KEY = 'lf_debug_mode';
const DEBUG_LOG_KEY = 'lf_debug_log';
const MAX_LOG_ENTRIES = 200;

function safeRead() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(DEBUG_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(entries) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(entries.slice(-MAX_LOG_ENTRIES)));
  } catch {
    // Ignore quota/storage errors.
  }
}

export function isDebugMode() {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') return true;
    return localStorage.getItem(DEBUG_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setDebugMode(enabled) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEBUG_MODE_KEY, enabled ? '1' : '0');
  } catch {
    // Ignore storage errors.
  }
}

export function readDebugLog() {
  return safeRead();
}

export function clearDebugLog() {
  safeWrite([]);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lf-debug-log', { detail: [] }));
  }
}

export function recordDebugEvent(type, payload = {}, level = 'info') {
  const entry = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    type,
    level,
    payload,
  };

  const next = [...safeRead(), entry];
  safeWrite(next);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lf-debug-log', { detail: next.slice(-MAX_LOG_ENTRIES) }));
  }

  if (isDebugMode() && typeof console !== 'undefined') {
    const writer = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    writer('[lesson-flow]', type, payload);
  }

  return entry;
}