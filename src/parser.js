import { slugify } from './utils/lesson';
import { slideRegexEntries } from './config/slideRegistry';
import { taskRegexEntries } from './config/taskRegistry';
import { validateBlockSchema, applySchemaFixes } from './config/dslSchema';

const MAX_DSL_SIZE = 512_000; // 500KB limit
const PARSE_CACHE_LIMIT = 20;
const parseCache = new Map();

function cloneParseResult(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function getCachedParse(dsl) {
  const hit = parseCache.get(dsl);
  if (!hit) return null;
  // Refresh LRU order.
  parseCache.delete(dsl);
  parseCache.set(dsl, hit);
  return cloneParseResult(hit);
}

function setCachedParse(dsl, result) {
  parseCache.set(dsl, cloneParseResult(result));
  if (parseCache.size <= PARSE_CACHE_LIMIT) return;
  const oldest = parseCache.keys().next().value;
  parseCache.delete(oldest);
}

/** Sanitize a URL field — reject javascript: and data: URIs */
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (/^\s*(javascript|data|vbscript)\s*:/i.test(trimmed)) return '';
  return trimmed;
}

/** Matches all blank marker forms: {}, ___, [blank], [1], [2], etc. */
const BLANK_MARKER_RE = /(\{\}|_{3,}|\[blank\]|\[\d+\])/gi;

const BLOCK_PATTERNS = [
  { regex: /^#LESSON$/i, type: 'lesson' },
  { regex: /^#SLIDE$/i, type: 'slide' },
  { regex: /^#GROUP$/i, type: 'group' },
  { regex: /^#SPLIT[_\s-]*GROUP$/i, type: 'split_group' },
  { regex: /^#SLIDE:\s*SPLIT[_\s-]*GROUP$/i, type: 'split_group' },
  { regex: /^#LINK$/i, type: 'link' },
  ...slideRegexEntries(),
  ...taskRegexEntries(),
  // Catch-all: any unrecognised #SLIDE: or #TASK: line is still treated as a block boundary
  { regex: /^#SLIDE:\s*.+$/i, type: 'slide', fallback: true },
  { regex: /^#TASK:\s*.+$/i, type: 'task', taskType: 'multiple_choice', fallback: true },
];

/**
 * Pre-process raw DSL text to normalize AI output quirks.
 * Handles: code fences, smart quotes, stray numbering in block markers, BOM, etc.
 */
function preprocessDsl(raw) {
  let text = raw;
  // Strip BOM
  text = text.replace(/^\uFEFF/, '');
  // Strip wrapping code fences (```dsl ... ``` or ```txt ... ``` or ``` ... ```)
  text = text.replace(/^```[a-z]*\s*\n/i, '').replace(/\n```\s*$/i, '');
  // Also handle triple backticks that appear on their own line mid-text (some AIs do ```\n#LESSON\n...```)
  if (/^```/.test(text.trim())) {
    text = text.trim().replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```\s*$/, '');
  }
  // Normalize smart/curly quotes to straight quotes
  text = text.replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"').replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'");
  // Normalize en-dash / em-dash used as list markers
  text = text.replace(/^[\u2013\u2014]\s/gm, '- ');
  // Normalize ellipsis character
  text = text.replace(/\u2026/g, '...');
  // Collapse 3+ consecutive blank lines into 1
  text = text.replace(/\n{4,}/g, '\n\n\n');
  // Fix common AI mistake: "# TASK:" or "# SLIDE:" with space after #
  text = text.replace(/^#\s+(TASK|SLIDE|LESSON|GROUP|SPLIT_GROUP|LINK)\b/gim, '#$1');
  // Fix numbered block markers like "1. #TASK: MULTIPLE_CHOICE" or "- #SLIDE"
  text = text.replace(/^(?:\d+[.)]\s*|[-*+]\s+)(#(?:TASK|SLIDE|LESSON|GROUP|SPLIT_GROUP|LINK)\b)/gim, '$1');
  return text;
}

const LIST_KEYS = new Set([
  'options', 'items', 'pairs', 'categories', 'words', 'sentences', 'correct',
  'examples', 'notes', 'columns', 'rows', 'blanks', 'targets', 'cards',
  'contains', 'blocks', 'prompts', 'answers', 'questions', 'steps', 'keywords',
  'taskrefs', 'media', 'images', 'videos', 'audios', 'leftitems', 'rightitems', 'hiddenrows', 'hiddencells',
]);

const MULTILINE_KEYS = new Set([
  'content', 'text', 'positive', 'negative', 'question', 'instruction', 'hint',
  'title', 'sentence', 'prompt', 'front', 'back', 'description', 'left', 'right',
  'dialogue', 'explanation', 'media', 'image', 'video', 'audio', 'src', 'url',
]);

// All recognised DSL field keys — used to prevent false positives in multiline/list
// mode (e.g. dialogue lines like "A: Hello" being treated as a new field).
const KNOWN_KEYS = new Set([
  ...LIST_KEYS,
  ...MULTILINE_KEYS,
  'answer', 'correct', 'ref', 'linkto', 'group', 'enabled', 'shuffle', 'repeat',
  'min', 'max', 'timelimit', 'placeholder', 'multiple', 'lessontopic', 'grammartopic',
  'focus', 'difficulty', 'showhints', 'showexplanations', 'revealmode', 'randomhiddencount',
  'flexibleorder', 'layout', 'tasktype', 'type', 'points',
]);

function detectBlock(line) {
  const trimmed = line.trim();
  // Fast path: most lines don't start with #, skip regex scan
  if (trimmed.charAt(0) !== '#') return null;
  return BLOCK_PATTERNS.find((pattern) => pattern.regex.test(trimmed)) || null;
}

function cleanListItem(value) {
  return value.replace(/^[-*+]\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
}

function toList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  if (typeof value !== 'string') return [value];
  // If it's a multiline string with newlines, split by lines
  if (value.includes('\n')) {
    return value.split('\n').map((item) => cleanListItem(item.trim())).filter(Boolean);
  }
  // Only split on pipe — commas inside a single-line value are ambiguous and
  // may be part of multi-word items (e.g. "United States, USA").
  if (value.includes('|')) return value.split('|').map((item) => item.trim()).filter(Boolean);
  return [value.trim()].filter(Boolean);
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  return ['true', 'yes', '1', 'on'].includes(value.trim().toLowerCase());
}

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePairs(items = []) {
  return items.map((item) => {
    const [left, right] = item.includes('=>')
      ? item.split('=>')
      : item.includes('->')
        ? item.split('->')
        : item.includes('→')
          ? item.split('→')
          : item.split('|');
    return {
      left: (left || '').trim(),
      right: (right || '').trim(),
    };
  }).filter((pair) => pair.left || pair.right);
}

function parseCards(items = []) {
  return parsePairs(items).map((pair) => ({ front: pair.left, back: pair.right }));
}

function parseRows(items = []) {
  return items.map((row) => row.split('|').map((cell) => cell.trim()).filter(Boolean)).filter((row) => row.length > 0);
}

function parseRefs(items = []) {
  return items
    .flatMap((item) => item.toString().split(/[,|\s]+/))
    .map((item) => item.trim())
    .filter((item) => item && !/^#(TASK|SLIDE|GROUP|SPLIT_GROUP|LINK)/i.test(item));
}

function sanitizeContent(text) {
  if (!text) return '';
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      // Strip any raw block markers that leaked into content
      if (/^#(TASK|SLIDE|LESSON|GROUP|LINK)\b/i.test(t)) return false;
      return !BLOCK_PATTERNS.some((pattern) => pattern.regex.test(t));
    })
    .join('\n')
    .trim();
}

function validateBlock(block, warnings) {
  const label = block.title || block.question || block.ref || 'Unknown';
  if (block.type === 'task') {
    // --- Basic field presence ---
    if (!block.question && !block.instruction) {
      warnings.push(`Task "${label}" (${block.taskType}) has no Question or Instruction.`);
    }

    // --- Choice tasks: answer/options alignment ---
    if (['multiple_choice', 'either_or'].includes(block.taskType)) {
      if (block.options.length === 0) {
        warnings.push(`Task "${label}" (${block.taskType}) has no options.`);
      }
      if (block.options.length > 0 && block.options.length < 3 && block.taskType === 'multiple_choice') {
        warnings.push(`Task "${label}" (multiple_choice) has only ${block.options.length} option(s) — need at least 3.`);
      }
      const normalizedAnswer = (Array.isArray(block.answer) ? block.answer : [block.answer]).map((a) => a.toString().trim().toLowerCase()).filter(Boolean);
      const normalizedOptions = block.options.map((o) => o.toString().trim().toLowerCase());
      for (const ans of normalizedAnswer) {
        if (ans && normalizedOptions.length > 0 && !normalizedOptions.includes(ans)) {
          warnings.push(`Task "${label}" (${block.taskType}) answer "${ans}" is not one of the options.`);
        }
      }
    }

    if (block.taskType === 'multi_select') {
      const answers = Array.isArray(block.answer) ? block.answer : (block.answer || '').toString().split(/[|,]/).map((s) => s.trim()).filter(Boolean);
      const normalizedOptions = block.options.map((o) => o.toString().trim().toLowerCase());
      for (const ans of answers) {
        if (ans && normalizedOptions.length > 0 && !normalizedOptions.includes(ans.toLowerCase())) {
          warnings.push(`Task "${label}" (multi_select) answer "${ans}" is not in options.`);
        }
      }
      if (answers.length < 2) {
        warnings.push(`Task "${label}" (multi_select) has ${answers.length} correct answer(s) — need at least 2.`);
      }
    }

    if (['true_false', 'yes_no'].includes(block.taskType) && block.options.length === 0) {
      warnings.push(`Task "${label}" (${block.taskType}) has no options.`);
    }

    // --- true_false / yes_no: answer must be in options ---
    if (['true_false', 'yes_no'].includes(block.taskType) && block.options.length > 0 && block.answer) {
      const normalizedOptions = block.options.map((o) => o.toString().trim().toLowerCase());
      const ans = block.answer.toString().trim().toLowerCase();
      if (ans && !normalizedOptions.includes(ans)) {
        warnings.push(`Task "${label}" (${block.taskType}) answer "${block.answer}" is not one of the options.`);
      }
    }

    // --- TABLE_DRAG: validate hiddenCells references ---
    if (block.taskType === 'table_drag') {
      if (block.rows && block.hiddenCells) {
        for (const cell of block.hiddenCells) {
          const parts = cell.split(':');
          if (parts.length !== 2) {
            warnings.push(`Task "${label}" (table_drag) hiddenCells "${cell}" must be "row:col" format.`);
            continue;
          }
          const [r, c] = parts.map(Number);
          if (isNaN(r) || isNaN(c) || r < 0 || c < 0) {
            warnings.push(`Task "${label}" (table_drag) hiddenCells "${cell}" has invalid indices.`);
          } else if (r >= block.rows.length) {
            warnings.push(`Task "${label}" (table_drag) hiddenCells "${cell}" row ${r} exceeds row count ${block.rows.length}.`);
          } else if (c >= (block.rows[r] || []).length) {
            warnings.push(`Task "${label}" (table_drag) hiddenCells "${cell}" col ${c} exceeds column count.`);
          }
        }
        if (block.options.length === 0 && block.hiddenCells.length > 0) {
          warnings.push(`Task "${label}" (table_drag) has hidden cells but no drag options.`);
        }
      }
    }

    // --- Drag-to-blank: blank count alignment ---
    if (['drag_to_blank', 'type_in_blank'].includes(block.taskType)) {
      if ((!block.blanks || block.blanks.length === 0) && (!block.options || block.options.length === 0)) {
        warnings.push(`Task "${label}" (${block.taskType}) needs Blanks or Options.`);
      }
      if (block.text) {
        const blankCount = (block.text.match(BLANK_MARKER_RE) || []).length;
        if (blankCount === 0) {
          warnings.push(`Task "${label}" (${block.taskType}) text has no blank markers (___, {}, [blank], or [1],[2]…).`);
        } else if (block.blanks.length > 0 && block.blanks.length !== blankCount) {
          warnings.push(`Task "${label}" (${block.taskType}) has ${blankCount} blank(s) in text but ${block.blanks.length} in Blanks array.`);
        }
      }
    }

    // --- Fill typing / dialogue completion: blank count ---
    if (['fill_typing', 'dialogue_completion', 'dialogue_fill'].includes(block.taskType)) {
      if (block.text && block.text.search(BLANK_MARKER_RE) === -1) {
        warnings.push(`Task "${label}" (${block.taskType}) text has no inline blanks (___, {}, [blank], or [1],[2]…).`);
      }
      if (block.text) {
        const blankCount = (block.text.match(BLANK_MARKER_RE) || []).length;
        const answerStr = (Array.isArray(block.answer) ? block.answer.join('|') : block.answer || '').toString();
        const answerCount = answerStr ? answerStr.split('|').map((s) => s.trim()).filter(Boolean).length : 0;
        if (blankCount > 0 && answerCount > 0 && blankCount !== answerCount) {
          warnings.push(`Task "${label}" (${block.taskType}) has ${blankCount} blank(s) but ${answerCount} answer(s).`);
        }
      }
    }

    // --- Error correction: answer count vs sentence count ---
    if (block.taskType === 'error_correction') {
      const sentences = (block.text || '').split('\n').map((s) => s.trim()).filter(Boolean);
      const answerStr = (Array.isArray(block.answer) ? block.answer.join('|') : block.answer || '').toString();
      const answers = answerStr ? answerStr.split('|').map((s) => s.trim()).filter(Boolean) : [];
      if (sentences.length > 0 && answers.length > 0 && sentences.length !== answers.length) {
        warnings.push(`Task "${label}" (error_correction) has ${sentences.length} sentence(s) but ${answers.length} answer(s).`);
      }
    }

    // --- Order tasks ---
    if (['order', 'timeline_order', 'sentence_builder', 'story_reconstruction'].includes(block.taskType)) {
      if (!block.items || block.items.length < 2) {
        warnings.push(`Task "${label}" (${block.taskType}) needs at least 2 items.`);
      }
    }

    // --- Categorize tasks ---
    if (['categorize', 'categorize_grammar', 'matching_pairs_categories'].includes(block.taskType)) {
      if (!block.categories || block.categories.length < 2) {
        warnings.push(`Task "${label}" (${block.taskType}) needs at least 2 categories.`);
      }
      if (block.pairs.length > 0) {
        const catSet = new Set(block.categories.map((c) => c.toLowerCase()));
        for (const pair of block.pairs) {
          if (pair.right && !catSet.has(pair.right.toLowerCase())) {
            warnings.push(`Task "${label}" (${block.taskType}) item "${pair.left}" maps to category "${pair.right}" which is not in Categories.`);
          }
        }
      }
      if (block.items.length === 0 && block.pairs.length === 0) {
        warnings.push(`Task "${label}" (${block.taskType}) has no items to categorize.`);
      }
    }

    // --- Match / drag_drop: pairs ---
    if (['drag_drop', 'match', 'emoji_symbol_match'].includes(block.taskType)) {
      if (block.pairs.length === 0 && block.cards.length === 0) {
        warnings.push(`Task "${label}" (${block.taskType}) expects pairs.`);
      }
      const leftValues = block.pairs.map((p) => p.left.toLowerCase());
      const dupes = leftValues.filter((v, i) => leftValues.indexOf(v) !== i);
      if (dupes.length > 0) {
        warnings.push(`Task "${label}" (${block.taskType}) has duplicate left-side pair values: ${[...new Set(dupes)].join(', ')}.`);
      }
    }

    // --- Cards ---
    if (block.taskType === 'cards') {
      if (block.cards.length === 0 && block.pairs.length === 0 && block.items.length === 0) {
        warnings.push(`Task "${label}" (cards) has no cards, pairs, or items.`);
      }
    }

    // --- Random wheel ---
    if (block.taskType === 'random_wheel' && (!block.items || block.items.length === 0) && (!block.options || block.options.length === 0)) {
      warnings.push(`Task "${label}" (random_wheel) has no items or options.`);
    }

    // --- Reading highlight ---
    if (['reading_highlight', 'highlight', 'highlight_differences', 'highlight_glossary'].includes(block.taskType)) {
      if (!block.text) {
        warnings.push(`Task "${label}" (${block.taskType}) has no text to highlight.`);
      }
      if (block.taskType !== 'highlight_glossary' && (!block.targets || block.targets.length === 0)) {
        warnings.push(`Task "${label}" (${block.taskType}) has no target words.`);
      }
      if (block.text && block.targets && block.targets.length > 0) {
        const textLower = block.text.toLowerCase();
        for (const target of block.targets) {
          if (!textLower.includes(target.toLowerCase())) {
            warnings.push(`Task "${label}" (${block.taskType}) target "${target}" not found in text.`);
          }
        }
      }
      if (block.taskType === 'highlight_glossary' && block.pairs.length > 0) {
        const textLower = block.text.toLowerCase();
        for (const pair of block.pairs) {
          if (pair.left && !textLower.includes(pair.left.toLowerCase())) {
            warnings.push(`Task "${label}" (${block.taskType}) translation word "${pair.left}" not found in text.`);
          }
        }
      }
    }

    // --- Scale ---
    if (block.taskType === 'scale' && block.min !== undefined && block.max !== undefined && block.min >= block.max) {
      warnings.push(`Task "${label}" (scale) min (${block.min}) must be less than max (${block.max}).`);
    }

    if (block.linkTo && !block.linkTo.trim()) {
      warnings.push(`Task "${label}" has an empty LinkTo reference.`);
    }
  }
  if (['slide', 'rich'].includes(block.type) && !block.content && !block.title) {
    warnings.push(`Slide "${label}" has no content and no title.`);
  }
  if (block.layout === 'two_column_text_task' && !block.left && !block.right) {
    warnings.push(`Two-column slide "${label}" has no Left or Right content.`);
  }
  if (block.layout === 'carousel' && (!block.steps || block.steps.length === 0)) {
    warnings.push(`Carousel slide "${label}" has no steps.`);
  }
  if (block.layout === 'step_by_step' && (!block.steps || block.steps.length === 0)) {
    warnings.push(`Step-by-step slide "${label}" has no steps.`);
  }
  if (block.layout === 'focus' && (!block.keywords || block.keywords.length === 0)) {
    warnings.push(`Focus slide "${label}" has no keywords.`);
  }
  if (block.media && /\[.*?\]\(.*?\)/.test(block.media)) {
    warnings.push(`"${label}" Media field contains a markdown link instead of a raw URL.`);
  }
}

function parseBlockLines(lines) {
  const data = {};
  let currentKey = null;
  let mode = null;
  let compositeListBuffer = [];

  const flushCompositeListBuffer = () => {
    if (mode === 'list' && currentKey === 'steps' && compositeListBuffer.length > 0) {
      data[currentKey].push(compositeListBuffer.join('\n').trim());
      compositeListBuffer = [];
    }
  };

  const flush = () => {
    flushCompositeListBuffer();
    currentKey = null;
    mode = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r/g, '');
    const trimmed = line.trim();
    const keyValue = line.match(/^([A-Za-z][A-Za-z0-9_ ]*)\s*:\s*(.*)$/);

    if (keyValue) {
      const key = keyValue[1].trim().toLowerCase().replace(/\s+/g, '');
      const value = keyValue[2].trim();

      // When accumulating multiline or list content, only break on recognised DSL
      // keys.  This prevents dialogue speaker lines like "A: Hello" or "Teacher:
      // Good morning" from being misinterpreted as new field declarations.
      if ((mode === 'multiline' || mode === 'list') && !KNOWN_KEYS.has(key)) {
        if (mode === 'multiline') {
          data[currentKey] = data[currentKey] ? `${data[currentKey]}\n${line}` : line;
        } else if (currentKey === 'steps') {
          compositeListBuffer.push(cleanListItem(trimmed));
        } else {
          data[currentKey].push(cleanListItem(trimmed));
        }
        continue;
      }

      flush();
      if (LIST_KEYS.has(key)) {
        data[key] = [];
        currentKey = key;
        mode = 'list';
        if (value) {
          if (key === 'steps') {
            compositeListBuffer = [cleanListItem(value)];
          } else {
            data[key] = toList(value);
          }
        }
        continue;
      }
      if (MULTILINE_KEYS.has(key)) {
        data[key] = value || '';
        currentKey = key;
        mode = 'multiline';
        // If value was provided on the same line, keep collecting on subsequent lines too
        continue;
      }
      if (key === 'answer' || key === 'correct') {
        const normalized = value.includes('|') ? value.split('|').map((item) => item.trim()).filter(Boolean) : value;
        if (data[key]) {
          data[key] = [...toList(data[key]), ...toList(normalized)];
        } else {
          data[key] = normalized;
        }
        continue;
      }
      data[key] = value;
      continue;
    }

    if (mode === 'list') {
      if (currentKey === 'steps') {
        if (!trimmed) {
          flushCompositeListBuffer();
          continue;
        }
        compositeListBuffer.push(cleanListItem(trimmed));
        continue;
      }
      if (!trimmed) continue;
      data[currentKey].push(cleanListItem(trimmed));
      continue;
    }

    if (mode === 'multiline') {
      data[currentKey] = data[currentKey] ? `${data[currentKey]}\n${line}` : line;
      continue;
    }

    if (trimmed) {
      data.content = data.content ? `${data.content}\n${line}` : line;
    }
  }

  return data;
}

/**
 * Auto-repair common AI generation mistakes so tasks are playable.
 * Mutates block in place and appends to warnings when fixes are applied.
 */
function autoRepairTask(block, warnings) {
  const label = block.question || block.title || block.ref || 'Unknown';

  // --- MULTIPLE_CHOICE: ensure answer is in options ---
  if (['multiple_choice', 'either_or'].includes(block.taskType) && block.options.length > 0) {
    const answerStr = (block.answer || block.correct || '').toString().trim();
    if (answerStr) {
      const normalizedOptions = block.options.map((o) => o.toString().trim().toLowerCase());
      if (!normalizedOptions.includes(answerStr.toLowerCase())) {
        // Try fuzzy: check if answer is a substring / close match
        const fuzzyMatch = block.options.find((o) => o.toLowerCase().includes(answerStr.toLowerCase()) || answerStr.toLowerCase().includes(o.toLowerCase()));
        if (fuzzyMatch) {
          block.answer = fuzzyMatch;
          block.correct = fuzzyMatch;
          warnings.push(`Auto-fixed "${label}": answer adjusted to match option "${fuzzyMatch}".`);
        } else {
          // Add the answer as an option so the task is at least solvable
          block.options.push(answerStr);
          warnings.push(`Auto-fixed "${label}": answer "${answerStr}" was not in options — added it.`);
        }
      }
    }
  }

  // --- MULTI_SELECT: ensure all answers are in options ---
  if (block.taskType === 'multi_select' && block.options.length > 0) {
    const answers = Array.isArray(block.answer) ? block.answer : (block.answer || '').toString().split(/[|,]/).map((s) => s.trim()).filter(Boolean);
    const normalizedOptions = block.options.map((o) => o.toString().trim().toLowerCase());
    for (const ans of answers) {
      if (!normalizedOptions.includes(ans.toLowerCase())) {
        block.options.push(ans);
        warnings.push(`Auto-fixed "${label}": multi_select answer "${ans}" was not in options — added it.`);
      }
    }
  }

  // --- DRAG_TO_BLANK: align blank count with text markers ---
  if (block.taskType === 'drag_to_blank' && block.text) {
    const blankCount = (block.text.match(BLANK_MARKER_RE) || []).length;
    if (blankCount > 0 && block.blanks.length > 0 && block.blanks.length !== blankCount) {
      if (block.blanks.length > blankCount) {
        // Too many blanks — move extras to options as distractors
        const extras = block.blanks.splice(blankCount);
        block.options = [...block.options, ...extras];
        warnings.push(`Auto-fixed "${label}": had ${blankCount + extras.length} blanks but ${blankCount} markers — moved ${extras.length} to options.`);
      } else {
        // Too few blanks — try to fill from answer
        const answerParts = (Array.isArray(block.answer) ? block.answer : (block.answer || '').toString().split('|').map((s) => s.trim())).filter(Boolean);
        while (block.blanks.length < blankCount && answerParts.length > block.blanks.length) {
          block.blanks.push(answerParts[block.blanks.length]);
        }
        if (block.blanks.length !== blankCount) {
          warnings.push(`Auto-repair incomplete: "${label}" has ${blankCount} blank markers but only ${block.blanks.length} blanks.`);
        }
      }
    }
  }

  // --- ERROR_CORRECTION: align answer count with sentence count ---
  if (block.taskType === 'error_correction' && block.text) {
    const sentences = block.text.split('\n').map((s) => s.trim()).filter(Boolean);
    const answerStr = (Array.isArray(block.answer) ? block.answer.join('|') : block.answer || '').toString();
    const answers = answerStr ? answerStr.split('|').map((s) => s.trim()).filter(Boolean) : [];
    if (sentences.length > 0 && answers.length > 0 && sentences.length !== answers.length) {
      if (answers.length > sentences.length) {
        // Trim excess answers
        const trimmed = answers.slice(0, sentences.length);
        block.answer = trimmed.join(' | ');
        block.correct = block.answer;
        warnings.push(`Auto-fixed "${label}": trimmed ${answers.length - sentences.length} excess answer(s) to match ${sentences.length} sentence(s).`);
      }
    }
  }

  // --- FILL_TYPING / DIALOGUE_COMPLETION / DIALOGUE_FILL: align answer count with blank count ---
  if (['fill_typing', 'dialogue_completion', 'dialogue_fill', 'type_in_blank'].includes(block.taskType) && block.text) {
    const blankCount = (block.text.match(BLANK_MARKER_RE) || []).length;
    const answerStr = (Array.isArray(block.answer) ? block.answer.join('|') : block.answer || '').toString();
    const answers = answerStr ? answerStr.split('|').map((s) => s.trim()).filter(Boolean) : [];
    if (blankCount > 0 && answers.length > blankCount) {
      const trimmed = answers.slice(0, blankCount);
      block.answer = trimmed.join(' | ');
      block.correct = block.answer;
      warnings.push(`Auto-fixed "${label}": trimmed ${answers.length - blankCount} excess answer(s) to match ${blankCount} blank(s).`);
    }
  }

  // --- CATEGORIZE: ensure items have => syntax ---
  if (['categorize', 'categorize_grammar', 'matching_pairs_categories'].includes(block.taskType)) {
    // If items lack => but pairs exist, rebuild items from pairs
    if (block.items.length > 0 && block.pairs.length > 0) {
      const itemsWithArrow = block.items.filter((i) => i.includes('=>'));
      if (itemsWithArrow.length === 0) {
        // Items don't have => syntax — use pairs to derive correct items
        block.items = block.pairs.map((p) => p.left);
        warnings.push(`Auto-fixed "${label}": items had no "=>" mapping — rebuilt from pairs.`);
      }
    }
  }

  // --- READING_HIGHLIGHT: ensure targets exist in text ---
  if (['reading_highlight', 'highlight', 'highlight_differences', 'highlight_glossary'].includes(block.taskType) && block.text && block.targets && block.targets.length > 0) {
    const textLower = block.text.toLowerCase();
    block.targets = block.targets.filter((target) => {
      if (textLower.includes(target.toLowerCase())) return true;
      warnings.push(`Auto-fixed "${label}": removed target "${target}" not found in text.`);
      return false;
    });
  }

  // --- RANDOM_WHEEL: use options if items empty ---
  if (block.taskType === 'random_wheel' && block.items.length === 0 && block.options.length > 0) {
    block.items = block.options;
    block.options = [];
    warnings.push(`Auto-fixed "${label}": moved options to items for random_wheel.`);
  }

  // --- CARDS: ensure cards exist from pairs/items ---
  if (block.taskType === 'cards') {
    if (block.cards.length === 0 && block.pairs.length > 0) {
      block.cards = block.pairs.map((p) => ({ front: p.left, back: p.right }));
      warnings.push(`Auto-fixed "${label}": derived cards from pairs.`);
    }
  }

  // --- MATCH/DRAG_DROP: deduplicate left values ---
  if (['drag_drop', 'match', 'emoji_symbol_match'].includes(block.taskType) && block.pairs.length > 0) {
    const seen = new Set();
    const deduped = [];
    for (const pair of block.pairs) {
      const key = pair.left.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(pair);
      }
    }
    if (deduped.length < block.pairs.length) {
      warnings.push(`Auto-fixed "${label}": removed ${block.pairs.length - deduped.length} duplicate pair(s).`);
      block.pairs = deduped;
    }
  }
}

function buildBlock(definition, rawData, index, warnings) {
  const baseLabel = rawData.title || rawData.question || rawData.instruction || `${definition.taskType || definition.type} ${index + 1}`;
  const ref = slugify(rawData.id || rawData.ref || rawData.key || baseLabel) || `${definition.taskType || definition.type}-${index + 1}`;
  const block = {
    id: crypto.randomUUID(),
    ref,
    type: definition.type,
    enabled: rawData.enabled === undefined ? !toBoolean(rawData.disabled, false) : toBoolean(rawData.enabled, true),
    title: rawData.title || '',
    instruction: rawData.instruction || '',
    hint: rawData.hint || '',
    examples: toList(rawData.examples),
    notes: toList(rawData.notes),
    linkTo: rawData.linkto || rawData.link || '',
    group: rawData.group || '',
  };

  if (definition.type === 'slide' || definition.type === 'rich') {
    block.content = sanitizeContent(rawData.content || rawData.text || '');
  }

  if (['two_column_text_task', 'image_task', 'video_task', 'carousel', 'group_task_slide', 'step_by_step', 'focus', 'flashcard_slide', 'scenario', 'map_diagram'].includes(definition.type)) {
    block.layout = definition.type;
    block.content = sanitizeContent(rawData.content || rawData.text || '');
    block.left = sanitizeContent(rawData.left || '');
    block.right = sanitizeContent(rawData.right || '');
    block.dialogue = rawData.dialogue || '';
    block.steps = toList(rawData.steps || rawData.items);
    block.keywords = toList(rawData.keywords);
    block.taskRefs = parseRefs(toList(rawData.taskrefs || []));
    block.media = sanitizeUrl(rawData.media || rawData.image || rawData.video || rawData.audio || rawData.src || rawData.url || '');
    block.image = sanitizeUrl(rawData.image || '');
    block.video = sanitizeUrl(rawData.video || '');
    block.audio = sanitizeUrl(rawData.audio || '');
    block.cards = parseCards(toList(rawData.cards || rawData.pairs));
    block.revealMode = toBoolean(rawData.revealmode, false);
  }

  if (definition.type === 'structure') {
    block.positive = rawData.positive || '';
    block.negative = rawData.negative || '';
    block.question = rawData.question || '';
    if (!block.positive && !block.negative && !block.question) {
      warnings.push(`Structure slide "${baseLabel}" is missing one or more sentence patterns.`);
    }
  }

  if (definition.type === 'table') {
    block.columns = toList(rawData.columns);
    block.rows = rawData.rows ? parseRows(rawData.rows) : [];
  }

  if (definition.type === 'group' || definition.type === 'split_group') {
    block.layout = definition.type === 'split_group' ? 'split' : (rawData.layout || 'stack');
    block.itemRefs = parseRefs(toList(rawData.items || rawData.contains || rawData.blocks));
    block.children = [];
  }

  if (definition.type === 'link') {
    block.from = slugify(rawData.from || rawData.slide || rawData.source || '');
    block.to = slugify(rawData.to || rawData.task || rawData.target || '');
  }

  if (definition.type === 'task') {
    block.taskType = definition.taskType;
    block.question = rawData.question || rawData.statement || rawData.prompt || rawData.instruction || '';
    block.text = sanitizeContent(rawData.text || rawData.content || rawData.sentence || '');
    block.placeholder = rawData.placeholder || '';
    block.answer = rawData.answer || rawData.correct || '';
    block.correct = rawData.correct || rawData.answer || '';
    block.multiple = toBoolean(rawData.multiple, definition.taskType === 'multi_select');
    block.options = toList(rawData.options);
    block.items = toList(rawData.items);
    block.blanks = toList(rawData.blanks);
    block.targets = toList(rawData.targets || rawData.correct);
    block.categories = toList(rawData.categories);
    block.pairs = parsePairs(toList(rawData.pairs));
    block.cards = parseCards(toList(rawData.cards || rawData.pairs));
    block.explanation = rawData.explanation || '';
    block.media = sanitizeUrl(rawData.media || rawData.image || rawData.video || rawData.audio || rawData.src || rawData.url || '');
    block.image = sanitizeUrl(rawData.image || '');
    block.video = sanitizeUrl(rawData.video || '');
    block.audio = sanitizeUrl(rawData.audio || '');
    block.rows = rawData.rows ? parseRows(rawData.rows) : [];
    block.columns = toList(rawData.columns);
    block.steps = toList(rawData.steps || rawData.items);
    block.keywords = toList(rawData.keywords);
    block.min = toNumber(rawData.min, 1);
    block.max = toNumber(rawData.max, 5);
    block.points = toNumber(rawData.points, 1);
    block.timeLimit = toNumber(rawData.timelimit, null);
    block.repeat = toBoolean(rawData.repeat, false);
    block.shuffle = rawData.shuffle === undefined ? true : toBoolean(rawData.shuffle, true);
    block.hiddenRows = toList(rawData.hiddenrows);
    block.hiddenCells = toList(rawData.hiddencells);
    block.revealMode = rawData.revealmode || 'manual';
    block.randomHiddenCount = toNumber(rawData.randomhiddencount, null);
    block.flexibleOrder = toBoolean(rawData.flexibleorder, false);

    // --- Categorize: extract pairs from items with "item => category" or "item -> category" syntax ---
    if (['categorize', 'categorize_grammar', 'matching_pairs_categories'].includes(block.taskType)) {
      const arrowItems = block.items.filter((item) => item.includes('=>') || item.includes('->'));
      if (arrowItems.length > 0 && block.pairs.length === 0) {
        block.pairs = arrowItems.map((item) => {
          const sep = item.includes('=>') ? '=>' : '->';
          const [left, right] = item.split(sep).map((s) => s.trim());
          return { left: left || '', right: right || '' };
        }).filter((p) => p.left);
      }
      // Always clean items to remove `=> category` or `-> category` suffix
      if (arrowItems.length > 0) {
        block.items = block.items.map((item) => {
          if (item.includes('=>')) return item.split('=>')[0].trim();
          if (item.includes('->')) return item.split('->')[0].trim();
          return item;
        }).filter(Boolean);
      }
      // Derive categories from pairs if empty, or override with pair-right values
      // to avoid mismatch between Categories field and => targets
      if (block.pairs.length > 0) {
        const pairCategories = [...new Set(block.pairs.map((p) => p.right))].filter(Boolean);
        if (block.categories.length === 0 || pairCategories.some((pc) => !block.categories.some((c) => c.toLowerCase() === pc.toLowerCase()))) {
          block.categories = pairCategories;
        }
      }
    }

    // --- Drag-to-blank / type-in-blank: deduplicate blanks into unique pool with index tracking ---
    if (['drag_to_blank', 'type_in_blank'].includes(block.taskType)) {
      // If text has blanks but blanks array is empty, try to extract from answer
      if (block.blanks.length === 0 && block.text && block.text.search(BLANK_MARKER_RE) !== -1) {
        if (Array.isArray(block.answer)) {
          block.blanks = block.answer;
        } else if (typeof block.answer === 'string' && block.answer.includes('|')) {
          block.blanks = block.answer.split('|').map((s) => s.trim()).filter(Boolean);
        }
      }
    }

    if (block.taskType === 'true_false' && block.options.length === 0) {
      block.options = ['True', 'False'];
    }
    if (block.taskType === 'yes_no' && block.options.length === 0) {
      block.options = ['Yes', 'No'];
    }
    // For choice tasks with answer but no options, derive options from answer/correct + generate distractors
    if (['multiple_choice', 'multi_select', 'either_or', 'opinion_survey'].includes(block.taskType) && block.options.length === 0) {
      const answerValue = block.correct || block.answer || '';
      if (answerValue) {
        const answers = Array.isArray(answerValue)
          ? answerValue
          : answerValue.toString().split(/[|,]/).map((s) => s.trim()).filter(Boolean);
        block.options = answers;
      }
    }
    if (['drag_drop', 'match'].includes(block.taskType) && block.pairs.length === 0 && block.cards.length === 0) {
      warnings.push(`Task "${baseLabel}" expects pairs.`);
    }
    if (['multiple_choice', 'true_false'].includes(block.taskType) && block.options.length === 0) {
      warnings.push(`Task "${baseLabel}" has no options.`);
    }

    // --- Auto-repair: fix common AI generation mistakes ---
    autoRepairTask(block, warnings);
  }

  // --- Schema-based validation (forgiving layer: auto-fix, then strict layer: warn) ---
  const schemaIssues = validateBlockSchema(block);
  const fixable = schemaIssues.filter((i) => i.fix);
  if (fixable.length > 0) {
    const { block: repaired, applied } = applySchemaFixes(block, fixable);
    Object.assign(block, repaired);
    applied.forEach((msg) => warnings.push(`Schema auto-fix: ${msg}`));
  }
  // Report remaining unfixed errors as warnings
  const remaining = validateBlockSchema(block);
  remaining.forEach((issue) => {
    if (issue.severity === 'error') {
      warnings.push(issue.message);
    }
  });

  validateBlock(block, warnings);
  return block;
}

function attachLinks(blocks, linkBlocks) {
  const index = new Map();
  blocks.forEach((block) => {
    index.set(block.ref, block);
    if (block.title) index.set(slugify(block.title), block);
  });
  linkBlocks.forEach((link) => {
    const from = index.get(link.from);
    const to = index.get(link.to);
    if (from && to) {
      from.linkTo = to.ref;
    }
  });
}

function normalizeGroups(blocks) {
  const explicitGroups = blocks.filter((block) => block.type === 'group' || block.type === 'split_group');
  const nonGroups = blocks.filter((block) => block.type !== 'group' && block.type !== 'split_group');
  const map = new Map(blocks.map((block) => [block.ref, block]));
  const consumed = new Set();

  explicitGroups.forEach((group) => {
    group.children = group.itemRefs
      .map((ref) => map.get(slugify(ref)) || map.get(ref))
      .filter((child) => child && child.id !== group.id);
    group.children.forEach((child) => consumed.add(child.id));
  });

  const syntheticGroups = [];
  const groupedByName = new Map();
  nonGroups.forEach((block) => {
    if (block.group) {
      const key = slugify(block.group);
      if (!groupedByName.has(key)) groupedByName.set(key, []);
      groupedByName.get(key).push(block);
    }
  });

  groupedByName.forEach((children, key) => {
    if (children.length < 2) return;
    children.forEach((child) => consumed.add(child.id));
    syntheticGroups.push({
      id: crypto.randomUUID(),
      ref: key,
      type: 'group',
      title: children[0].group,
      instruction: '',
      enabled: true,
      children,
      layout: 'stack',
      itemRefs: children.map((child) => child.ref),
    });
  });

  const normalized = [];
  blocks.forEach((block) => {
    if (block.type === 'link') return;
    if (block.type === 'group' || block.type === 'split_group') {
      if (consumed.has(block.id)) return;
      normalized.push(block);
      return;
    }
    if (!consumed.has(block.id)) {
      normalized.push(block);
      return;
    }
    const synthetic = syntheticGroups.find((group) => group.children.some((child) => child.id === block.id));
    if (synthetic && !normalized.some((entry) => entry.id === synthetic.id)) {
      normalized.push(synthetic);
    }
  });
  return normalized;
}

/**
 * Restore stable block IDs from a previous parse so that round-tripping through
 * generateDSL→parseLesson preserves identity (selection, focus, etc.).
 */
function restoreBlockIds(newBlocks, existingBlocks) {
  if (!existingBlocks || existingBlocks.length === 0) return;

  // Build lookup maps from existing blocks
  const byRef = new Map();
  const byTypeIndex = new Map();
  const flatExisting = [];

  function indexExisting(blocks) {
    for (const block of blocks) {
      flatExisting.push(block);
      if (block.ref) byRef.set(block.ref, block);
      const key = `${block.type}:${block.taskType || ''}`;
      if (!byTypeIndex.has(key)) byTypeIndex.set(key, []);
      byTypeIndex.get(key).push(block);
      if (block.children?.length) indexExisting(block.children);
    }
  }
  indexExisting(existingBlocks);

  const usedIds = new Set();

  function restore(blocks) {
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      // Match by ref first (most stable identifier)
      let match = block.ref ? byRef.get(block.ref) : null;
      // Fallback: match by type+taskType at same index
      if (!match || usedIds.has(match.id)) {
        const key = `${block.type}:${block.taskType || ''}`;
        const candidates = byTypeIndex.get(key) || [];
        match = candidates.find((c) => !usedIds.has(c.id));
      }
      if (match && !usedIds.has(match.id)) {
        block.id = match.id;
        usedIds.add(match.id);
      }
      // Recurse into group children
      if (block.children?.length) {
        const existingChildren = match?.children || [];
        restoreBlockIds(block.children, existingChildren);
      }
    }
  }
  restore(newBlocks);
}

export function parseLesson(dsl, existingBlocks) {
  if (!dsl || typeof dsl !== 'string') {
    return { title: 'Untitled Lesson', settings: { showHints: true, showExplanations: true }, lesson: { title: 'Untitled Lesson', slides: [], tasks: [] }, blocks: [], warnings: [] };
  }

  if (dsl.length > MAX_DSL_SIZE) {
    return { title: 'Untitled Lesson', settings: { showHints: true, showExplanations: true }, lesson: { title: 'Untitled Lesson', slides: [], tasks: [] }, blocks: [], warnings: [`DSL input exceeds maximum size of ${Math.round(MAX_DSL_SIZE / 1024)}KB.`] };
  }

  if (!existingBlocks) {
    const cached = getCachedParse(dsl);
    if (cached) return cached;
  }

  const cleaned = preprocessDsl(dsl);
  const warnings = [];
  const lines = cleaned.split('\n');
  const sections = [];
  let current = null;
  let bucket = [];
  let title = 'Untitled Lesson';
  let settings = { showHints: true, showExplanations: true };

  const flush = () => {
    if (!current) return;
    const rawData = parseBlockLines(bucket);
    if (current.type === 'lesson') {
      title = rawData.title || title;
      settings = {
        showHints: rawData.showhints === undefined ? true : toBoolean(rawData.showhints, true),
        showExplanations: rawData.showexplanations === undefined ? true : toBoolean(rawData.showexplanations, true),
        allowSessionSave: rawData.allowsessionsave === undefined ? true : toBoolean(rawData.allowsessionsave, true),
        grammarTopic: rawData.grammartopic || '',
        lessonTopic: rawData.lessontopic || rawData.topic || '',
        focus: rawData.focus ? rawData.focus.split(',').map(s => s.trim()).filter(Boolean) : [],
        difficulty: rawData.difficulty ? rawData.difficulty.split(',').map(s => s.trim()).filter(Boolean) : [],
        fontFamily: rawData.fontfamily || '',
        fontSize: rawData.fontsize || '',
        lineHeight: rawData.lineheight || '',
      };
    } else {
      try {
        sections.push(buildBlock(current, rawData, sections.length, warnings));
      } catch (error) {
        warnings.push(`Failed to parse block "${rawData.title || rawData.question || current.type}": ${error.message}`);
      }
    }
    bucket = [];
  };

  lines.forEach((line) => {
    const detected = detectBlock(line);
    if (detected) {
      flush();
      if (detected.fallback) {
        warnings.push(`Unknown block marker "${line.trim()}" — treated as generic ${detected.type}.`);
      }
      current = detected;
      return;
    }
    if (!current && line.trim()) {
      warnings.push('Ignored text found before the first block marker.');
      return;
    }
    bucket.push(line);
  });
  flush();

  const linkBlocks = sections.filter((block) => block.type === 'link');
  const primaryBlocks = sections.filter((block) => block.type !== 'link');
  attachLinks(primaryBlocks, linkBlocks);
  const blocks = normalizeGroups(primaryBlocks);

  // Restore stable IDs from previous parse to prevent selection/focus loss on round-trip
  if (existingBlocks) {
    restoreBlockIds(blocks, existingBlocks);
  }

  const result = {
    title,
    settings,
    lesson: {
      title,
      slides: blocks.filter((block) => block.type !== 'task' && block.type !== 'group' && block.type !== 'split_group'),
      tasks: blocks.flatMap((block) => (block.type === 'group' || block.type === 'split_group') ? block.children : [block]).filter((block) => block.type === 'task'),
    },
    blocks,
    warnings,
  };

  if (!existingBlocks) setCachedParse(dsl, result);

  return result;
}

function pushList(lines, label, items) {
  if (!items?.length) return;
  lines.push(`${label}:`);
  items.forEach((item) => lines.push(Array.isArray(item) ? item.join(' | ') : item));
}

export function generateDSL(lesson) {
  const lines = ['#LESSON', `Title: ${lesson.title || 'Untitled Lesson'}`, ''];
  if (lesson.settings?.lessonTopic) lines.splice(2, 0, `LessonTopic: ${lesson.settings.lessonTopic}`);
  if (lesson.settings?.grammarTopic) lines.splice(2 + (lesson.settings?.lessonTopic ? 1 : 0), 0, `GrammarTopic: ${lesson.settings.grammarTopic}`);
  if (lesson.settings?.focus?.length) lines.push(`Focus: ${[].concat(lesson.settings.focus).join(', ')}`);
  if (lesson.settings?.difficulty?.length) lines.push(`Difficulty: ${[].concat(lesson.settings.difficulty).join(', ')}`);
  if (lesson.settings?.showHints === false) lines.push('ShowHints: false');
  if (lesson.settings?.showExplanations === false) lines.push('ShowExplanations: false');
  if (lesson.settings?.allowSessionSave === false) lines.push('AllowSessionSave: false');
  if (lesson.settings?.fontFamily) lines.push(`FontFamily: ${lesson.settings.fontFamily}`);
  if (lesson.settings?.fontSize) lines.push(`FontSize: ${lesson.settings.fontSize}`);
  if (lesson.settings?.lineHeight) lines.push(`LineHeight: ${lesson.settings.lineHeight}`);
  if (lines[lines.length - 1] !== '') lines.push('');

  const emitBlock = (block, groupRef = '') => {
    if (block.type === 'slide') lines.push('#SLIDE');
    if (block.type !== 'slide' && block.type !== 'task' && block.type !== 'group' && block.type !== 'split_group') lines.push(`#SLIDE: ${block.type.toUpperCase()}`);
    if (block.type === 'group') lines.push('#GROUP');
    if (block.type === 'split_group') lines.push('#SPLIT_GROUP');
    if (block.type === 'task') lines.push(`#TASK: ${block.taskType.toUpperCase()}`);

    if (block.title) lines.push(`Title: ${block.title}`);
    if (block.ref) lines.push(`Ref: ${block.ref}`);
    if (block.instruction) lines.push(`Instruction: ${block.instruction}`);
    if (block.hint) lines.push(`Hint: ${block.hint}`);
    if (block.linkTo) lines.push(`LinkTo: ${block.linkTo}`);
    if (block.group) lines.push(`Group: ${block.group}`);
    if (groupRef) lines.push(`Group: ${groupRef}`);
    if (block.enabled === false) lines.push('Enabled: false');
    if (block.type === 'task' && block.shuffle === false) lines.push('Shuffle: false');
    if (block.type === 'task' && block.flexibleOrder) lines.push('FlexibleOrder: true');

    if (['slide', 'rich'].includes(block.type) && block.content) {
      lines.push('Content:');
      lines.push(block.content);
    }

    if (block.left) lines.push(`Left: ${block.left}`);
    if (block.right) lines.push(`Right: ${block.right}`);
    if (block.dialogue) lines.push(`Dialogue: ${block.dialogue}`);
    if (block.type !== 'task' && block.revealMode) lines.push('RevealMode: true');
    if (block.media) lines.push(`Media: ${block.media}`);
    if (block.image) lines.push(`Image: ${block.image}`);
    if (block.video) lines.push(`Video: ${block.video}`);
    if (block.audio) lines.push(`Audio: ${block.audio}`);
    pushList(lines, 'Steps', block.steps);
    pushList(lines, 'Keywords', block.keywords);
    pushList(lines, 'TaskRefs', block.taskRefs);

    if (block.type === 'structure') {
      if (block.positive) {
        lines.push('Positive:');
        lines.push(block.positive);
      }
      if (block.negative) {
        lines.push('Negative:');
        lines.push(block.negative);
      }
      if (block.question) {
        lines.push('Question:');
        lines.push(block.question);
      }
      pushList(lines, 'Examples', block.examples);
      pushList(lines, 'Notes', block.notes);
    }

    if (block.type === 'table') {
      pushList(lines, 'Columns', block.columns);
      pushList(lines, 'Rows', (block.rows || []).map((row) => row.join(' | ')));
    }

    if (block.type === 'group' || block.type === 'split_group') {
      pushList(lines, 'Items', (block.children || []).map((child) => child.ref));
    }

    if (block.type !== 'task' && block.cards?.length) {
      pushList(lines, 'Cards', block.cards.map((card) => `${card.front} => ${card.back}`));
    }

    if (block.type === 'task') {
      if (block.question) lines.push(`Question: ${block.question}`);
      if (block.text) {
        lines.push('Text:');
        lines.push(block.text);
      }
      if (block.placeholder) lines.push(`Placeholder: ${block.placeholder}`);
      if (block.multiple) lines.push('Multiple: true');
      pushList(lines, 'Options', block.options);
      if (['categorize', 'categorize_grammar'].includes(block.taskType) && block.pairs?.length) {
        // For categorize tasks with pairs, emit items with => category mapping
        pushList(lines, 'Items', block.pairs.map((p) => `${p.left} => ${p.right}`));
      } else {
        pushList(lines, 'Items', block.items);
      }
      pushList(lines, 'Blanks', block.blanks);
      pushList(lines, 'Targets', block.targets);
      // Skip separate Categories for categorize tasks — derived from `item => category` syntax
      if (!['categorize', 'categorize_grammar'].includes(block.taskType)) {
        pushList(lines, 'Categories', block.categories);
      }
      pushList(lines, 'Examples', block.examples);
      if (block.columns?.length) pushList(lines, 'Columns', block.columns);
      if (block.rows?.length) pushList(lines, 'Rows', (block.rows || []).map((row) => row.join(' | ')));
      if (block.hiddenRows?.length) pushList(lines, 'HiddenRows', block.hiddenRows);
      if (block.hiddenCells?.length) pushList(lines, 'HiddenCells', block.hiddenCells);
      if (['table_reveal', 'table_drag'].includes(block.taskType) && block.revealMode) lines.push(`RevealMode: ${block.revealMode}`);
      if (['table_reveal', 'table_drag'].includes(block.taskType) && block.randomHiddenCount) lines.push(`RandomHiddenCount: ${block.randomHiddenCount}`);
      if (block.explanation) lines.push(`Explanation: ${block.explanation}`);
      // Skip Pairs output for categorize tasks — pairs are embedded in Items with => syntax
      if (!['categorize', 'categorize_grammar'].includes(block.taskType)) {
        pushList(lines, 'Pairs', (block.pairs || []).map((pair) => `${pair.left} => ${pair.right}`));
      }
      if (block.cards?.length) {
        pushList(lines, 'Cards', block.cards.map((card) => `${card.front} => ${card.back}`));
      }
      if (block.answer) {
        if (Array.isArray(block.answer)) {
          lines.push(`Answer: ${block.answer.join(' | ')}`);
        } else {
          lines.push(`Answer: ${block.answer}`);
        }
      }
      if (block.correct && !block.answer) {
        if (Array.isArray(block.correct)) {
          lines.push(`Correct: ${block.correct.join(' | ')}`);
        } else {
          lines.push(`Correct: ${block.correct}`);
        }
      }
      if (typeof block.points === 'number' && Number.isFinite(block.points) && block.points > 0 && block.points !== 1) {
        lines.push(`Points: ${block.points}`);
      }
      if (block.timeLimit) lines.push(`TimeLimit: ${block.timeLimit}`);
      if (block.repeat) lines.push('Repeat: true');
      if (typeof block.min === 'number') lines.push(`Min: ${block.min}`);
      if (typeof block.max === 'number') lines.push(`Max: ${block.max}`);
    }

    lines.push('');
    if ((block.type === 'group' || block.type === 'split_group') && block.children?.length) {
      block.children.forEach((child) => emitBlock(child, block.ref));
    }
  };

  (lesson.blocks || []).forEach((block) => emitBlock(block));

  return lines.join('\n');
}
