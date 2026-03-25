/**
 * DSL Schema System — defines required/optional fields, defaults, and validation
 * rules for every block type (slides, tasks, groups).
 *
 * Used by:
 *  - Strict parser (full validation)
 *  - Forgiving parser (auto-fix missing/invalid fields)
 *  - Builder UX (field rendering, smart defaults)
 *  - AI prompt builder (deterministic output constraints)
 */

// ────────────────────────────────────────────────
//  Field type helpers
// ────────────────────────────────────────────────
const S = (defaultValue = '') => ({ type: 'string', default: defaultValue });
const B = (defaultValue = false) => ({ type: 'boolean', default: defaultValue });
const N = (defaultValue = null) => ({ type: 'number', default: defaultValue });
const L = (defaultValue = []) => ({ type: 'list', default: defaultValue });
const P = (defaultValue = []) => ({ type: 'pairs', default: defaultValue });
const R = (defaultValue = []) => ({ type: 'rows', default: defaultValue });
const C = (defaultValue = []) => ({ type: 'cards', default: defaultValue });

// ────────────────────────────────────────────────
//  Base schemas shared by all block families
// ────────────────────────────────────────────────
const BASE_BLOCK = {
  title: { ...S(), required: false },
  ref: { ...S(), required: false },
  instruction: { ...S(), required: false },
  hint: { ...S(), required: false },
  enabled: { ...B(true), required: false },
  linkTo: { ...S(), required: false },
};

// ────────────────────────────────────────────────
//  Slide schemas
// ────────────────────────────────────────────────
const SLIDE_BASE = {
  ...BASE_BLOCK,
  content: { ...S(), required: false },
};

export const SLIDE_SCHEMAS = {
  slide: { ...SLIDE_BASE },
  rich: { ...SLIDE_BASE, examples: { ...L(), required: false }, notes: { ...L(), required: false } },
  structure: {
    ...SLIDE_BASE,
    positive: { ...S(), required: true },
    negative: { ...S(), required: true },
    question: { ...S(), required: false },
    examples: { ...L(), required: false },
    notes: { ...L(), required: false },
  },
  table: {
    ...SLIDE_BASE,
    columns: { ...L(), required: true },
    rows: { ...R(), required: true },
  },
  two_column_text_task: { ...SLIDE_BASE, left: { ...S(), required: false }, right: { ...S(), required: false } },
  image_task: { ...SLIDE_BASE, right: { ...S(), required: false }, media: { ...S(), required: false } },
  video_task: { ...SLIDE_BASE, right: { ...S(), required: false }, media: { ...S(), required: false } },
  carousel: { ...SLIDE_BASE, steps: { ...L(), required: true } },
  group_task_slide: { ...SLIDE_BASE, taskRefs: { ...L(), required: false } },
  step_by_step: { ...SLIDE_BASE, steps: { ...L(), required: true } },
  focus: { ...SLIDE_BASE, keywords: { ...L(), required: true } },
  flashcard_slide: { ...SLIDE_BASE, cards: { ...C(), required: true } },
  scenario: { ...SLIDE_BASE, dialogue: { ...S(), required: true }, revealMode: { ...B(), required: false } },
  map_diagram: { ...SLIDE_BASE, media: { ...S(), required: false } },
};

// ────────────────────────────────────────────────
//  Group schema
// ────────────────────────────────────────────────
export const GROUP_SCHEMA = {
  ...BASE_BLOCK,
  layout: { ...S('stack'), required: false },
  children: { ...L(), required: false },
};

// ────────────────────────────────────────────────
//  Task base fields (shared by every task)
// ────────────────────────────────────────────────
const TASK_BASE = {
  ...BASE_BLOCK,
  question: { ...S(), required: false },
  text: { ...S(), required: false },
  placeholder: { ...S(), required: false },
  answer: { ...S(), required: false },
  correct: { ...S(), required: false },
  options: { ...L(), required: false },
  items: { ...L(), required: false },
  blanks: { ...L(), required: false },
  targets: { ...L(), required: false },
  categories: { ...L(), required: false },
  pairs: { ...P(), required: false },
  cards: { ...C(), required: false },
  explanation: { ...S(), required: false },
  media: { ...S(), required: false },
  rows: { ...R(), required: false },
  columns: { ...L(), required: false },
  steps: { ...L(), required: false },
  keywords: { ...L(), required: false },
  shuffle: { ...B(true), required: false },
  multiple: { ...B(false), required: false },
  repeat: { ...B(false), required: false },
  min: { ...N(1), required: false },
  max: { ...N(5), required: false },
  timeLimit: { ...N(null), required: false },
  hiddenRows: { ...L(), required: false },
  hiddenCells: { ...L(), required: false },
  revealMode: { ...S('manual'), required: false },
  randomHiddenCount: { ...N(null), required: false },
};

// ────────────────────────────────────────────────
//  Per-task-type schemas (required/optional overrides)
// ────────────────────────────────────────────────
export const TASK_SCHEMAS = {
  multiple_choice: {
    ...TASK_BASE,
    question: { ...S(), required: true },
    options: { ...L(), required: true, minLength: 2 },
    answer: { ...S(), required: true, mustBeInOptions: true },
  },
  multi_select: {
    ...TASK_BASE,
    question: { ...S(), required: true },
    options: { ...L(), required: true, minLength: 2 },
    answer: { ...S(), required: true, mustBeInOptions: true },
    multiple: { ...B(true), required: false },
  },
  true_false: {
    ...TASK_BASE,
    question: { ...S(), required: true },
    options: { ...L(['True', 'False']), required: false },
    answer: { ...S(), required: true, mustBeInOptions: true },
  },
  yes_no: {
    ...TASK_BASE,
    question: { ...S(), required: true },
    options: { ...L(['Yes', 'No']), required: false },
    answer: { ...S(), required: true, mustBeInOptions: true },
  },
  either_or: {
    ...TASK_BASE,
    question: { ...S(), required: true },
    options: { ...L(), required: true, minLength: 2, maxLength: 2 },
    answer: { ...S(), required: true, mustBeInOptions: true },
  },
  fill_typing: {
    ...TASK_BASE,
    text: { ...S(), required: true, mustContainBlanks: true },
    answer: { ...S(), required: true },
    flexibleOrder: { ...B(), required: false },
  },
  short_answer: {
    ...TASK_BASE,
    question: { ...S(), required: true },
    answer: { ...S(), required: false },
  },
  long_answer: {
    ...TASK_BASE,
    question: { ...S(), required: true },
  },
  drag_to_blank: {
    ...TASK_BASE,
    text: { ...S(), required: true, mustContainBlanks: true },
    blanks: { ...L(), required: true, mustMatchBlankCount: true },
    options: { ...L(), required: false, minBankSize: true },
  },
  type_in_blank: {
    ...TASK_BASE,
    text: { ...S(), required: true, mustContainBlanks: true },
    blanks: { ...L(), required: true, mustMatchBlankCount: true },
  },
  match: {
    ...TASK_BASE,
    question: { ...S(), required: false },
    pairs: { ...P(), required: true, minLength: 2 },
  },
  cards: {
    ...TASK_BASE,
    cards: { ...C(), required: true, minLength: 1 },
  },
  drag_drop: {
    ...TASK_BASE,
    question: { ...S(), required: false },
    pairs: { ...P(), required: true, minLength: 2 },
  },
  drag_match: {
    ...TASK_BASE,
    question: { ...S(), required: false },
    pairs: { ...P(), required: true, minLength: 2 },
  },
  order: {
    ...TASK_BASE,
    question: { ...S(), required: false },
    items: { ...L(), required: true, minLength: 2 },
  },
  timeline_order: {
    ...TASK_BASE,
    question: { ...S(), required: false },
    items: { ...L(), required: true, minLength: 2 },
  },
  sentence_builder: {
    ...TASK_BASE,
    question: { ...S(), required: false },
    items: { ...L(), required: true, minLength: 2 },
  },
  story_reconstruction: {
    ...TASK_BASE,
    question: { ...S(), required: false },
    items: { ...L(), required: true, minLength: 2 },
  },
  categorize: {
    ...TASK_BASE,
    question: { ...S(), required: false },
    categories: { ...L(), required: true, minLength: 2 },
    pairs: { ...P(), required: true, minLength: 1 },
  },
  categorize_grammar: {
    ...TASK_BASE,
    question: { ...S(), required: false },
    categories: { ...L(), required: true, minLength: 2 },
    pairs: { ...P(), required: true, minLength: 1 },
  },
  reading_highlight: {
    ...TASK_BASE,
    text: { ...S(), required: true },
    targets: { ...L(), required: true, minLength: 1 },
  },
  highlight_mistake: {
    ...TASK_BASE,
    text: { ...S(), required: true },
    answer: { ...S(), required: true },
  },
  select_and_correct: {
    ...TASK_BASE,
    text: { ...S(), required: true },
    answer: { ...S(), required: true },
  },
  highlight_differences: {
    ...TASK_BASE,
    text: { ...S(), required: true },
    targets: { ...L(), required: true, minLength: 1 },
  },
  random_wheel: {
    ...TASK_BASE,
    items: { ...L(), required: true, minLength: 2 },
  },
  audio_transcription: {
    ...TASK_BASE,
    media: { ...S(), required: false },
    answer: { ...S(), required: false },
  },
  video_questions: {
    ...TASK_BASE,
    media: { ...S(), required: false },
  },
  image_labeling: {
    ...TASK_BASE,
    media: { ...S(), required: false },
  },
  hotspot_selection: {
    ...TASK_BASE,
    media: { ...S(), required: false },
  },
  map_geography_label: {
    ...TASK_BASE,
    media: { ...S(), required: false },
  },
  image_compare_spot: {
    ...TASK_BASE,
    media: { ...S(), required: false },
  },
  pronunciation_shadowing: {
    ...TASK_BASE,
    media: { ...S(), required: false },
  },
  dialogue_completion: {
    ...TASK_BASE,
    text: { ...S(), required: true, mustContainBlanks: true },
    answer: { ...S(), required: true },
  },
  error_correction: {
    ...TASK_BASE,
    text: { ...S(), required: true },
    answer: { ...S(), required: true },
  },
  opinion_survey: {
    ...TASK_BASE,
    question: { ...S(), required: true },
    options: { ...L(), required: true, minLength: 2 },
  },
  scale: {
    ...TASK_BASE,
    question: { ...S(), required: true },
    min: { ...N(1), required: false },
    max: { ...N(5), required: false },
  },
  memory_recall: {
    ...TASK_BASE,
    question: { ...S(), required: true },
  },
  flash_response: {
    ...TASK_BASE,
    question: { ...S(), required: true },
  },
  compare_contrast_table: {
    ...TASK_BASE,
    columns: { ...L(), required: true },
    rows: { ...R(), required: true },
  },
  fill_table_matrix: {
    ...TASK_BASE,
    columns: { ...L(), required: false },
    rows: { ...R(), required: true },
  },
  table_reveal: {
    ...TASK_BASE,
    columns: { ...L(), required: false },
    rows: { ...R(), required: true },
    revealMode: { ...S('manual'), required: false },
  },
  puzzle_jigsaw: {
    ...TASK_BASE,
    rows: { ...R(), required: true },
  },
  choose_and_explain: {
    ...TASK_BASE,
    question: { ...S(), required: true },
    options: { ...L(), required: false },
  },
  scenario_decision: {
    ...TASK_BASE,
    question: { ...S(), required: true },
    options: { ...L(), required: false },
  },
  conditional_branch_questions: {
    ...TASK_BASE,
    question: { ...S(), required: true },
    options: { ...L(), required: false },
  },
  justify_order: {
    ...TASK_BASE,
    items: { ...L(), required: true, minLength: 2 },
  },
  keyword_expand: {
    ...TASK_BASE,
    text: { ...S(), required: false },
    keywords: { ...L(), required: false },
  },
  word_family_builder: {
    ...TASK_BASE,
    items: { ...L(), required: true },
  },
  emoji_symbol_match: {
    ...TASK_BASE,
    pairs: { ...P(), required: true, minLength: 2 },
  },
  matching_pairs_categories: {
    ...TASK_BASE,
    categories: { ...L(), required: true },
    pairs: { ...P(), required: true },
  },
  peer_review_checklist: {
    ...TASK_BASE,
    items: { ...L(), required: true },
  },
  table_drag: {
    ...TASK_BASE,
    columns: { ...L(), required: true, minLength: 2 },
    rows: { ...R(), required: true },
    options: { ...L(), required: true, minLength: 1 },
    hiddenCells: { ...L(), required: true, minLength: 1 },
  },
  dialogue_fill: {
    ...TASK_BASE,
    text: { ...S(), required: true, mustContainBlanks: true },
    answer: { ...S(), required: false },
    flexibleOrder: { ...B(), required: false },
  },
  dialogue_reconstruct: {
    ...TASK_BASE,
    text: { ...S(), required: true },
    targets: { ...L(), required: false },
  },
  youtube: {
    ...TASK_BASE,
    media: { ...S(), required: true },
  },
};

// ────────────────────────────────────────────────
//  Schema lookup
// ────────────────────────────────────────────────
export function getTaskSchema(taskType) {
  return TASK_SCHEMAS[taskType] || TASK_BASE;
}

export function getSlideSchema(slideType) {
  return SLIDE_SCHEMAS[slideType] || SLIDE_SCHEMAS.slide;
}

// ────────────────────────────────────────────────
//  Validation engine — returns structured errors
// ────────────────────────────────────────────────
/**
 * Validate a block against its schema.
 * Returns array of { severity: 'error'|'warning', field, message, fix? }
 */
export function validateBlockSchema(block) {
  const issues = [];
  if (!block) return issues;

  let schema;
  if (block.type === 'task') {
    schema = getTaskSchema(block.taskType);
  } else if (block.type === 'group') {
    schema = GROUP_SCHEMA;
  } else {
    schema = getSlideSchema(block.layout || block.type);
  }

  const label = block.title || block.question || block.ref || 'Unknown';

  for (const [field, spec] of Object.entries(schema)) {
    if (!spec || typeof spec !== 'object' || !spec.type) continue;

    const value = block[field];

    // Check required fields
    if (spec.required) {
      const empty = value === undefined || value === null || value === '' ||
        (Array.isArray(value) && value.length === 0);
      if (empty) {
        issues.push({
          severity: 'error',
          field,
          message: `"${label}" is missing required field: ${field}`,
          fix: spec.default !== undefined ? { action: 'set_default', field, value: spec.default } : null,
        });
      }
    }

    // Check list constraints
    if (spec.type === 'list' || spec.type === 'pairs' || spec.type === 'cards') {
      const arr = Array.isArray(value) ? value : [];
      if (spec.minLength && arr.length > 0 && arr.length < spec.minLength) {
        issues.push({
          severity: 'warning',
          field,
          message: `"${label}" ${field} has ${arr.length} item(s), needs at least ${spec.minLength}`,
        });
      }
      if (spec.maxLength && arr.length > spec.maxLength) {
        issues.push({
          severity: 'warning',
          field,
          message: `"${label}" ${field} has ${arr.length} item(s), max is ${spec.maxLength}`,
        });
      }
    }

    // Check answer-in-options constraint
    if (spec.mustBeInOptions && block.type === 'task') {
      const opts = (block.options || []).map((o) => o.toString().trim().toLowerCase());
      if (opts.length > 0 && value) {
        const answers = Array.isArray(value)
          ? value
          : value.toString().split(/[|,]/).map((s) => s.trim()).filter(Boolean);
        for (const ans of answers) {
          if (!opts.includes(ans.toLowerCase())) {
            issues.push({
              severity: 'error',
              field,
              message: `"${label}" answer "${ans}" is not in options`,
              fix: { action: 'add_to_options', value: ans },
            });
          }
        }
      }
    }

    // Check blank count constraint
    if (spec.mustContainBlanks && block.text) {
      const blankCount = (block.text.match(/(\{\}|_{3,}|\[blank\]|\[\d+\])/gi) || []).length;
      if (blankCount === 0) {
        issues.push({
          severity: 'error',
          field: 'text',
          message: `"${label}" text has no blank markers (___, {}, [blank], or [1],[2]…)`,
        });
      }
    }

    // Check blank count matches
    if (spec.mustMatchBlankCount && block.text && Array.isArray(value) && value.length > 0) {
      const blankCount = (block.text.match(/(\{\}|_{3,}|\[blank\]|\[\d+\])/gi) || []).length;
      if (blankCount > 0 && value.length !== blankCount) {
        issues.push({
          severity: 'warning',
          field,
          message: `"${label}" has ${blankCount} blank(s) in text but ${value.length} in ${field}`,
          fix: { action: 'align_blanks' },
        });
      }
    }

    // Check bank size >= blank count for drag_to_blank
    if (spec.minBankSize && block.taskType === 'drag_to_blank' && block.text) {
      const blankCount = (block.text.match(/(\{\}|_{3,}|\[blank\]|\[\d+\])/gi) || []).length;
      const bankSize = (block.options || []).length + (block.blanks || []).length;
      if (blankCount > 0 && bankSize < blankCount) {
        issues.push({
          severity: 'error',
          field: 'options',
          message: `"${label}" word bank (${bankSize}) is smaller than blank count (${blankCount}) — add distractors`,
          fix: { action: 'add_distractors', needed: blankCount - bankSize },
        });
      }
    }
  }

  return issues;
}

// ────────────────────────────────────────────────
//  Auto-fix engine
// ────────────────────────────────────────────────
/**
 * Apply a list of fix actions to a block. Returns { block, applied[] }.
 */
export function applySchemaFixes(block, issues) {
  let fixed = { ...block };
  const applied = [];

  for (const issue of issues) {
    if (!issue.fix) continue;
    const { action, field, value } = issue.fix;

    if (action === 'set_default' && field) {
      if (fixed[field] === undefined || fixed[field] === null || fixed[field] === '' ||
        (Array.isArray(fixed[field]) && fixed[field].length === 0)) {
        fixed = { ...fixed, [field]: value };
        applied.push(`Set ${field} to default.`);
      }
    }

    if (action === 'add_to_options' && value) {
      const opts = [...(fixed.options || [])];
      if (!opts.some((o) => o.toString().trim().toLowerCase() === value.toString().trim().toLowerCase())) {
        opts.push(value);
        fixed = { ...fixed, options: opts };
        applied.push(`Added "${value}" to options.`);
      }
    }

    if (action === 'align_blanks' && fixed.text) {
      const blankCount = (fixed.text.match(/(\{\}|_{3,}|\[blank\]|\[\d+\])/gi) || []).length;
      if (Array.isArray(fixed.blanks) && fixed.blanks.length > blankCount) {
        const extras = fixed.blanks.slice(blankCount);
        fixed = {
          ...fixed,
          blanks: fixed.blanks.slice(0, blankCount),
          options: [...(fixed.options || []), ...extras],
        };
        applied.push(`Trimmed blanks to ${blankCount}, moved extras to options.`);
      }
    }

    if (action === 'add_distractors') {
      // Placeholder — in real usage, AI or template would generate distractors
      applied.push(`Need ${issue.fix.needed} more distractor(s) in word bank.`);
    }
  }

  return { block: fixed, applied };
}

// ────────────────────────────────────────────────
//  Task interaction rules — which tasks use selection vs typing
// ────────────────────────────────────────────────
export const ANSWER_MODE = {
  // These task types should use selection (click/toggle/drag) — NOT typing
  select: new Set([
    'multiple_choice', 'multi_select', 'true_false', 'yes_no', 'either_or',
    'opinion_survey', 'order', 'timeline_order', 'sentence_builder',
    'story_reconstruction', 'categorize', 'categorize_grammar',
    'drag_to_blank', 'type_in_blank', 'match', 'drag_drop', 'drag_match',
    'cards', 'matching_pairs_categories', 'emoji_symbol_match',
    'peer_review_checklist', 'justify_order', 'reading_highlight',
    'highlight_mistake', 'highlight_differences', 'select_and_correct',
    'table_drag', 'dialogue_reconstruct',
  ]),
  // These use typed input for answers
  typed: new Set([
    'fill_typing', 'short_answer', 'long_answer', 'dialogue_completion',
    'error_correction', 'memory_recall', 'flash_response', 'keyword_expand',
    'audio_transcription', 'word_family_builder', 'dialogue_fill',
  ]),
  // These tasks have special interaction models
  special: new Set([
    'scale', 'random_wheel', 'choose_and_explain', 'scenario_decision',
    'conditional_branch_questions', 'video_questions', 'image_labeling',
    'hotspot_selection', 'map_geography_label', 'image_compare_spot',
    'pronunciation_shadowing', 'fill_table_matrix', 'table_reveal',
    'compare_contrast_table', 'puzzle_jigsaw',
  ]),
};

/**
 * Return whether a task type's answer should be selected from options (true)
 * or typed (false). Used by builder to decide field rendering.
 */
export function isSelectionBasedTask(taskType) {
  return ANSWER_MODE.select.has(taskType);
}
