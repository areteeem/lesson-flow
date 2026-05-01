import { buildGenerationPrompt } from '../config/dslPromptTemplates';
import { generateDSL, parseLesson } from '../parser';
import { validateAiPromptRequest } from './aiPromptValidation.js';
import { getBlockingDslIssues } from './dslDiagnostics.js';

const APIFREELLM_ENDPOINT = '/api/ai';
const APIFREELLM_MODEL = 'apifreellm';

const BLOCK_MARKER_REGEX = /#(?:LESSON|SLIDE|TASK|GROUP|SPLIT_GROUP|LINK)\b/i;

const DIFFICULTY_STYLE_GUIDANCE = {
  controlled_practice: 'Sequence the lesson from modeling to guided practice, then end with one light transfer task.',
  balanced_scaffold: 'Balance instruction, controlled practice, and short transfer tasks with moderate scaffolding.',
  freer_production: 'Keep support concise and move learners toward open-ended or communicative production tasks.',
  exam_style: 'Use tight instructions, objective scoring, and concise task wording suitable for test-style practice.',
};

const PRESET_TEMPLATE_GUIDANCE = {
  grammar: 'Prioritize explicit grammar noticing, controlled practice, and short contextual transfer tasks.',
  vocabulary: 'Focus on meaning, form, usage, and repeated retrieval across several task types.',
  reading: 'Include a short pre-reading setup, one text-based task, and one follow-up reflection or extension task.',
  writing: 'Move from input and sentence-level support toward guided output and short production.',
  speaking: 'Prefer prompt-driven tasks, scaffolded speaking cues, and interaction-ready content.',
  mixed: 'Create a varied lesson with clear pacing and a balanced spread of slide and task types.',
};

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

function normalizeList(values) {
  if (Array.isArray(values)) {
    return values.map((entry) => normalizeInlineText(entry)).filter(Boolean);
  }
  const single = normalizeInlineText(values);
  return single ? [single] : [];
}

function extractDslCandidate(rawText = '') {
  const source = String(rawText || '').trim();
  if (!source) return '';

  const fencedBlocks = [...source.matchAll(/```(?:dsl|txt|text)?\s*([\s\S]*?)```/gi)]
    .map((match) => String(match[1] || '').trim())
    .filter(Boolean);

  const fencedDsl = fencedBlocks.find((entry) => BLOCK_MARKER_REGEX.test(entry));
  const base = fencedDsl || source;
  const markerIndex = base.search(BLOCK_MARKER_REGEX);
  if (markerIndex >= 0) return base.slice(markerIndex).trim();
  return base;
}

function createLessonHeader(title = 'Untitled Lesson', settings = {}) {
  const lines = ['#LESSON', `Title: ${normalizeInlineText(title) || 'Untitled Lesson'}`];

  const lessonTopic = normalizeInlineText(settings.lessonTopic);
  const grammarTopic = normalizeInlineText(settings.grammarTopic);
  const focus = normalizeList(settings.focus);
  const difficulty = normalizeList(settings.difficulty);

  if (lessonTopic) lines.push(`LessonTopic: ${lessonTopic}`);
  if (grammarTopic) lines.push(`GrammarTopic: ${grammarTopic}`);
  if (focus.length) lines.push(`Focus: ${focus.join(', ')}`);
  if (difficulty.length) lines.push(`Difficulty: ${difficulty.join(', ')}`);

  return `${lines.join('\n')}\n\n`;
}

export function normalizeAiGeneratedDsl(rawText = '', options = {}) {
  const existingTitle = normalizeInlineText(options.existingTitle) || 'Untitled Lesson';
  const existingSettings = options.existingSettings && typeof options.existingSettings === 'object'
    ? options.existingSettings
    : {};

  let candidate = extractDslCandidate(rawText);
  if (!candidate) {
    throw new Error('The AI response did not include any DSL content to insert.');
  }

  if (!BLOCK_MARKER_REGEX.test(candidate)) {
    candidate = `${createLessonHeader(existingTitle, existingSettings)}#SLIDE\nTitle: AI Draft\nContent:\n${candidate}`;
  } else if (!/^#LESSON\b/i.test(candidate)) {
    candidate = `${createLessonHeader(existingTitle, existingSettings)}${candidate}`;
  }

  const parsed = parseLesson(candidate);
  if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) {
    throw new Error('The AI response could not be converted into lesson blocks.');
  }

  const blockingIssues = getBlockingDslIssues(parsed.warnings || []);
  if (blockingIssues.length > 0) {
    throw new Error(`The AI response produced invalid DSL: ${blockingIssues[0]}`);
  }

  const normalizedModel = {
    title: parsed.title || existingTitle,
    settings: { ...existingSettings, ...(parsed.settings || {}) },
    blocks: parsed.blocks,
    lesson: parsed.lesson,
  };

  return {
    dsl: generateDSL(normalizedModel),
    parsed,
    warnings: parsed.warnings || [],
  };
}

export function mergeGeneratedDslIntoLesson(currentLesson = {}, generatedDsl = '') {
  const normalized = normalizeAiGeneratedDsl(generatedDsl, {
    existingTitle: currentLesson.title,
    existingSettings: currentLesson.settings,
  });

  const mergedModel = {
    title: currentLesson.title || normalized.parsed.title || 'Untitled Lesson',
    settings: { ...(currentLesson.settings || {}), ...(normalized.parsed.settings || {}) },
    blocks: [...(currentLesson.blocks || []), ...(normalized.parsed.blocks || [])],
    lesson: currentLesson.lesson || normalized.parsed.lesson,
  };

  const dsl = generateDSL(mergedModel);
  return {
    dsl,
    parsed: parseLesson(dsl),
    insertedBlockCount: normalized.parsed.blocks.length,
    warnings: normalized.warnings,
  };
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
  slideCount = 3,
  taskCount = count,
  presetTemplate = 'mixed',
  difficultyStyle = 'balanced_scaffold',
  taskTypes = [],
  slideTypes = [],
  formatSlidesAsMarkdown = true,
  autoSelectTaskTypes = false,
  alwaysSuggestActivityIntent = true,
  excludeInputTextTasks = false,
  notes = '',
  outputFormat = 'Lexor DSL',
} = {}) {
  const cleanTitle = normalizeInlineText(title);
  const cleanTopic = normalizeInlineText(topic);
  const cleanGrammarTopic = normalizeInlineText(grammarTopic);
  const cleanFocus = normalizeInlineText(focus);
  const cleanCustom = String(customPrompt || '').trim();
  const cleanDescription = normalizeInlineText(description).slice(0, 280);
  const cleanNotes = normalizeInlineText(notes).slice(0, 400);
  const safeCount = Math.max(1, Math.min(20, Number(count) || 1));
  const safeTaskCount = Math.max(1, Math.min(24, Number(taskCount) || safeCount));
  const safeSlideCount = Math.max(1, Math.min(12, Number(slideCount) || 1));
  const normalizedTaskTypes = normalizeList(taskTypes);
  const normalizedSlideTypes = normalizeList(slideTypes);
  const contextNotes = [
    cleanTitle ? `Lesson title: ${cleanTitle}.` : '',
    cleanTopic ? `Lesson topic: ${cleanTopic}.` : '',
    cleanGrammarTopic ? `Grammar focus: ${cleanGrammarTopic}.` : '',
    cleanFocus ? `Skill focus: ${cleanFocus}.` : '',
    cleanDescription ? `Teacher notes: ${cleanDescription}.` : '',
    cleanNotes ? `Additional instructions: ${cleanNotes}.` : '',
  ].filter(Boolean);

  const generatorSpec = buildGenerationPrompt({
    taskTypes: autoSelectTaskTypes ? [] : normalizedTaskTypes,
    slideTypes: normalizedSlideTypes,
    topic: cleanTopic || cleanTitle,
    grammar: cleanGrammarTopic,
    level,
  });

  const compositionRules = [
    `Build a cohesive lesson with ${safeSlideCount} slide${safeSlideCount === 1 ? '' : 's'} and ${safeTaskCount} task${safeTaskCount === 1 ? '' : 's'}.`,
    PRESET_TEMPLATE_GUIDANCE[presetTemplate] || PRESET_TEMPLATE_GUIDANCE.mixed,
    DIFFICULTY_STYLE_GUIDANCE[difficultyStyle] || DIFFICULTY_STYLE_GUIDANCE.balanced_scaffold,
    formatSlidesAsMarkdown ? 'Format slide content as clean Markdown with headings, bullets, and short readable sections.' : 'Keep slide content plain and parser-safe without relying on rich Markdown structure.',
    alwaysSuggestActivityIntent ? 'Each slide or task should make the activity intention obvious through the title, instruction, or hint.' : '',
    excludeInputTextTasks ? 'Do not use input-heavy text tasks such as short_answer, long_answer, or fill_typing unless absolutely necessary.' : '',
    autoSelectTaskTypes || normalizedTaskTypes.length === 0
      ? `Choose the strongest task mix yourself, but make sure the lesson includes ${taskTypeLabel} and varied interaction patterns.`
      : `Use these task types across the lesson: ${normalizedTaskTypes.join(', ')}. Include each selected type at least once when pedagogically reasonable.`,
    normalizedSlideTypes.length > 0
      ? `Use these slide types where appropriate: ${normalizedSlideTypes.join(', ')}.`
      : 'Use slides strategically for setup, modeling, and review.',
    `Return the final result as ${outputFormat}.`,
    'The output must be directly parseable and ready to merge into an existing lesson.',
  ].filter(Boolean).join(' ');

  if (cleanCustom) {
    return [
      generatorSpec,
      contextNotes.length ? `Use this lesson context when relevant: ${contextNotes.join(' ')}` : '',
      compositionRules,
      cleanCustom,
      'Include answer keys or correct values wherever the DSL supports them.',
      'Keep the output concise, classroom-ready, directly pasteable, and free of commentary.',
    ].filter(Boolean).join(' ');
  }

  return [
    generatorSpec,
    `Create a lesson for ${level} level learners${cleanTopic ? ` about ${cleanTopic}` : ''}.`,
    ...contextNotes,
    compositionRules,
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
  const validation = validateAiPromptRequest({
    message: options.prompt,
    model: options.model,
    defaultModel: APIFREELLM_MODEL,
  });
  const maxRetries = Math.max(0, Math.min(4, Number(options.maxRetries) || 2));

  if (!validation.ok) throw new Error(validation.error);

  const prompt = validation.message;
  const model = validation.model;

  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt - 1), 8000)));
    }
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

      if (response.status === 429 && attempt < maxRetries) {
        lastError = new Error('Rate limited — retrying.');
        continue;
      }

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
        attempts: attempt + 1,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries) break;
      const msg = error?.message || '';
      if (/rejected|unauthorized|forbidden/i.test(msg)) break;
    }
  }
  throw new Error(createFetchErrorMessage(lastError));
}
