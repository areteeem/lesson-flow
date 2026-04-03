import { loadAppSettings } from './appSettings';

const PROVIDER_DEFAULTS = {
  gemini: {
    model: 'gemini-2.0-flash',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
  },
  gpt: {
    model: 'gpt-4.1-mini',
    endpoint: 'https://api.openai.com/v1/chat/completions',
  },
  deepseek: {
    model: 'deepseek-chat',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
  },
  claude: {
    model: 'claude-3-5-sonnet-latest',
    endpoint: 'https://api.anthropic.com/v1/messages',
  },
};

function readEnvToken() {
  try {
    const envToken = import.meta?.env?.VITE_AI_TOKEN;
    if (typeof envToken === 'string' && envToken.trim()) return envToken.trim();
  } catch {
    // Ignore runtime environments where import.meta is unavailable.
  }

  try {
    if (typeof process !== 'undefined' && process?.env?.AI_TOKEN) {
      const processToken = String(process.env.AI_TOKEN || '').trim();
      if (processToken) return processToken;
    }
  } catch {
    // Ignore browser environments where process is unavailable.
  }

  try {
    if (typeof window !== 'undefined' && typeof window.__AI_TOKEN === 'string' && window.__AI_TOKEN.trim()) {
      return window.__AI_TOKEN.trim();
    }
  } catch {
    // Ignore SSR/runtime edge cases.
  }

  return '';
}

function readSettings() {
  try {
    return loadAppSettings() || {};
  } catch {
    return {};
  }
}

function normalizeProvider(value) {
  const provider = String(value || '').trim().toLowerCase();
  if (provider in PROVIDER_DEFAULTS) return provider;
  return 'gemini';
}

function clampNumber(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function getProviderDefaults(provider) {
  return PROVIDER_DEFAULTS[normalizeProvider(provider)] || PROVIDER_DEFAULTS.gemini;
}

export function getAiBridgeSettings() {
  const settings = readSettings();
  const provider = normalizeProvider(settings.preferredAI || 'gemini');
  const defaults = getProviderDefaults(provider);
  const apiKey = String(settings.aiApiKey || settings.aiToken || readEnvToken() || '').trim();
  return {
    provider,
    apiKey,
    model: String(settings.aiModel || defaults.model).trim() || defaults.model,
    endpoint: String(settings.aiEndpoint || defaults.endpoint).trim() || defaults.endpoint,
    temperature: clampNumber(settings.aiTemperature, 0.7, 0, 2),
    maxOutputTokens: clampNumber(settings.aiMaxOutputTokens, 2048, 128, 8192),
    systemPrompt: String(settings.aiSystemPrompt || '').trim(),
    promptPrefix: String(settings.aiPromptPrefix || '').trim(),
    promptSuffix: String(settings.aiPromptSuffix || '').trim(),
    promptStyle: String(settings.aiPromptStyle || 'teacher-ready').trim() || 'teacher-ready',
    includeAnswerKeys: settings.aiIncludeAnswerKeys !== false,
  };
}

export function hasAiBridgeToken() {
  return Boolean(getAiBridgeSettings().apiKey);
}

export function getAiBridgeToken() {
  return getAiBridgeSettings().apiKey;
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
  topic = '',
  level = 'B1',
  taskTypeLabel = 'language tasks',
  count = 3,
  customPrompt = '',
  outputFormat = 'Lexor DSL',
} = {}) {
  const settings = getAiBridgeSettings();
  const cleanTopic = String(topic || '').trim();
  const cleanCustom = String(customPrompt || '').trim();
  const safeCount = Math.max(1, Math.min(20, Number(count) || 1));

  const styleInstructions = {
    'teacher-ready': 'Make the output classroom-ready, concise, and easy to paste directly into a lesson.',
    'exam-focused': 'Prioritize accuracy, distractor quality, and exam-style phrasing.',
    'conversation-first': 'Keep the output communicative, discussion-friendly, and natural.',
    scaffolded: 'Sequence the output from simpler to harder with clear scaffolding.',
  };

  const basePrompt = cleanCustom || [
    `Create ${safeCount} ${taskTypeLabel} for ${level} level learners${cleanTopic ? ` about ${cleanTopic}` : ''}.`,
    `Return the response in ${outputFormat}.`,
    'Each task should be valid and ready to insert into the editor.',
    settings.includeAnswerKeys ? 'Include answer keys or correct values wherever the DSL supports them.' : 'Do not include answer keys unless the prompt explicitly asks for them.',
    styleInstructions[settings.promptStyle] || styleInstructions['teacher-ready'],
  ].join(' ');

  return [settings.promptPrefix, basePrompt, settings.promptSuffix]
    .filter(Boolean)
    .join('\n\n')
    .trim();
}

function parseGeminiText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts || [];
  return parts.map((entry) => entry?.text || '').join('\n').trim();
}

function parseOpenAiText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) return content.map((entry) => entry?.text || '').join('\n').trim();
  return '';
}

function parseClaudeText(payload) {
  const content = payload?.content;
  if (!Array.isArray(content)) return '';
  return content
    .map((entry) => (entry?.type === 'text' ? entry.text || '' : ''))
    .join('\n')
    .trim();
}

async function readErrorMessage(response) {
  const text = await response.text();
  return text.slice(0, 400) || `Request failed with status ${response.status}.`;
}

function createFetchErrorMessage(error, provider) {
  const base = error?.message || 'Failed to fetch AI response.';
  if (!/failed to fetch/i.test(base)) return base;
  return `${base} Check the provider endpoint, browser network access, and whether this key is allowed to call ${provider} from your current origin.`;
}

async function requestGemini({ apiKey, endpoint, model, systemPrompt, prompt, temperature, maxOutputTokens }) {
  const url = `${endpoint.replace(/\/$/, '')}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature,
      maxOutputTokens,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw new Error(await readErrorMessage(response));
  return parseGeminiText(await response.json());
}

async function requestOpenAiCompatible({ apiKey, endpoint, model, systemPrompt, prompt, temperature, maxOutputTokens }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: Math.round(maxOutputTokens),
      messages: [
        ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) throw new Error(await readErrorMessage(response));
  return parseOpenAiText(await response.json());
}

async function requestClaude({ apiKey, endpoint, model, systemPrompt, prompt, temperature, maxOutputTokens }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: Math.round(maxOutputTokens),
      system: systemPrompt || undefined,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(await readErrorMessage(response));
  return parseClaudeText(await response.json());
}

export async function generateAiText(options = {}) {
  const defaults = getAiBridgeSettings();
  const provider = normalizeProvider(options.provider || defaults.provider);
  const apiKey = String(options.apiKey || defaults.apiKey || '').trim();
  const model = String(options.model || defaults.model || '').trim();
  const endpoint = String(options.endpoint || defaults.endpoint || '').trim();
  const systemPrompt = String(options.systemPrompt ?? defaults.systemPrompt ?? '').trim();
  const prompt = String(options.prompt || '').trim();
  const temperature = clampNumber(options.temperature, defaults.temperature, 0, 2);
  const maxOutputTokens = clampNumber(options.maxOutputTokens, defaults.maxOutputTokens, 128, 8192);

  if (!apiKey) throw new Error('No AI API key configured. Add one in Settings or provide VITE_AI_TOKEN.');
  if (!prompt) throw new Error('AI prompt is empty.');

  try {
    let text = '';
    if (provider === 'gemini') {
      text = await requestGemini({ apiKey, endpoint, model, systemPrompt, prompt, temperature, maxOutputTokens });
    } else if (provider === 'claude') {
      text = await requestClaude({ apiKey, endpoint, model, systemPrompt, prompt, temperature, maxOutputTokens });
    } else {
      text = await requestOpenAiCompatible({ apiKey, endpoint, model, systemPrompt, prompt, temperature, maxOutputTokens });
    }

    if (!text) throw new Error('The AI provider returned an empty response.');

    return {
      text,
      provider,
      model,
      endpoint,
    };
  } catch (error) {
    throw new Error(createFetchErrorMessage(error, provider));
  }
}
