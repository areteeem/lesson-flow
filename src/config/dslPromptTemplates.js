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

### Lesson-level runtime settings (optional)
Use these only in \`#LESSON\` when needed:
- \`VisibilityPolicy: student_answers_only | correctness_only | show_correct_answers | full_feedback\`
- \`ShowCheckButton: true|false\`
- \`AllowRetryHomework: true|false\`
- \`EnableGrading: true|false\`
- \`ShowTotalGrade: true|false\`
- \`ShowPerQuestionGrade: true|false\`
- \`DisableBackNavigation: true|false\`
- \`SessionTimeLimitMinutes: <positive number>\`
- \`LiveAutoAdvanceSeconds: <positive number>\`
- \`LiveAutoAdvancePolicy: timer | all_submitted | submission_threshold\`
- \`LiveAutoAdvanceSubmissionThreshold: <1..100>\` (used with submission_threshold)
- \`LiveQuestionResponseDeadlineSeconds: <positive number>\`
- \`LiveAutoModeTimeLimitMinutes: <positive number>\` (applies when auto-advance is enabled)
- \`ShowLeaderboardEachQuestionLive: true|false\`
- \`AllowRetryLive: true|false\`
- \`ShowCheckButtonLive: true|false\`
- \`LockAfterSubmitLive: true|false\`
- \`HideQuestionContentLive: true|false\`

### Critical rules
1. **Answer MUST be one of the Options** for choice tasks (multiple_choice, multi_select, true_false, yes_no, either_or)
2. **Blank count in Text MUST match** the number of Blanks or pipe-separated Answers
3. **Categories in Pairs** must match the Categories list exactly
4. **Targets in reading_highlight** must exist verbatim in the Text
5. Every task needs at least a Question or Instruction
6. Prefer **simpler stable task types** unless the lesson explicitly needs complex interaction
7. Use 'Points: N' for weighted scoring only when N is a positive number; default is 1
8. For media tasks, use **Media:** as canonical source (Image/Video/Audio are optional aliases)
9. Do not output unsupported field names
10. Output pure DSL only (no markdown fences, numbering, bullets, or commentary)
11. Use plain ASCII punctuation and straight quotes only (avoid smart quotes and decorative symbols)
12. For multiline fields (Content, Text, Dialogue, Left, Right, Explanation), put values on the next line after the field name
13. For list fields (Options, Items, Blanks, Categories, Targets, Pairs, Cards), put one entry per line
14. Keep each block parser-safe: no prose between blocks and no nested block markers inside field values
15. Never merge all options into one line like "A, B, C" or "A | B | C" inside a single option item
16. Remove duplicate options and duplicate answers (case-insensitive)
17. For single-answer tasks, \`Answer:\` must contain exactly one literal value (no commas/semicolons/pipes)
18. For multi_select only, \`Answer:\` may use pipes and each answer must exactly match one option text
19. For highlight_glossary, multi-word targets must be exact contiguous phrases from Text (not split into separate words)
20. For embed slides and web_embed tasks, \`Media:\` must be a valid HTTPS URL. Optional fields: \`Height:\` (px, default 480), \`EmbedCode:\` (raw HTML iframe code), \`AllowFullscreen: true|false\`
`.trim();

export const DSL_PARSER_SAFETY_CHECKLIST = `
Parser safety checklist before final output:
- Starts with #LESSON and valid block markers only
- One field per line, with multiline/list fields expanded below the key
- No markdown fences, bullets, numbering, or commentary around DSL
- Choice-task answers are exact matches from Options
- Choice options are one item per line and deduplicated (no compact "A, B, C" option blobs)
- Blank and answer counts align for gap-fill style tasks
- Targets appear in Text for highlight tasks
- Highlight glossary phrase targets are contiguous text phrases
- Media URLs are plain URLs in Media/Image/Video/Audio fields
`.trim();

export const DSL_QUALITY_GUARDRAILS = `
Quality guardrails:
- Avoid repetitive stems: do not reuse the same question opening more than twice in a row.
- Avoid option-pattern leaks: rotate correct option positions and avoid always placing the answer in the same slot.
- Keep distractors plausible and level-appropriate; avoid obviously wrong joke options.
- Keep lexical progression coherent: easier recognition tasks first, then production tasks.
- Prefer concrete context and short authentic examples over abstract filler text.
- Do not leave placeholders like <question>, <option>, <answer>, TODO, or ... in the final DSL.
- Vary task types: avoid three or more consecutive tasks of the same type.
- Each task must be self-contained: do not reference other tasks or slides by number.
- Explanations should teach, not just restate the answer.
- Hints should nudge without giving away the answer directly.
- For gap-fill tasks, blanks should test meaningful language points, not trivial words like articles.
- Keep slide content under 300 words for readability.
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

  highlight_glossary: `
#TASK: HIGHLIGHT_GLOSSARY
Question: <highlight the useful words>
Text:
Tom lives in Kyiv and studies English after school.
Targets:
Kyiv
studies
after school
Pairs:
Kyiv => Київ
studies => навчається
after school => після школи`,

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

  youtube: `
#TASK: YOUTUBE
Question: Watch the video and answer.
Media: https://www.youtube.com/watch?v=VIDEO_ID
Items:
0:30 => What did the speaker say about the topic?
1:15 => Summarize the main idea.`,

  web_embed: `
#TASK: WEB_EMBED
Question: Explore the embedded content and answer the question below.
Media: https://example.com/interactive-page
Height: 500
AllowFullscreen: true`,

  word_hide_reveal: `
#TASK: WORD_HIDE_REVEAL
Question: Read the text and reveal the hidden words.
Text:
The quick brown fox jumps over the lazy dog near the river.
FocusWords:
quick
jumps
lazy
HideMode: reveal
HideCount: 2
HideMinLength: 3`,

  word_hide_drag: `
#TASK: WORD_HIDE_DRAG
Question: Drag the missing words back into the text.
Text:
She always walks to school in the morning and studies English after lunch.
FocusWords:
walks
studies
HideMode: drag
HideCount: 2
HideMinLength: 4`,

  word_hide_type: `
#TASK: WORD_HIDE_TYPE
Question: Type the missing words to complete the text.
Text:
Every summer they travel to the mountains and enjoy fresh air.
FocusWords:
travel
enjoy
HideMode: type
HideCount: 2
HideMinLength: 4`,

  long_answer: `
#TASK: LONG_ANSWER
Question: <open-ended prompt requiring a paragraph response>
Hint: <optional guidance>
Explanation: <sample model answer>`,

  highlight_mistake: `
#TASK: HIGHLIGHT_MISTAKE
Question: Find the mistake in the sentence.
Text: She don't like coffee in the morning.
Targets:
don't
Answer: doesn't`,

  select_and_correct: `
#TASK: SELECT_AND_CORRECT
Question: Select the error and type the correction.
Text: He go to school every day.
Targets:
go
Answer: goes`,

  highlight_differences: `
#TASK: HIGHLIGHT_DIFFERENCES
Question: Highlight the differences between these two sentences.
Text: She walks to school every morning.
CompareText: She walked to school every evening.
Targets:
walks
morning`,

  keyword_expand: `
#TASK: KEYWORD_EXPAND
Question: Expand each keyword into a full sentence.
Items:
school / morning / walk
library / afternoon / study
park / weekend / play`,

  opinion_survey: `
#TASK: OPINION_SURVEY
Question: How do you feel about remote learning?
Options:
Strongly agree
Agree
Neutral
Disagree
Strongly disagree`,

  choose_and_explain: `
#TASK: CHOOSE_AND_EXPLAIN
Question: Which option is best and why?
Options:
Option A
Option B
Option C
Answer: Option B
Explanation: <why this answer is best>`,

  scenario_decision: `
#TASK: SCENARIO_DECISION
Question: You see a classmate struggling with homework. What do you do?
Options:
Offer to help them
Tell the teacher
Ignore them
Answer: Offer to help them
Explanation: <reasoning>`,

  memory_recall: `
#TASK: MEMORY_RECALL
Question: List three things you remember from the text.
Instruction: Write what you recall without looking back.`,

  flash_response: `
#TASK: FLASH_RESPONSE
Question: What is the past tense of "go"?
Answer: went
Hint: Think about irregular verbs.`,

  justify_order: `
#TASK: JUSTIFY_ORDER
Question: Put these historical events in order and explain why.
Items:
World War I begins
Treaty of Versailles signed
World War II begins`,

  word_family_builder: `
#TASK: WORD_FAMILY_BUILDER
Question: Build the word family from the root word.
Items:
act
Pairs:
noun => action
verb => act
adjective => active
adverb => actively`,

  emoji_symbol_match: `
#TASK: EMOJI_SYMBOL_MATCH
Question: Match each symbol to its meaning.
Pairs:
clock => time
books => study
sun => morning`,

  puzzle_jigsaw: `
#TASK: PUZZLE_JIGSAW
Question: Assemble the paragraph in the correct order.
Items:
First, gather your materials.
Next, follow the instructions carefully.
Then, check your work.
Finally, submit your answer.`,

  fill_table_matrix: `
#TASK: FILL_TABLE_MATRIX
Question: Complete the table with the correct verb forms.
Columns:
Base Form
Past Simple
Past Participle
Rows:
go | went | gone
eat | ate | eaten
HiddenCells:
0:1
0:2
1:1
1:2`,

  text_linking: `
#TASK: TEXT_LINKING
Question: Select important words and add notes.
Text:
The Renaissance was a period of cultural rebirth in Europe.
Targets:
Renaissance
cultural rebirth`,

  word_cloud: `
#TASK: WORD_CLOUD
Question: What words come to mind when you think about climate change?
Instruction: Type as many related words as you can.`,

  conditional_branch_questions: `
#TASK: CONDITIONAL_BRANCH_QUESTIONS
Question: Answer based on your choice.
Options:
Yes
No
Branches:
Yes => Why do you agree? Give an example.
No => What would change your mind?`,

  peer_review_checklist: `
#TASK: PEER_REVIEW_CHECKLIST
Question: Review your partner's writing using this checklist.
Items:
Clear topic sentence
Supporting details included
Correct grammar
Proper punctuation
Logical paragraph structure`,

  image_labeling: `
#TASK: IMAGE_LABELING
Question: Label the parts of the diagram.
Media: https://example.com/diagram.png
Pairs:
A => heart
B => lungs
C => liver`,

  random_wheel: `
#TASK: RANDOM_WHEEL
Question: Spin and discuss the topic.
Items:
Describe your weekend
Talk about your hobby
Tell us about your family
What is your favorite food?`,
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

  embed: `
#SLIDE: EMBED
Title: Interactive resource
Media: https://example.com/interactive-page
Height: 480
Content:
Explore the embedded resource above.
AllowFullscreen: true`,

  group: `
#GROUP
Title: Practice Set
Instruction: Complete all tasks in this group.
Layout: tabs
Items:
task-ref-1
task-ref-2`,

  split_group: `
#SPLIT_GROUP
Title: Side by Side
Instruction: Two tasks displayed together.
Items:
task-ref-1
task-ref-2`,
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

  // Core examples always included so the AI has concrete formatting reference
  const CORE_TASK_EXAMPLES = ['multiple_choice', 'fill_typing', 'match', 'order', 'reading_highlight', 'categorize'];
  const coreTypes = new Set(CORE_TASK_EXAMPLES);

  if (config.taskTypes?.length) {
    parts.push('\n## Requested task templates');
    for (const type of config.taskTypes) {
      const tmpl = TASK_TEMPLATES[type];
      if (tmpl) {
        parts.push(`\n### ${type.toUpperCase()}\n\`\`\`${tmpl}\n\`\`\``);
        coreTypes.delete(type);
      }
    }
  }

  // Always include core reference examples the AI hasn't seen yet
  if (coreTypes.size > 0) {
    parts.push('\n## Core DSL format reference examples');
    for (const type of coreTypes) {
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

  // Always include group/container templates
  parts.push('\n## Container templates');
  parts.push(`\n### GROUP\n\`\`\`${SLIDE_TEMPLATES.group}\n\`\`\``);
  parts.push(`\n### SPLIT_GROUP\n\`\`\`${SLIDE_TEMPLATES.split_group}\n\`\`\``);

  if (config.topic) parts.push(`\n## Lesson topic: ${config.topic}`);
  if (config.grammar) parts.push(`## Grammar focus: ${config.grammar}`);
  if (config.level) parts.push(`## Target level: ${config.level}`);

  parts.push('\n## Output rules');
  parts.push('- Start with #LESSON block');
  parts.push('- Use ONLY the block markers and field names shown above');
  parts.push('- Answers MUST exist in Options for choice tasks');
  parts.push('- Use [1], [2], [3] for indexed blanks');
  parts.push('- Use parser-safe formatting: one field per line, no prose between blocks');
  parts.push('- Prefer stable tasks first: multiple_choice, short_answer, match, order, categorize, reading_highlight');
  parts.push('- Use Points only when weighting is intentional; otherwise omit Points');
  parts.push('- If media is required, provide Media with a valid URL or a clear placeholder URL');
  parts.push('- Use straight ASCII punctuation and plain URLs only');
  parts.push('- For multiline fields, place content on lines below the key (not inline after the colon)');
  parts.push('- Every generated #SLIDE and #TASK must be fully authored: no empty Title, Content, Question, Hint, or Explanation placeholders');
  parts.push('- If slideTypes/taskTypes are provided, include each requested type at least once unless impossible for pedagogy');
  parts.push('- Keep answer distribution balanced and avoid repeating identical wording patterns across consecutive tasks');
  parts.push('- For grammar-focused lessons, include at least one controlled practice task and one transfer/application task');
  parts.push('- Return ONLY the DSL, no explanations or markdown fences');

  parts.push('\n## Quality guardrails');
  parts.push(DSL_QUALITY_GUARDRAILS);

  parts.push('\n## Parser safety checklist');
  parts.push(DSL_PARSER_SAFETY_CHECKLIST);

  return parts.join('\n');
}
