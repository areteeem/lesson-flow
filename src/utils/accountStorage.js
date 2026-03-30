import { getSessionUser } from './accountAuth';

const DOMAIN_KEYS = {
  lessons: 'lesson-flow-lessons',
  sessions: 'lesson-flow-sessions',
  folders: 'lesson-flow-folders',
  students: 'lesson-flow-students',
  settings: 'lesson-flow-settings',
};

function safeReadJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeWriteJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures in private mode or quota pressure.
  }
}

function normalizeScopeId(scopeId) {
  return String(scopeId || 'local').replace(/[^a-zA-Z0-9:_-]/g, '_');
}

function normalizeEnvelope(rawValue, fallbackValue) {
  if (rawValue && typeof rawValue === 'object' && Object.prototype.hasOwnProperty.call(rawValue, 'data')) {
    return {
      data: rawValue.data ?? fallbackValue,
      updatedAt: Number(rawValue.updatedAt || 0),
    };
  }

  if (rawValue === null || typeof rawValue === 'undefined') {
    return {
      data: fallbackValue,
      updatedAt: 0,
    };
  }

  return {
    data: rawValue,
    updatedAt: 0,
  };
}

function hasMeaningfulData(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return Boolean(value);
}

export function getActiveAccountScopeId() {
  const user = getSessionUser();
  if (user?.id) {
    return `acct:${normalizeScopeId(user.id)}`;
  }
  return 'local';
}

export function getDomainBaseKey(domain) {
  return DOMAIN_KEYS[domain] || null;
}

export function getScopedDomainKey(domain, scopeId = getActiveAccountScopeId()) {
  const base = getDomainBaseKey(domain);
  if (!base) throw new Error(`Unknown account storage domain: ${domain}`);
  return `${base}::${normalizeScopeId(scopeId)}`;
}

export function readScopedDomainEnvelope(domain, fallbackValue, scopeId = getActiveAccountScopeId()) {
  const base = getDomainBaseKey(domain);
  if (!base) return { data: fallbackValue, updatedAt: 0 };

  const scopedKey = getScopedDomainKey(domain, scopeId);
  const scoped = safeReadJson(scopedKey);
  if (scoped !== null) {
    return normalizeEnvelope(scoped, fallbackValue);
  }

  if (scopeId === 'local') {
    const legacy = safeReadJson(base);
    return normalizeEnvelope(legacy, fallbackValue);
  }

  return { data: fallbackValue, updatedAt: 0 };
}

export function writeScopedDomainEnvelope(domain, value, options = {}) {
  const scopeId = options.scopeId || getActiveAccountScopeId();
  const updatedAt = Number(options.updatedAt || Date.now());
  const base = getDomainBaseKey(domain);
  if (!base) return updatedAt;

  const envelope = {
    data: value,
    updatedAt,
  };

  safeWriteJson(getScopedDomainKey(domain, scopeId), envelope);

  if (scopeId === 'local') {
    safeWriteJson(base, value);
  }

  return updatedAt;
}

export function loadScopedDomainData(domain, fallbackValue, scopeId = getActiveAccountScopeId()) {
  return readScopedDomainEnvelope(domain, fallbackValue, scopeId).data;
}

export function saveScopedDomainData(domain, value, options = {}) {
  return writeScopedDomainEnvelope(domain, value, options);
}

export function buildAccountSnapshot(scopeId = getActiveAccountScopeId()) {
  const lessons = readScopedDomainEnvelope('lessons', [], scopeId);
  const sessions = readScopedDomainEnvelope('sessions', [], scopeId);
  const folders = readScopedDomainEnvelope('folders', [], scopeId);
  const students = readScopedDomainEnvelope('students', [], scopeId);
  const settings = readScopedDomainEnvelope('settings', {}, scopeId);

  return {
    version: 1,
    scopeId,
    updatedAt: Date.now(),
    domains: {
      lessons,
      sessions,
      folders,
      students,
      settings,
    },
  };
}

export function applyAccountSnapshot(snapshot, options = {}) {
  const scopeId = options.scopeId || getActiveAccountScopeId();
  const domains = snapshot?.domains || {};

  const keys = ['lessons', 'sessions', 'folders', 'students', 'settings'];
  keys.forEach((domain) => {
    const envelope = normalizeEnvelope(domains?.[domain], domain === 'settings' ? {} : []);
    writeScopedDomainEnvelope(domain, envelope.data, {
      scopeId,
      updatedAt: envelope.updatedAt || Date.now(),
    });
  });
}

export function seedScopeFromLocal(scopeId = getActiveAccountScopeId()) {
  if (scopeId === 'local') return false;

  const keys = ['lessons', 'sessions', 'folders', 'students', 'settings'];
  const hasExistingScopedData = keys.some((domain) => {
    const scopedRaw = safeReadJson(getScopedDomainKey(domain, scopeId));
    if (scopedRaw === null) return false;
    const normalized = normalizeEnvelope(scopedRaw, domain === 'settings' ? {} : []);
    return hasMeaningfulData(normalized.data);
  });

  if (hasExistingScopedData) return false;

  let copied = false;
  keys.forEach((domain) => {
    const localEnvelope = readScopedDomainEnvelope(domain, domain === 'settings' ? {} : [], 'local');
    if (!hasMeaningfulData(localEnvelope.data)) return;
    copied = true;
    writeScopedDomainEnvelope(domain, localEnvelope.data, {
      scopeId,
      updatedAt: localEnvelope.updatedAt || Date.now(),
    });
  });

  return copied;
}
