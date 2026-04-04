const APIFREELLM_ENDPOINT = '/api/ai';
const APIFREELLM_MODEL = 'apifreellm';

function normalizeInlineText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function hasAiBridgeToken() {
  return true;
}

export function getAiBridgeToken() {
  return '';
}

export function getAiBridgeSettings() {
  return {
    provider: 'apifreellm',
    model: APIFREELLM_MODEL,
    endpoint: APIFREELLM_ENDPOINT,
    mode: 'server-proxy',
  };
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

export function buildAiGenerationPrompt({
  title = '',
  topic = '',
  grammarTopic = '',
  focus = '',
  level = 'B1',
  description = '',
  taskTypeLabel = 'language tasks',
  count = 3,
  customPrompt = '',
  outputFormat = 'Lexor DSL',
} = {}) {
  const cleanTitle = normalizeInlineText(title);
  const cleanTopic = normalizeInlineText(topic);
  const cleanGrammarTopic = normalizeInlineText(grammarTopic);
  const cleanFocus = normalizeInlineText(focus);
  const cleanCustom = String(customPrompt || '').trim();
  const cleanDescription = normalizeInlineText(description).slice(0, 280);
  const safeCount = Math.max(1, Math.min(20, Number(count) || 1));
  const contextNotes = [
    cleanTitle ? `Lesson title: ${cleanTitle}.` : '',
    cleanTopic ? `Lesson topic: ${cleanTopic}.` : '',
    cleanGrammarTopic ? `Grammar focus: ${cleanGrammarTopic}.` : '',
    cleanFocus ? `Skill focus: ${cleanFocus}.` : '',
    cleanDescription ? `Teacher notes: ${cleanDescription}.` : '',
  ].filter(Boolean);

  if (cleanCustom) {
    return [
      contextNotes.length ? `Use this lesson context when relevant: ${contextNotes.join(' ')}` : '',
      cleanCustom,
      `Return the response in ${outputFormat}.`,
      'Each task should be valid and ready to insert into the editor.',
      'Include answer keys or correct values wherever the DSL supports them.',
      'Keep the output concise, classroom-ready, and directly pasteable into the lesson editor.',
    ].filter(Boolean).join(' ');
  }

  return [
    `Create ${safeCount} ${taskTypeLabel} for ${level} level learners${cleanTopic ? ` about ${cleanTopic}` : ''}.`,
    ...contextNotes,
    `Return the response in ${outputFormat}.`,
    'Each task should be valid and ready to insert into the editor.',
    'Include answer keys or correct values wherever the DSL supports them.',
    'Keep the output concise, classroom-ready, and directly pasteable into the lesson editor.',
  ].join(' ');
}

async function readErrorMessage(response) {
  if (response.status === 429) {
    return 'The AI provider rate-limited this key. Wait a minute and try again.';
  }
  if (response.status === 401 || response.status === 403) {
    return 'The AI provider rejected the configured key for this request.';
  }

  try {
    const payload = await response.json();
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim();
    if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error.trim();
  } catch {
    // Ignore invalid JSON error bodies.
  }

  const text = await response.text().catch(() => '');
  return text.slice(0, 400) || `Request failed with status ${response.status}.`;
}

function createFetchErrorMessage(error) {
  const base = error?.message || 'Failed to fetch AI response.';
  if (!/failed to fetch/i.test(base)) return base;
  return `${base} Check the local AI proxy route, restart the dev server if config changed, and verify the server has the AI token configured.`;
}

export async function generateAiText(options = {}) {
  const prompt = String(options.prompt || '').trim();
  const model = String(options.model || APIFREELLM_MODEL).trim() || APIFREELLM_MODEL;

  if (!prompt) throw new Error('AI prompt is empty.');

  try {
    const response = await fetch(APIFREELLM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: prompt,
        model,
      }),
    });

    if (!response.ok) throw new Error(await readErrorMessage(response));

    const payload = await response.json();
    const text = String(payload?.response || '').trim();
    if (!payload?.success || !text) {
      throw new Error('The AI provider returned an empty response.');
    }

    return {
      text,
      provider: 'apifreellm',
      model,
      endpoint: APIFREELLM_ENDPOINT,
      tier: payload?.tier || null,
      features: payload?.features || null,
    };
  } catch (error) {
    throw new Error(createFetchErrorMessage(error));
  }
}
