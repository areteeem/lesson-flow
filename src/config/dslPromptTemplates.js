/**
 * DSL Prompt Templates — injectable spec snippets for AI generation prompts.
 * Ensures AI models produce valid, parseable DSL by providing the exact format rules.
 */

import { TASK_REGISTRY } from './taskRegistry';
import { SLIDE_REGISTRY } from './slideRegistry';

// ────────────────────────────────────────────────
//  Core DSL spec (always included)
// ────────────────────────────────────────────────
export const DSL_CORE_SPEC = `
## Lesson DSL Format

### Block markers
- #LESSON — one per file, first block
- #SLIDE — default text slide
- #SLIDE: TYPE — typed slide (e.g. #SLIDE: TABLE, #SLIDE: STRUCTURE)
- #TASK: TYPE — task block (e.g. #TASK: MULTIPLE_CHOICE)
- #GROUP — groups child blocks together
- #SPLIT_GROUP — two tasks displayed side by side
- #LINK — connects blocks (From/To fields)

### Field syntax
Each field is \`FieldName: value\` on its own line.
List fields (Options, Items, Blanks, Targets, Categories, Pairs, etc.) put each item on a new line after the key:
\`\`\`
Options:
Option A
Option B
Option C
\`\`\`

### Pairs format
Use \`=>\` or \`->\` to separate left/right:
\`\`\`
Pairs:
apple => a round fruit
carrot -> an orange vegetable
\`\`\`

### Blank markers in text
Use any of these in the Text field: \`{}\`, \`___\`, \`[blank]\`, or indexed \`[1]\`, \`[2]\`, \`[3]\`.
Indexed blanks are preferred — they make the mapping to answers explicit.

### Answer format
- Single answer: \`Answer: correct value\`
- Multiple answers (pipe-separated): \`Answer: answer1 | answer2 | answer3\`
- For indexed blanks: answers are in order: \`Answer: first | second | third\`

### Critical rules
1. **Answer MUST be one of the Options** for choice tasks (multiple_choice, multi_select, true_false, yes_no, either_or)
2. **Blank count in Text MUST match** the number of Blanks or pipe-separated Answers
3. **Categories in Pairs** must match the Categories list exactly
4. **Targets in reading_highlight** must exist verbatim in the Text
5. Every task needs at least a Question or Instruction
`.trim();

// ────────────────────────────────────────────────
//  Per-type DSL templates
// ────────────────────────────────────────────────
const TASK_TEMPLATES = {
  multiple_choice: `
#TASK: MULTIPLE_CHOICE
Question: <clear question>
Options:
<option 1>
<option 2>
<option 3>
<option 4>
Answer: <must be exactly one of the options above>
Explanation: <why the answer is correct>
Hint: <optional clue>`,

  multi_select: `
#TASK: MULTI_SELECT
Question: <question where multiple answers apply>
Options:
<option 1>
<option 2>
<option 3>
<option 4>
Answer: <correct1> | <correct2>
Explanation: <why these are correct>`,

  true_false: `
#TASK: TRUE_FALSE
Question: <statement to evaluate>
Answer: True
Explanation: <why true or false>`,

  yes_no: `
#TASK: YES_NO
Question: <yes or no question>
Answer: Yes`,

  either_or: `
#TASK: EITHER_OR
Question: <force a choice>
Options:
<choice A>
<choice B>
Answer: <must be one of the two options>`,

  fill_typing: `
#TASK: FILL_TYPING
Question: <instruction>
Text: She [1] to school at 8 a.m.
Answer: goes`,

  drag_to_blank: `
#TASK: DRAG_TO_BLANK
Question: <instruction>
Text: He [1] to work by [2] every [3].
Blanks:
goes
bus
morning
Options:
car
train`,

  type_in_blank: `
#TASK: TYPE_IN_BLANK
Question: <instruction>
Text: The cat [1] on the [2].
Blanks:
sat
mat`,

  match: `
#TASK: MATCH
Question: <match instruction>
Pairs:
term A => definition A
term B => definition B
term C => definition C`,

  drag_drop: `
#TASK: DRAG_DROP
Question: <drag instruction>
Pairs:
prompt 1 => response 1
prompt 2 => response 2`,

  order: `
#TASK: ORDER
Question: <ordering instruction>
Items:
First step
Second step
Third step
Fourth step`,

  categorize: `
#TASK: CATEGORIZE
Question: <sorting instruction>
Categories:
Category A
Category B
Pairs:
item 1 => Category A
item 2 => Category B
item 3 => Category A`,

  reading_highlight: `
#TASK: READING_HIGHLIGHT
Question: <highlight instruction>
Text:
Tom lives in Kyiv and studies English after school.
Targets:
lives
studies`,

  error_correction: `
#TASK: ERROR_CORRECTION
Question: Correct the error.
Text: She walk to school every day.
Answer: She walks to school every day.`,

  dialogue_completion: `
#TASK: DIALOGUE_COMPLETION
Question: Complete the dialogue.
Text:
A: What time ___ you start?
B: I ___ at nine.
Answer: do | start`,

  dialogue_fill: `
#TASK: DIALOGUE_FILL
Question: Fill in the missing words.
Text:
A: What time [1] you start?
B: I [2] at nine.
A: [3] you walk to school?
B: Yes, I [4].
Answer: do | start | Do | do
Hint: Use the correct form of "do" and the base verb.`,

  table_drag: `
#TASK: TABLE_DRAG
Question: Drag the correct values into the table.
Columns:
Pronoun
Verb
Rows:
I / You / We / They | work
He / She / It | works
HiddenCells:
0:1
1:1
Options:
work
works
working`,

  cards: `
#TASK: CARDS
Cards:
front text => back text
term => definition`,

  table_reveal: `
#TASK: TABLE_REVEAL
Question: Reveal the hidden cells.
Columns:
Subject
Verb
Rows:
I | work
He | works
HiddenCells:
0:1
1:1
RevealMode: manual`,

  sentence_builder: `
#TASK: SENTENCE_BUILDER
Question: Build a correct sentence.
Items:
my brother
plays
football
after school`,

  short_answer: `
#TASK: SHORT_ANSWER
Question: <open-ended question>
Answer: <sample answer>`,

  scale: `
#TASK: SCALE
Question: Rate your confidence.
Min: 1
Max: 5`,
};

// ────────────────────────────────────────────────
//  Slide templates
// ────────────────────────────────────────────────
const SLIDE_TEMPLATES = {
  slide: `
#SLIDE
Title: <slide title>
Content:
# Heading
Use **bold**, *italic*, and lists.`,

  structure: `
#SLIDE: STRUCTURE
Title: Sentence structure
Positive: Subject + base verb
Negative: Subject + do/does not + base verb
Question: Do/Does + subject + base verb?
Examples:
He works every day.
Does she study English?`,

  table: `
#SLIDE: TABLE
Title: Comparison table
Columns:
Column A
Column B
Rows:
Row 1 A | Row 1 B
Row 2 A | Row 2 B`,
};

// ────────────────────────────────────────────────
//  Public API
// ────────────────────────────────────────────────

/** Get DSL template for a specific task type. */
export function getTaskTemplate(taskType) {
  return TASK_TEMPLATES[taskType] || '';
}

/** Get DSL template for a specific slide type. */
export function getSlideTemplate(slideType) {
  return SLIDE_TEMPLATES[slideType] || '';
}

/** Get all available task type names. */
export function getAvailableTaskTypes() {
  return TASK_REGISTRY.map((t) => ({ type: t.type, label: t.label, category: t.category, description: t.description }));
}

/** Get all available slide type names. */
export function getAvailableSlideTypes() {
  return SLIDE_REGISTRY.map((s) => ({ type: s.type, label: s.label }));
}

/**
 * Build a complete AI generation prompt with DSL spec and task templates.
 * @param {Object} config - { taskTypes: string[], slideTypes?: string[], topic?, grammar?, level? }
 * @returns {string} Complete prompt with DSL format rules
 */
export function buildGenerationPrompt(config = {}) {
  const parts = [DSL_CORE_SPEC];

  parts.push('\n## Available task types');
  parts.push(TASK_REGISTRY.map((t) => `- ${t.type.toUpperCase()}: ${t.description}`).join('\n'));

  if (config.taskTypes?.length) {
    parts.push('\n## Requested task templates');
    for (const type of config.taskTypes) {
      const tmpl = TASK_TEMPLATES[type];
      if (tmpl) parts.push(`\n### ${type.toUpperCase()}\n\`\`\`${tmpl}\n\`\`\``);
    }
  }

  if (config.slideTypes?.length) {
    parts.push('\n## Requested slide templates');
    for (const type of config.slideTypes) {
      const tmpl = SLIDE_TEMPLATES[type];
      if (tmpl) parts.push(`\n### ${type.toUpperCase()}\n\`\`\`${tmpl}\n\`\`\``);
    }
  }

  if (config.topic) parts.push(`\n## Lesson topic: ${config.topic}`);
  if (config.grammar) parts.push(`## Grammar focus: ${config.grammar}`);
  if (config.level) parts.push(`## Target level: ${config.level}`);

  parts.push('\n## Output rules');
  parts.push('- Start with #LESSON block');
  parts.push('- Use ONLY the block markers and field names shown above');
  parts.push('- Answers MUST exist in Options for choice tasks');
  parts.push('- Use [1], [2], [3] for indexed blanks');
  parts.push('- Return ONLY the DSL, no explanations or markdown fences');

  return parts.join('\n');
}
