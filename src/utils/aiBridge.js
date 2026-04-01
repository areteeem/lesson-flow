function readEnvToken() {
  try {
    const envToken = import.meta?.env?.VITE_AI_TOKEN;
    if (typeof envToken === 'string' && envToken.trim()) return envToken.trim();
  } catch {
    // ignore runtime environments where import.meta is unavailable
  }

  try {
    if (typeof process !== 'undefined' && process?.env?.AI_TOKEN) {
      const processToken = String(process.env.AI_TOKEN || '').trim();
      if (processToken) return processToken;
    }
  } catch {
    // ignore browser environments where process is unavailable
  }

  try {
    if (typeof window !== 'undefined' && typeof window.__AI_TOKEN === 'string' && window.__AI_TOKEN.trim()) {
      return window.__AI_TOKEN.trim();
    }
  } catch {
    // ignore SSR/runtime edge cases
  }

  return '';
}

export function hasAiBridgeToken() {
  return Boolean(readEnvToken());
}

export function getAiBridgeToken() {
  return readEnvToken();
}

export function createRephraseVariants(text = '') {
  const base = String(text || '').trim();
  if (!base) return [];

  const compact = base.replace(/\s+/g, ' ').trim();
  const lowered = compact.charAt(0).toLowerCase() + compact.slice(1);

  const simple = compact.endsWith('?')
    ? `In simple words, ${lowered}`
    : `In simple words: ${compact}`;

  const complex = compact.endsWith('?')
    ? `Considering the context, ${lowered}`
    : `Considering the context: ${compact}`;

  const flex = compact.endsWith('?')
    ? `FLEX style: choose the most accurate answer for this prompt: ${lowered}`
    : `FLEX style prompt: ${compact}`;

  return [simple, complex, flex]
    .map((entry) => entry.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((entry, index, arr) => arr.indexOf(entry) === index);
}
