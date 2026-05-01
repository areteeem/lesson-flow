const MAX_AI_PROMPT_LENGTH = 24_000;
const MAX_AI_MODEL_LENGTH = 80;
const CONTROL_CHARACTERS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const MODEL_NAME_RE = /^[A-Za-z0-9._:-]+$/;

function normalizePromptText(value = '') {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARACTERS_RE, '')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function normalizeModelName(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized.length > MAX_AI_MODEL_LENGTH) return '';
  if (!MODEL_NAME_RE.test(normalized)) return '';
  return normalized;
}

export function validateAiPromptRequest({ message, model, defaultModel = 'apifreellm' } = {}) {
  const normalizedMessage = normalizePromptText(message);
  if (!normalizedMessage) {
    return { ok: false, error: 'AI prompt is empty.' };
  }

  if (normalizedMessage.length > MAX_AI_PROMPT_LENGTH) {
    return {
      ok: false,
      error: `AI prompt exceeds the ${MAX_AI_PROMPT_LENGTH.toLocaleString()} character limit. Shorten the request and try again.`,
    };
  }

  const normalizedModel = normalizeModelName(model);
  if (model && !normalizedModel) {
    return {
      ok: false,
      error: 'AI model name contains unsupported characters or is too long.',
    };
  }

  return {
    ok: true,
    message: normalizedMessage,
    model: normalizedModel || defaultModel,
  };
}