import { useMemo, useState } from 'react';
import { SLIDE_REGISTRY } from '../config/slideRegistry';
import { TASK_REGISTRY, getTaskDefinition } from '../config/taskRegistry';
import { getCatalogDsl, getSlideDslExample, getTaskDslExample } from '../utils/builder';
import { DSL_CORE_SPEC } from '../config/dslPromptTemplates';

const CUSTOM_TEMPLATES_KEY = 'lesson-flow-custom-templates';

function loadCustomTemplates() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_TEMPLATES_KEY) || '[]'); } catch { return []; }
}

function saveCustomTemplates(templates) {
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(templates));
}

export function addCustomTemplate(name, dsl) {
  const templates = loadCustomTemplates();
  templates.push({ id: crypto.randomUUID(), name, dsl, createdAt: Date.now() });
  saveCustomTemplates(templates);
}

const INPUT_TEXT_TASKS = ['fill_typing', 'short_answer', 'long_answer', 'dialogue_completion', 'error_correction', 'flash_response', 'memory_recall', 'keyword_expand'];

function isTaskAllowed(entry, excludeInputTextTasks) {
  if (entry.hiddenFromLibrary) return false;
  if (excludeInputTextTasks && INPUT_TEXT_TASKS.includes(entry.type)) return false;
  return true;
}

export default function GuidePanel({ onClose, onApplyPreset }) {
  const [tab, setTab] = useState('quick');
  const [lessonTopic, setLessonTopic] = useState('Daily routines');
  const [grammarTopic, setGrammarTopic] = useState('Present Simple');
  const [focus, setFocus] = useState('grammar');
  const [quickTopic, setQuickTopic] = useState('');
  const [quickGrammar, setQuickGrammar] = useState('');
  const [quickLevel, setQuickLevel] = useState('B1');
  const [quickHardness, setQuickHardness] = useState('medium');
  const [quickDuration, setQuickDuration] = useState('1h');
  const [quickParts, setQuickParts] = useState(3);
  const [quickTasksPerPart, setQuickTasksPerPart] = useState(10);
  const [quickIncludeSpeaking, setQuickIncludeSpeaking] = useState(true);
  const [quickIncludeVocabulary, setQuickIncludeVocabulary] = useState(true);
  const [quickIncludeReading, setQuickIncludeReading] = useState(true);
  const [quickIncludeGrammar, setQuickIncludeGrammar] = useState(true);
  const [quickCopied, setQuickCopied] = useState(false);
  const [level, setLevel] = useState('A2');
  const [difficulty, setDifficulty] = useState('Controlled practice');
  const [slideCount, setSlideCount] = useState(7);
  const [taskCount, setTaskCount] = useState(6);
  const [templatePreset, setTemplatePreset] = useState('grammar');
  const [markdownFormatting, setMarkdownFormatting] = useState(true);
  const [autoTaskSelection, setAutoTaskSelection] = useState(false);
  const [includeSlideTaskSuggestions, setIncludeSlideTaskSuggestions] = useState(true);
  const [excludeInputTextTasks, setExcludeInputTextTasks] = useState(false);
  const [selectedSlides, setSelectedSlides] = useState(['slide', 'two_column_text_task', 'image_task']);
  const [selectedTasks, setSelectedTasks] = useState(['multiple_choice', 'drag_to_blank', 'categorize', 'cards']);
  const [templateFilter, setTemplateFilter] = useState('All');
  const [customTemplates, setCustomTemplates] = useState(loadCustomTemplates);
  const [importText, setImportText] = useState('');
  const [importLevel, setImportLevel] = useState('B1');
  const [importCopied, setImportCopied] = useState(false);

  const availableTasks = useMemo(() => TASK_REGISTRY.filter((entry) => isTaskAllowed(entry, excludeInputTextTasks)), [excludeInputTextTasks]);

  const markdownLines = [
    '- Format slide and rich-text content as Markdown. Use headings, bullet lists, emphasis, quotes, code spans, and tables where helpful.',
    '- Keep markdown valid because the editor renders it and the builder exposes markdown composition and preview.',
  ].join('\n');

  const qualityRules = [
    '- Return only raw DSL text (not code fences, not a JSON block, not markdown). Treat the output as a plain .txt file containing only DSL.',
    '- Every slide must contain meaningful content. Never leave Content:, Left:, Right:, or Dialogue: empty.',
    '- For multiline fields (Content, Left, Right, Text, Dialogue, etc.), always put the value on the NEXT line after the field name. Good:\nContent:\n### Title\nSome text\n\nBad: Content: ### Title',
    '- Media, Image, Video, and Audio fields must contain a single raw URL. Never wrap URLs in markdown links or images like [text](url) or ![alt](url).',
    '- Choose task types that match the teaching goal. Do not spam RANDOM_WHEEL or CARDS just to create variety.',
    '- Use RANDOM_WHEEL at most once unless the focus is speaking fluency.',
    '- Use CARDS at most once unless the lesson is explicitly vocabulary-review heavy.',
    '- Do not duplicate the same data in both Pairs and Cards for the same task. For CARDS use Cards: only. For matching tasks use Pairs: only.',
    '- Prefer drag_to_blank for sentence completion and inline gap fill. If you use fill_typing or dialogue_completion, the Text MUST contain visible inline blanks: use ___ (triple underscore) or {} or [blank] markers inside the text.',
    '- Avoid placeholder or generic prompts like "Choose the correct sentence" repeated many times. Make each task instruction specific and unique.',
    '- Use at least 3 different high-value task styles across the lesson.',
    '- Keep answer keys exact and aligned with the prompt text.',
    '- For group_task_slide, TaskRefs must contain only short task refs like t1, t2, task-match. Never include block markers such as #TASK: MATCH inside TaskRefs.',
    '- For carousel or step-by-step slides, each Steps item should be one logical card or step. Separate steps with blank lines.',
    '- IMPORTANT: Do NOT use side-by-side (two-column) layouts for everything. Use #SLIDE (single column) for most educational content slides. Only use #SLIDE: TWO_COLUMN_TEXT_TASK when you genuinely need to visually compare or contrast two pieces of content side-by-side.',
    '- Only use LinkTo when a slide should open visually paired with a specific task on the same screen. Most slides should NOT have LinkTo. Let the player present slides and tasks sequentially in full-width.',
    '- Use #SLIDE for introductions, rules, examples, explanations. Use #SLIDE: STRUCTURE only for grammar pattern breakdowns. Use #SLIDE: FOCUS for keyword lists.',
    '- Each #TASK block MUST have a Question field with a clear, specific instruction unique to that task.',
    '- Options for MULTIPLE_CHOICE tasks must be shuffled / not in obvious order. Include at least 3 options, preferably 4.',
    '- For ORDER tasks, Items must list the correct final order. The app shuffles them automatically.',
    '- For CATEGORIZE tasks, provide Categories (the bucket labels) AND Items (the items to sort, formatted as "item => category").',
    '- For DRAG_TO_BLANK, put the sentence with ___ blanks in Text, and list the correct words in Blanks.',
    '',
    'TASK TYPE SELECTION GUIDE — choose the right type for the right purpose:',
    '- MULTIPLE_CHOICE: Testing knowledge of a specific fact, rule, or reading comprehension. Needs exactly 1 correct answer and 3-4 total options. Answer MUST be one of the Options. Best for: grammar rules, reading comp, factual recall.',
    '- MULTI_SELECT: When MORE than one answer is correct. Needs 2+ correct answers from 4-6 options. All answers MUST appear in Options. Best for: "select all that apply", identifying multiple examples.',
    '- TRUE_FALSE: Testing whether a statement is factually correct. Answer is always "True" or "False". Do NOT use for opinion questions or subjective claims.',
    '- YES_NO: Simple yes/no factual questions. Do NOT use for complex or debatable topics.',
    '- EITHER_OR: Choose between exactly 2 clear alternatives. Provide exactly 2 options.',
    '- DRAG_TO_BLANK: Fill missing words into sentences. Text MUST have ___ or {} markers. Number of blanks in Text MUST equal number of Blanks entries. Always provide 2-4 extra wrong words in Options as distractors.',
    '- FILL_TYPING / TYPE_IN_BLANK: Student types the missing word(s). Text MUST have ___ or {} markers. Provide exact expected answers in Answer (separate multiple with |). Best for: verb conjugation, spelling practice.',
    '- DIALOGUE_COMPLETION: Complete a multi-turn dialogue. Text must have ___ markers for missing turns. Answer has each blank answer separated by |.',
    '- ERROR_CORRECTION: Student fixes wrong sentences. Put the INCORRECT sentences in Text (one per line). Put the CORRECT versions in Answer (one per line separated by |). Number of answers MUST equal number of sentences in Text.',
    '- ORDER / TIMELINE_ORDER / SENTENCE_BUILDER: Arrange items into correct sequence. List Items in the CORRECT order (the app shuffles automatically). Need at least 3-6 items. Best for: sentence building, chronological events, procedures.',
    '- CATEGORIZE / MATCHING_PAIRS_CATEGORIES: Sort items into named buckets. Items MUST use "item text => Category Name" format. Every item must have "=> CategoryName". Provide at least 2 categories. Best for: grammar sorting, vocabulary classification.',
    '- MATCH / DRAG_DROP: Match left items to right items 1-to-1. Use Pairs field with "left => right" format. Each pair needs a unique left side. Best for: vocabulary matching, Q&A pairs, term-definition.',
    '- CARDS: Flashcard review with term/definition. Use Cards field with "front => back" format. Provide at least 4 cards. Best for: vocabulary review, key concept memorization.',
    '- READING_HIGHLIGHT: Student clicks/taps specific words in a passage. Provide the full text in Text and the target words in Targets. Targets must be actual words that appear in the Text.',
    '- RANDOM_WHEEL: Spinning wheel for speaking prompts. List 6-10 speaking topics in Items. Use at most 1 per part. Best for: conversation warm-ups, speaking practice.',
    '- SCALE: Rate confidence or agreement on a numeric scale. Provide Min, Max, and expected Answer. Best for: self-assessment, opinion gauging.',
    '- CHOOSE_AND_EXPLAIN / SCENARIO_DECISION: Choose an option and write justification. Provide Options (choices) and a scenario in Text. Best for: critical thinking, analysis, debate.',
    '- SHORT_ANSWER: Type a brief response (1-2 sentences). Best for: quick recall, simple production.',
    '- LONG_ANSWER: Extended writing (paragraph+). Best for: essays, descriptions, creative writing.',
    '',
    'CRITICAL COUNT RULES — violations will break the task:',
    '- MULTIPLE_CHOICE: Answer MUST be exactly ONE of the Options. Never provide an answer not in the options list. Provide 3-4 options.',
    '- MULTI_SELECT: ALL answers MUST appear in Options. Number of correct answers must be ≥ 2 and < total options.',
    '- DRAG_TO_BLANK: Number of Blanks MUST equal the number of ___ or {} in Text. Add extra wrong words in Options for difficulty.',
    '- ERROR_CORRECTION: Number of correct answers in Answer (separated by |) MUST equal the number of sentences in Text.',
    '- FILL_TYPING: Number of answers in Answer (separated by |) MUST equal the number of ___ or {} in Text.',
    '- CATEGORIZE: Every item in Items MUST have "=> CategoryName". CategoryName must match one of the Categories.',
    '- MATCH/DRAG_DROP: Each Pairs entry must have both a left and right value. Left values must be unique.',
    '- CARDS: Each Cards entry must have both front and back. Provide at least 4 cards.',
    '- ORDER: Provide at least 3 items. Items are in the correct order (app shuffles automatically).',
    '- READING_HIGHLIGHT: Every word in Targets must appear exactly as written in Text (case-insensitive).',
  ].join('\n');

  const antiPatterns = [
    '- Empty slide content blocks.',
    '- Markdown links inside Media fields.',
    '- Repeating the same task shell with only tiny wording changes.',
    '- Too many low-effort text-input tasks in a row.',
    '- Answers that are obvious because options stay in textbook order.',
    '- Using LinkTo on every slide (this forces two-column layout and looks cramped).',
    '- Using #SLIDE: TWO_COLUMN_TEXT_TASK as the default slide type.',
    '- Putting #TASK: or #SLIDE: markers inside content text fields.',
    '- Writing field values on the same line as multiline field names (e.g., "Content: text here").',
    '- Wrapping output in code fences (```markdown or ```txt) — output plain text only.',
    '- Using smart/curly quotes — use straight quotes only.',
    '- Numbering block markers like "1. #TASK:" — just use "#TASK:" directly.',
    '- MULTIPLE_CHOICE with an Answer that is NOT one of the Options. The answer MUST match an option exactly.',
    '- MULTI_SELECT answers that include values not listed in Options.',
    '- DRAG_TO_BLANK where the number of Blanks does not match the number of blanks in Text.',
    '- ERROR_CORRECTION where the answer count does not match the sentence count in Text.',
    '- CATEGORIZE items without "=> CategoryName" mapping.',
    '- MATCH/DRAG_DROP with duplicate left-side values in Pairs.',
    '- Using CATEGORIZE when MULTIPLE_CHOICE would suffice (e.g., only 1-2 items to sort).',
    '- Using LONG_ANSWER for factual questions that have a specific answer — use MULTIPLE_CHOICE or SHORT_ANSWER instead.',
    '- Using RANDOM_WHEEL more than once per lesson part.',
    '- READING_HIGHLIGHT with target words that do not appear in the passage text.',
    '- FILL_TYPING / DIALOGUE_COMPLETION without ___ or {} markers in Text.',
  ].join('\n');

  const slideExamples = useMemo(() => {
    return SLIDE_REGISTRY
      .filter((entry) => selectedSlides.includes(entry.type))
      .map((entry) => `## ${entry.label}\n${getSlideDslExample(entry.type)}`)
      .join('\n\n');
  }, [selectedSlides]);

  const taskExampleEntries = useMemo(() => {
    const entries = autoTaskSelection ? availableTasks : availableTasks.filter((entry) => selectedTasks.includes(entry.type));
    return entries.map((entry) => ({ label: entry.label, dsl: getTaskDslExample(entry.type) }));
  }, [autoTaskSelection, availableTasks, selectedTasks]);

  const taskExamples = useMemo(() => taskExampleEntries.map((entry) => `## ${entry.label}\n${entry.dsl}`).join('\n\n'), [taskExampleEntries]);

  const prompt = useMemo(() => {
    const effectiveSelectedTasks = selectedTasks.filter((entry) => availableTasks.some((task) => task.type === entry));
    const selectedTaskNames = autoTaskSelection ? 'Auto-select from the allowed task types in the DSL catalog.' : effectiveSelectedTasks.join(', ');
    const slidePlan = includeSlideTaskSuggestions
      ? selectedSlides.map((entry, index) => `- Slide ${index + 1}: ${entry} with a suggested ${effectiveSelectedTasks[index % Math.max(effectiveSelectedTasks.length, 1)] || 'task'} interaction`).join('\n')
      : '- Create the slide-task pairing yourself.';

    const outputContract = [
      'Expected output structure (plain .txt, no code fences):',
      '',
      '#LESSON',
      'Title: My School and Classmates — Present Simple (A2)',
      'LessonTopic: School routines',
      'GrammarTopic: Present Simple',
      '',
      '#SLIDE',
      'Title: Introduction',
      'Ref: intro',
      'Content:',
      '## Welcome!',
      'Today we will learn about...',
      '',
      '#TASK: MULTIPLE_CHOICE',
      'Ref: task-1',
      'Question: Which sentence about daily routines is correct?',
      'Options:',
      'He go to school every day.',
      'He goes to school every day.',
      'He going to school every day.',
      'He gone to school every day.',
      'Answer: He goes to school every day.',
      'Explanation: We add -es to "go" for he/she/it.',
    ].join('\n');

    return `You are generating a structured lesson in a custom DSL format. Output the result as a plain .txt file containing ONLY DSL blocks. No code fences, no explanations outside the DSL.

${DSL_CORE_SPEC}

Lesson topic: ${lessonTopic}
Grammar topic: ${grammarTopic}
Focus: ${focus}
CEFR level: ${level}
Difficulty style: ${difficulty}
Preset template: ${templatePreset}

Requirements:
- Minimum ${slideCount} slides and ${taskCount} tasks
- Slide types to use: ${selectedSlides.join(', ')}
- Task types: ${selectedTaskNames}
- ${excludeInputTextTasks ? 'EXCLUDE input-text tasks (fill_typing, short_answer, long_answer, dialogue_completion, error_correction, flash_response, memory_recall, keyword_expand).' : 'Input-text tasks are allowed only when they truly add value.'}
- MOST slides should be full-width #SLIDE (single column). Only use two-column or LinkTo sparingly.
- Include hints and explanations for every task
- Include correct answers for every task
- Output only DSL, treat as a .txt file
${markdownFormatting ? markdownLines : ''}

Quality rules (MUST follow):
${qualityRules}

Common mistakes to AVOID:
${antiPatterns}

${outputContract}

Suggested slide-by-slide plan:
${slidePlan}

DSL slide format examples:
${slideExamples || 'Use any valid slide example from the DSL catalog.'}

DSL task format examples:
${taskExamples || getCatalogDsl()}`;
  }, [antiPatterns, autoTaskSelection, availableTasks, difficulty, excludeInputTextTasks, focus, grammarTopic, includeSlideTaskSuggestions, lessonTopic, level, markdownFormatting, qualityRules, selectedSlides, selectedTasks, slideCount, slideExamples, taskCount, taskExamples, templatePreset, markdownLines]);

  const quickPrompt = useMemo(() => {
    if (!quickTopic.trim() && !quickGrammar.trim()) return '';

    const topicLine = quickTopic.trim() || 'General English';
    const grammarLine = quickGrammar.trim() || 'Mixed grammar';
    const taskTypeList = TASK_REGISTRY.filter((e) => !e.hiddenFromLibrary).map((e) => e.type.toUpperCase()).join(', ');
    const slideTypeList = SLIDE_REGISTRY.map((e) => e.type.toUpperCase()).join(', ');

    const exampleSlide = getSlideDslExample('slide');
    const exampleTask = getTaskDslExample('multiple_choice');
    const exampleDrag = getTaskDslExample('drag_to_blank');
    const exampleCategorize = getTaskDslExample('categorize');
    const exampleOrder = getTaskDslExample('order');
    const exampleCards = getTaskDslExample('cards');
    const exampleErrorCorrection = getTaskDslExample('error_correction');
    const exampleDialogueFill = getTaskDslExample('dialogue_fill');
    const exampleHighlight = getTaskDslExample('reading_highlight');

    const sectionBlocks = [];
    if (quickIncludeSpeaking) sectionBlocks.push(`### Speaking section (per part)
- Create a #SLIDE with a Title like "Part X — Speaking" containing 10+ numbered speaking prompts as markdown numbered list in Content.
- Then create 1–2 #TASK: RANDOM_WHEEL tasks with 6–10 speaking topics in Items.
- Speaking prompts should be open-ended conversation starters related to the part theme.`);
    if (quickIncludeVocabulary) sectionBlocks.push(`### Vocabulary section (per part)
- Create a #SLIDE with key vocabulary words, definitions, and example sentences in Content using markdown tables or bold terms.
- Then create 2–3 tasks: use CARDS (term => definition), CATEGORIZE (word => category), DRAG_TO_BLANK (sentences with vocabulary blanks), or MATCH (word => meaning).
- Include at least 10 vocabulary-rich sentences spread across the tasks.`);
    if (quickIncludeGrammar) sectionBlocks.push(`### Grammar section (per part)
- Create 1–2 slides: use #SLIDE: STRUCTURE for sentence patterns (Positive/Negative/Question) and #SLIDE for rules and examples.
- Then create 2–3 tasks: MULTIPLE_CHOICE, TRUE_FALSE, DRAG_TO_BLANK, ERROR_CORRECTION, FILL_TYPING, or ORDER.
- Tasks should test the grammar point with varied difficulty.`);
    if (quickIncludeReading) sectionBlocks.push(`### Reading section (per part)
- Create a #SLIDE with a reading passage (150–300 words for the given level) in Content. Use markdown headings and paragraphs.
- Then create 3–5 comprehension tasks using: MULTIPLE_CHOICE (about the text), TRUE_FALSE (statements about the text), SHORT_ANSWER, or READING_HIGHLIGHT (find specific words).
- The reading text should relate to the part theme and contain examples of the target grammar.`);

    const sectionInstructions = sectionBlocks.length > 0 ? sectionBlocks.join('\n\n') : '### Mixed practice\n- Use a mix of slides and tasks per part.';

    return `You are generating a FULL structured English lesson in a custom DSL format. Output the result as a plain .txt file containing ONLY DSL blocks. No code fences, no explanations, no commentary outside the DSL.

LESSON PARAMETERS:
- Topic: ${topicLine}
- Grammar: ${grammarLine}
- CEFR Level: ${quickLevel}
- Hardness: ${quickHardness} (easy = simple vocabulary and short sentences, medium = standard for the CEFR level, hard = challenging vocabulary and complex sentences, expert = near the upper boundary of the CEFR level with nuanced grammar)
- Duration: ${quickDuration}
- Parts: ${quickParts} (each part has a theme/sub-topic related to the main topic)
- Tasks per part: approximately ${quickTasksPerPart}
- Task variety: use at least 6 different task types across the lesson

LESSON STRUCTURE:
The lesson is divided into ${quickParts} parts. Each part should:
1. Start with a #SLIDE titled "Part {number} / {Part Theme}" with a brief intro in Content
2. Contain ${quickTasksPerPart} tasks spread across the active sections below
3. End with a brief review or transition

${sectionInstructions}

AVAILABLE SLIDE TYPES: ${slideTypeList}
AVAILABLE TASK TYPES: ${taskTypeList}

FORMAT RULES (MUST follow every one):
- Return ONLY raw DSL text. No \`\`\` code fences. No markdown wrapping. Treat the output as a .txt file.
- Start with #LESSON block with Title, LessonTopic, GrammarTopic fields.
- Every #SLIDE block needs Title and Content (on the NEXT line after "Content:").
- Every #TASK block needs Question, the appropriate data fields (Options/Items/Blanks/Pairs/Cards depending on type), Answer/Correct, Hint, and Explanation.
- For multiline fields (Content, Text, Left, Right, Dialogue, Explanation), put the value on the NEXT line:
  Content:
  ### My Heading
  Some paragraph text

  NOT: Content: ### My Heading
- For list fields (Options, Items, Blanks, Categories, Pairs, Cards, Steps), put each item on its own line:
  Options:
  First option
  Second option
  Third option

  NOT: Options: First option, Second option
- For DRAG_TO_BLANK: put sentence with ___ blanks in Text, list correct words in Blanks, extra wrong words in Options.
- For CATEGORIZE: list category names in Categories, items in Items as "item text => Category Name".
- For ORDER: list items in the correct final order in Items. The app shuffles them automatically.
- For CARDS: list as "front => back" in Cards field.
- For MATCH: list as "left => right" in Pairs field.
- For ERROR_CORRECTION: put the incorrect sentences in Text (one per line), put the corrected versions in Answer separated by |.
- MOST slides should be regular #SLIDE (full-width). Only use TWO_COLUMN when genuinely comparing content side by side.
- Do NOT use LinkTo unless a slide must open paired with a specific task on the same screen.
- Do NOT put #TASK: or #SLIDE: markers inside content text.
- Media/Image/Video fields must be raw URLs only, never markdown links.
- Include at least 4 options for multiple choice tasks. Vary the position of the correct answer.
- Make every Question instruction specific and unique — never repeat "Choose the correct answer".
- Use Markdown in slide Content: headings (## ##), bold (**word**), bullet lists, tables where appropriate.

TASK TYPE SELECTION GUIDE — pick the right type for the teaching goal:
- MULTIPLE_CHOICE: 1 correct answer from 3-4 options. Answer MUST match one option exactly. Best for: grammar rules, reading comprehension, factual recall.
- MULTI_SELECT: 2+ correct answers from 4-6 options. All answers MUST appear in Options. Best for: "select all correct", multiple examples.
- TRUE_FALSE: Statement + "True"/"False". Only for factual, non-debatable claims.
- DRAG_TO_BLANK: Fill words into sentence blanks. Text uses ___ markers. Blanks count MUST equal ___ count. Add 2-4 extra wrong words in Options. Best for: grammar forms, vocabulary in context. BLANK PLACEMENT: place blanks on functional words that test the grammar point (verbs, prepositions, articles, conjunctions) — not content words the student would need context to guess.
- FILL_TYPING: Student types missing words. Text uses ___ markers. Answer count (separated by |) MUST equal blank count. Best for: verb conjugation, spelling, precise grammar forms. The answer for each blank must be unambiguous — avoid blanks where multiple correct words could fit unless the task explicitly says "any valid answer".
- ERROR_CORRECTION: Fix wrong sentences. Answer count (|) MUST equal sentence count in Text. Make exactly ONE error per sentence. The error should be a grammar mistake, not a spelling mistake.
- ORDER: Arrange 3-6 items correctly. Items listed in correct order, app shuffles automatically.
- CATEGORIZE: Sort items into buckets. Items MUST use "item => Category" format. Need 2+ categories, 4+ items. Distribute items roughly evenly between categories.
- MATCH/DRAG_DROP: 1-to-1 pair matching. Use Pairs: "left => right". Need 3+ unique pairs.
- CARDS: Vocabulary flashcards. Use Cards: "front => back". Need 4+ cards. Front = word or phrase, Back = definition or translation.
- READING_HIGHLIGHT: Click target words in text. Targets must exist in Text exactly (case-insensitive match). Best for: finding parts of speech, key vocabulary, grammar patterns.
- RANDOM_WHEEL: Spin for speaking prompt. 6-10 items. Max 1 per part.
- SENTENCE_BUILDER: Arrange word chunks into a correct sentence. 4-7 items. Items are words or multi-word chunks listed in correct order. Good for: word order, complex sentence structure.
- TIMELINE_ORDER: Arrange events chronologically. 4-6 items. Best for: narrative sequence, process steps.
- DIALOGUE_FILL: Chat dialogue with typed blanks. Text has speaker lines like "A: I ___ English every day." Answer is pipe-separated. Good for: conversational grammar.
- DIALOGUE_COMPLETION: Chat dialogue with word bank drag-drop. Same format as DIALOGUE_FILL but uses drag-drop UI. Add extra wrong words in Options.
- WORD_FAMILY_BUILDER: Build related word forms. Items = word forms from same root (e.g., teach, teacher, teaching, taught).
- HIGHLIGHT_MISTAKE: Student taps the incorrect word. Text = sentence with one mistake, Answer = the wrong word exactly.
- SELECT_AND_CORRECT: Student taps wrong word then types correction. Text = sentence with mistake, Answer = the corrected word.
- CHOOSE_AND_EXPLAIN / SCENARIO_DECISION: Choose + justify reasoning. Provide Options and scenario Text.

CRITICAL COUNT RULES (violations will break the task):
- MULTIPLE_CHOICE: Answer must be exactly 1 of the Options.
- MULTI_SELECT: All answers must appear in Options. answers ≥ 2, answers < total options.
- DRAG_TO_BLANK: Number of Blanks = number of ___ in Text.
- ERROR_CORRECTION: Number of answers (|) = number of lines in Text.
- FILL_TYPING/DIALOGUE_COMPLETION: Number of answers (|) = number of ___ in Text.
- CATEGORIZE: Every item needs "=> CategoryName". CategoryName must match a Categories entry.
- MATCH: Each pair needs unique left and right. Minimum 3 pairs.

COMMON MISTAKES TO AVOID:
- Empty slide content or task questions.
- Writing field values on the same line as multiline field names (e.g., "Content: text").
- Repeating the same task type more than 3 times in a row.
- Using RANDOM_WHEEL more than once per part.
- Using generic instructions like "Choose the correct answer" for every task.
- Forgetting Hint and Explanation fields.
- Putting markdown links in Media fields.
- Leaving Categories empty for CATEGORIZE tasks (always provide Categories AND Items with "item => category").
- Wrapping output in \`\`\`markdown or \`\`\`txt code fences — output MUST be plain text.
- Using smart/curly quotes like \u201C or \u201D — use straight quotes only.
- Numbering block markers like "1. #TASK:" — just use "#TASK:" directly.
- Adding extra commentary before or after the DSL — output NOTHING except DSL blocks.
- MULTIPLE_CHOICE with an Answer NOT in Options — this makes the task unsolvable.
- DRAG_TO_BLANK with wrong blank count — blanks array must match ___ markers exactly.
- ERROR_CORRECTION with answer/sentence count mismatch.
- CATEGORIZE items without "=> Category" — every item needs explicit category assignment.
- FILL_TYPING text without ___ or {} markers.
- Using LONG_ANSWER for factual questions that have specific answers — use MULTIPLE_CHOICE or SHORT_ANSWER instead.
- Using ORDER with fewer than 3 items.
- Using CATEGORIZE when only 1-2 items need sorting — use MULTIPLE_CHOICE instead.

EXAMPLE DSL BLOCKS:

${exampleSlide}

${exampleTask}

${exampleDrag}

${exampleCategorize}

${exampleOrder}

${exampleCards}

${exampleErrorCorrection}

${exampleDialogueFill}

${exampleHighlight}

Now generate the COMPLETE lesson with all ${quickParts} parts. Each part should have ~${quickTasksPerPart} tasks and relevant slides. Output ONLY the DSL text, nothing else.`;
  }, [quickTopic, quickGrammar, quickLevel, quickHardness, quickDuration, quickParts, quickTasksPerPart, quickIncludeSpeaking, quickIncludeVocabulary, quickIncludeReading, quickIncludeGrammar]);

  const templateEntries = [
    ...customTemplates.map((t) => ({ key: `custom-${t.id}`, label: t.name, kind: 'Custom', category: 'My Templates', value: t.dsl, customId: t.id })),
    ...SLIDE_REGISTRY.map((entry) => ({ key: `slide-${entry.type}`, label: entry.label, kind: 'Slide', category: 'Slides', value: getSlideDslExample(entry.type) })),
    ...availableTasks.map((entry) => ({ key: `task-${entry.type}`, label: entry.label, kind: 'Task', category: getTaskDefinition(entry.type)?.category || 'Other', value: getTaskDslExample(entry.type) })),
    { key: 'catalog', label: 'All Types Test Lesson', kind: 'Catalog', category: 'Catalog', value: getCatalogDsl() },
  ];

  const templateCategories = useMemo(() => {
    const cats = ['All'];
    const seen = new Set();
    for (const e of templateEntries) {
      if (!seen.has(e.category)) { seen.add(e.category); cats.push(e.category); }
    }
    return cats;
  }, [templateEntries]);

  const filteredTemplates = templateFilter === 'All' ? templateEntries : templateEntries.filter((e) => e.category === templateFilter);

  const importPrompt = useMemo(() => {
    if (!importText.trim()) return '';
    const wordCount = importText.trim().split(/\s+/).length;
    return `You are a professional ESL lesson builder. I will give you a source text. Create a complete lesson in DSL format based on this text.

Student level: ${importLevel}
Source text word count: ~${wordCount} words

SOURCE TEXT:
"""
${importText.trim()}
"""

REQUIREMENTS:
1. Start with #LESSON block with Title, LessonTopic, Focus, Difficulty: ${importLevel}
2. Create an introductory slide (#SLIDE) presenting the topic
3. Create a vocabulary slide with key words from the text
4. Create 6-10 tasks based on the text content:
   - Reading comprehension (multiple_choice)
   - Vocabulary in context (drag_to_blank or fill_typing)
   - True/False questions about the text
   - Order events/ideas from the text (order)
   - Match vocabulary to definitions (match)
   - Short answer discussion questions
5. End with a summary/review slide
6. Use markdown formatting in slide content (bold, lists, etc.)
7. All task content should directly reference the source text

Output ONLY the DSL text, nothing else.`;
  }, [importText, importLevel]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" onClick={onClose} className="absolute inset-0 bg-black/20" />
      <aside className="relative z-10 h-full w-full max-w-full sm:max-w-[600px] lg:max-w-[800px] xl:max-w-[900px] overflow-y-auto border-l border-zinc-200 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.14)]">
        <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-zinc-950">Guide</div>
            <button type="button" onClick={onClose} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 transition hover:border-zinc-900">Close</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {['quick', 'templates', 'import', 'prompt'].map((entry) => (
              <button key={entry} type="button" onClick={() => setTab(entry)} className={tab === entry ? 'border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white' : 'border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50'}>
                {entry === 'quick' ? 'Quick Generate' : entry === 'templates' ? 'Templates' : entry === 'import' ? 'Import Text' : 'AI Prompt'}
              </button>
            ))}
          </div>
        </div>
        <div className="p-5">
          {tab === 'quick' && (
            <div className="space-y-5">
              <div className="border border-zinc-200 bg-zinc-50/60 p-4">
                <div className="text-xs text-zinc-600">Configure your lesson, copy the prompt, paste the AI output into the DSL editor.</div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Lesson topic <span className="font-normal text-zinc-400">(required)</span></span>
                  <input value={quickTopic} onChange={(e) => setQuickTopic(e.target.value)} placeholder="e.g. Travel and vacation plans" className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Grammar topic <span className="font-normal text-zinc-400">(required)</span></span>
                  <input value={quickGrammar} onChange={(e) => setQuickGrammar(e.target.value)} placeholder="e.g. Future with Going to and Will" className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-5">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Level</span>
                  <select value={quickLevel} onChange={(e) => setQuickLevel(e.target.value)} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900">
                    {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((lvl) => <option key={lvl} value={lvl}>{lvl}</option>)}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Hardness</span>
                  <select value={quickHardness} onChange={(e) => setQuickHardness(e.target.value)} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900">
                    {['easy', 'medium', 'hard', 'expert'].map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Duration</span>
                  <select value={quickDuration} onChange={(e) => setQuickDuration(e.target.value)} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900">
                    {['30m', '45m', '1h', '1.5h', '2h'].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Parts</span>
                  <input type="number" value={quickParts} onChange={(e) => setQuickParts(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} min={1} max={10} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Tasks / part</span>
                  <input type="number" value={quickTasksPerPart} onChange={(e) => setQuickTasksPerPart(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} min={1} max={20} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
                </label>
              </div>

              <div className="rounded-3xl border border-zinc-200 p-4">
                <div className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Lesson sections</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    { key: 'speaking', label: 'Speaking', desc: 'Prompts & wheel', value: quickIncludeSpeaking, set: setQuickIncludeSpeaking },
                    { key: 'vocabulary', label: 'Vocabulary', desc: 'Words & cards', value: quickIncludeVocabulary, set: setQuickIncludeVocabulary },
                    { key: 'grammar', label: 'Grammar', desc: 'Rules & practice', value: quickIncludeGrammar, set: setQuickIncludeGrammar },
                    { key: 'reading', label: 'Reading', desc: 'Text & comprehension', value: quickIncludeReading, set: setQuickIncludeReading },
                  ].map((section) => (
                    <label key={section.key} className={[
                      'flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition',
                      section.value ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 hover:border-zinc-300',
                    ].join(' ')}>
                      <input type="checkbox" checked={section.value} onChange={(e) => section.set(e.target.checked)} className="mt-0.5" />
                      <div>
                        <div className="text-sm font-medium text-zinc-800">{section.label}</div>
                        <div className="text-xs text-zinc-500">{section.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {quickPrompt ? (
                <div className="rounded-3xl border border-zinc-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Generated prompt</div>
                      <div className="text-sm text-zinc-600">Copy this and paste it into ChatGPT. Then paste the AI output into the DSL tab.</div>
                    </div>
                    <button type="button" onClick={() => { navigator.clipboard.writeText(quickPrompt); setQuickCopied(true); setTimeout(() => setQuickCopied(false), 2000); }} className="rounded-2xl border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50">
                      {quickCopied ? 'Copied!' : 'Copy prompt'}
                    </button>
                  </div>
                  <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs leading-6 text-zinc-700">{quickPrompt}</pre>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                      <span>1</span><span>Copy prompt above</span>
                    </div>
                    <span className="text-zinc-300">&rarr;</span>
                    <div className="flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
                      <span>2</span><span>Paste into ChatGPT</span>
                    </div>
                    <span className="text-zinc-300">&rarr;</span>
                    <div className="flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700">
                      <span>3</span><span>Copy AI output</span>
                    </div>
                    <span className="text-zinc-300">&rarr;</span>
                    <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                      <span>4</span><span>Paste into DSL editor</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-400">
                  Enter a lesson topic and grammar topic above to generate the prompt.
                </div>
              )}
            </div>
          )}

          {tab === 'templates' && (
            <div className="space-y-4">
              {/* Category filter bar */}
              <div className="flex flex-wrap gap-1.5">
                {templateCategories.map((cat) => (
                  <button key={cat} type="button" onClick={() => setTemplateFilter(cat)} className={templateFilter === cat ? 'border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white' : 'border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:border-zinc-400'}>{cat}</button>
                ))}
              </div>
              <div className="text-[10px] text-zinc-400">{filteredTemplates.length} template{filteredTemplates.length !== 1 ? 's' : ''}</div>
              {filteredTemplates.map((entry) => (
                <div key={entry.key} className="border border-zinc-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">{entry.kind}</span>
                        <span className="border border-zinc-200 px-1.5 py-0.5 text-[9px] font-medium text-zinc-400">{entry.category}</span>
                      </div>
                      <div className="mt-0.5 text-sm text-zinc-700">{entry.label}</div>
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => navigator.clipboard.writeText(entry.value)} className="border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50">Copy</button>
                      {entry.customId && (
                        <button type="button" onClick={() => { const next = customTemplates.filter((t) => t.id !== entry.customId); saveCustomTemplates(next); setCustomTemplates(next); }} className="border border-rose-200 px-2 py-2 text-xs text-rose-600 transition hover:bg-rose-50">✕</button>
                      )}
                    </div>
                  </div>
                  <pre className="mt-4 overflow-x-auto border border-zinc-200 bg-zinc-50 p-4 text-xs leading-6 text-zinc-700">{entry.value}</pre>
                </div>
              ))}
            </div>
          )}

          {tab === 'import' && (
            <div className="space-y-4">
              <div className="text-xs text-zinc-500">Paste an article, dialogue, or any text below. An AI prompt will be generated to create a full lesson from it.</div>
              <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="Paste your article, text, or dialogue here…" className="h-48 w-full border border-zinc-200 p-4 text-sm outline-none transition focus:border-zinc-900" />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-zinc-600">
                  Level:
                  <select value={importLevel} onChange={(e) => setImportLevel(e.target.value)} className="border border-zinc-200 px-2 py-1 text-xs outline-none">
                    {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => <option key={l}>{l}</option>)}
                  </select>
                </label>
              </div>
              {importText.trim() && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">Generated Prompt</div>
                    <button type="button" onClick={() => { navigator.clipboard.writeText(importPrompt); setImportCopied(true); setTimeout(() => setImportCopied(false), 2000); }} className="border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50">{importCopied ? 'Copied!' : 'Copy Prompt'}</button>
                  </div>
                  <pre className="max-h-64 overflow-auto border border-zinc-200 bg-zinc-50 p-4 text-xs leading-6 text-zinc-700 whitespace-pre-wrap">{importPrompt}</pre>
                </div>
              )}
            </div>
          )}

          {tab === 'prompt' && (
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Lesson topic</span>
                  <input value={lessonTopic} onChange={(event) => setLessonTopic(event.target.value)} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Grammar topic</span>
                  <input value={grammarTopic} onChange={(event) => setGrammarTopic(event.target.value)} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
                </label>
              </div>
              <div className="grid gap-4 lg:grid-cols-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Focus</span>
                  <select value={focus} onChange={(event) => setFocus(event.target.value)} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900">
                    {['grammar', 'vocabulary', 'reading', 'speaking', 'listening', 'writing', 'mixed'].map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Level</span>
                  <select value={level} onChange={(event) => setLevel(event.target.value)} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900">
                    {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Difficulty style</span>
                  <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900">
                    {['Controlled practice', 'Scaffolded', 'Balanced', 'Challenging'].map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Preset template</span>
                  <select value={templatePreset} onChange={(event) => setTemplatePreset(event.target.value)} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900">
                    {['grammar', 'vocabulary', 'reading', 'speaking', 'mixed'].map((entry) => <option key={entry} value={entry}>{entry}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Number of slides</span>
                  <input type="number" value={slideCount} onChange={(event) => setSlideCount(Number(event.target.value) || 1)} min={1} max={60} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-zinc-700">Number of tasks</span>
                  <input type="number" value={taskCount} onChange={(event) => setTaskCount(Number(event.target.value) || 1)} min={1} max={60} className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
                </label>
              </div>
              <label className="flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-sm text-zinc-700">
                <input type="checkbox" checked={markdownFormatting} onChange={(event) => setMarkdownFormatting(event.target.checked)} />
                Format slide text as Markdown.
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-sm text-zinc-700">
                <input type="checkbox" checked={autoTaskSelection} onChange={(event) => setAutoTaskSelection(event.target.checked)} />
                Auto-select task types. If enabled, include DSL templates for all task types.
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-sm text-zinc-700">
                <input type="checkbox" checked={includeSlideTaskSuggestions} onChange={(event) => setIncludeSlideTaskSuggestions(event.target.checked)} />
                Always suggest a task or activity intention for each slide.
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-zinc-200 px-4 py-3 text-sm text-zinc-700">
                <input type="checkbox" checked={excludeInputTextTasks} onChange={(event) => {
                  const checked = event.target.checked;
                  setExcludeInputTextTasks(checked);
                  if (checked) {
                    setSelectedTasks((current) => current.filter((entry) => !INPUT_TEXT_TASKS.includes(entry)));
                  }
                }} />
                Exclude input-text tasks from the prompt and DSL examples.
              </label>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="border border-zinc-200 p-4">
                  <div className="mb-3 text-sm font-medium text-zinc-700">Slide types</div>
                  <div className="max-h-56 space-y-2 overflow-y-auto text-sm">
                    {SLIDE_REGISTRY.map((entry) => (
                      <label key={entry.type} className="flex items-center gap-2 text-zinc-700">
                        <input type="checkbox" checked={selectedSlides.includes(entry.type)} onChange={(event) => setSelectedSlides((current) => event.target.checked ? [...new Set([...current, entry.type])] : current.filter((item) => item !== entry.type))} />
                        {entry.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="border border-zinc-200 p-4">
                  <div className="mb-3 text-sm font-medium text-zinc-700">Task types</div>
                  <div className="max-h-56 space-y-2 overflow-y-auto text-sm">
                    {availableTasks.map((entry) => (
                      <label key={entry.type} className="flex items-center gap-2 text-zinc-700">
                        <input type="checkbox" disabled={autoTaskSelection} checked={selectedTasks.includes(entry.type)} onChange={(event) => setSelectedTasks((current) => event.target.checked ? [...new Set([...current, entry.type])] : current.filter((item) => item !== entry.type))} />
                        {entry.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-3xl border border-zinc-200 p-4">
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">DSL examples included in prompt</div>
                <div className="mt-3 grid gap-4 lg:grid-cols-2">
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs leading-6 text-zinc-700">{slideExamples || 'No slide examples selected.'}</pre>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs leading-6 text-zinc-700">{taskExamples || 'No task examples selected.'}</pre>
                </div>
              </div>
              <div className="rounded-3xl border border-zinc-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Generated prompt</div>
                    <div className="text-sm text-zinc-700">Use this in ChatGPT to generate lesson DSL.</div>
                  </div>
                  <button type="button" onClick={() => navigator.clipboard.writeText(prompt)} className="rounded-2xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50">Copy</button>
                </div>
                <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs leading-6 text-zinc-700">{prompt}</pre>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onApplyPreset?.({
                      lessonTitle: lessonTopic,
                      lessonTopic,
                      grammarTopic,
                      focus,
                      level,
                      difficulty,
                      templatePreset,
                      slideCount,
                      taskCount,
                      selectedSlides,
                      selectedTasks,
                      autoTaskSelection,
                      excludeInputTextTasks,
                      showHints: true,
                      showExplanations: true,
                    })}
                    className="rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    Apply As Starter Lesson
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
