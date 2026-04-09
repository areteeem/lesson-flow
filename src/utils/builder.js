import { generateDSL } from '../parser';
import { SLIDE_REGISTRY } from '../config/slideRegistry';
import { TASK_REGISTRY, TASK_TYPE_MAP } from '../config/taskRegistry';

function makeId() {
  return crypto.randomUUID();
}

function withIds(block) {
  return {
    ...block,
    id: block.id || makeId(),
    ref: block.ref || block.id || makeId(),
    children: block.children?.map(withIds),
  };
}

export function cloneBlockTree(block) {
  if (!block) return block;
  const nextId = makeId();
  return {
    ...block,
    id: nextId,
    ref: block.type === 'task' || block.type === 'group' || block.type === 'split_group' ? `${block.type === 'task' ? block.taskType || 'task' : block.type === 'split_group' ? 'split-group' : 'group'}-${nextId}` : nextId,
    children: (block.children || []).map((child) => cloneBlockTree(child)),
  };
}

const SLIDE_PRESETS = {
  slide: {
    title: 'Lesson opener',
    instruction: 'Introduce the topic with markdown formatting.',
    content: '# Welcome\nUse **bold**, *italic*, and lists to guide the learner.\n\n- State the goal\n- Preview the task flow\n- End with a key question',
    notes: ['Use markdown for slides: headings, lists, tables, quotes, and emphasis.'],
  },
  rich: {
    title: 'Rich explanation',
    content: '## Grammar focus\nThe **present simple** describes habits and facts.\n\n> Use it for routines, schedules, and permanent situations.\n\n1. Subject\n2. Base verb\n3. Add `-s` for *he / she / it*',
    examples: ['**She works** in a clinic.', '*They play* after class.'],
  },
  structure: {
    title: 'Sentence structure',
    positive: '**Subject** + base verb',
    negative: '**Subject** + do/does not + base verb',
    question: 'Do/Does + **subject** + base verb?',
    examples: ['He works every day.', 'Does she study English?'],
  },
  table: {
    title: 'Comparison table',
    columns: ['Pronoun', 'Verb'],
    rows: [['I / You / We / They', 'work'], ['He / She / It', 'works']],
  },
  two_column_text_task: {
    title: 'Read and respond',
    left: '### Reading\nMaya walks to school every morning and studies after lunch.',
    right: '### Task prompts\n- Find the verbs\n- Describe Maya\'s routine\n- Compare it to your own',
  },
  image_task: {
    title: 'Image analysis',
    right: '### Observe\nDescribe the scene and label the important parts.',
    media: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80',
  },
  video_task: {
    title: 'Video task',
    right: '### While you watch\n1. Note the main point\n2. Capture one supporting detail\n3. Summarize in one sentence',
    media: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  },
  carousel: {
    title: 'Swipe through the key ideas',
    steps: ['### Step 1\nPreview the lesson goal.', '### Step 2\nRead the example and note the pattern.', '### Step 3\nApply the pattern in a task.'],
  },
  group_task_slide: {
    title: 'Practice set',
    taskRefs: ['task-mc', 'task-gap', 'task-reflect'],
  },
  step_by_step: {
    title: 'Process walk-through',
    steps: ['Read the prompt.', 'Spot the verb form.', 'Check the subject.', 'Write the final answer.'],
  },
  focus: {
    title: 'Key takeaways',
    keywords: ['routine', 'fact', 'signal word'],
    content: 'Use the focus keywords to anchor the rule before moving to practice.',
  },
  flashcard_slide: {
    title: 'Flashcards',
    cards: [{ front: 'habit', back: 'something done regularly' }, { front: 'fact', back: 'something always true' }],
  },
  scenario: {
    title: 'Dialogue scene',
    dialogue: 'A: What time do you start class?\nB: I start at nine.\nA: Do you walk to school?\nB: Yes, I do.',
  },
  map_diagram: {
    title: 'Diagram or map',
    media: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1200&q=80',
    content: 'Use the diagram to support your explanation with markdown labels and callouts.',
  },
};

const TASK_PRESETS = {
  multiple_choice: {
    ref: 'task-mc',
    question: 'Which sentence uses the present simple correctly?',
    options: ['She go to school at eight.', 'She goes to school at eight.', 'She going to school at eight.'],
    answer: 'She goes to school at eight.',
    hint: 'Look for the third-person singular form.',
  },
  multi_select: {
    question: 'Which are signal words for routines?',
    options: ['always', 'usually', 'yesterday', 'every day'],
    answer: ['always', 'usually', 'every day'],
    multiple: true,
  },
  true_false: {
    question: 'Present simple can describe habits.',
    options: ['True', 'False'],
    answer: 'True',
  },
  yes_no: {
    question: 'Do you use the present simple for facts?',
    options: ['Yes', 'No'],
    answer: 'Yes',
  },
  either_or: {
    question: 'Choose the better explanation.',
    options: ['Use present simple for routines.', 'Use present simple for finished past events.'],
    answer: 'Use present simple for routines.',
  },
  fill_typing: {
    ref: 'task-gap',
    question: 'Type the missing verb.',
    text: 'Maya ___ to school at 8 a.m.',
    answer: 'goes',
  },
  short_answer: {
    question: 'Write one sentence about your morning routine.',
    text: 'Use the present simple and one time expression.',
    answer: 'I wake up at 7 a.m.',
  },
  long_answer: {
    question: 'Describe a classmate\'s daily routine.',
    text: 'Write 3-4 sentences with at least two frequency words.',
    answer: 'Open response',
  },
  drag_to_blank: {
    question: 'Drag the missing words into the sentence.',
    text: 'He {} to work by {} every {}.',
    blanks: ['goes', 'bus', 'morning'],
    answer: ['goes', 'bus', 'morning'],
  },
  match: {
    question: 'Match the term to its meaning.',
    pairs: [{ left: 'routine', right: 'something you do regularly' }, { left: 'fact', right: 'something always true' }],
  },
  cards: {
    question: 'Review the flashcards.',
    pairs: [{ left: 'subject', right: 'who or what does the action' }, { left: 'verb', right: 'the action word' }],
    cards: [{ front: 'subject', back: 'who or what does the action' }, { front: 'verb', back: 'the action word' }],
  },
  drag_drop: {
    question: 'Drag each prompt to the matching response.',
    pairs: [{ left: 'Do you study every day?', right: 'Yes, I do.' }, { left: 'Does she like math?', right: 'No, she doesn\'t.' }],
  },
  order: {
    question: 'Put the sentence parts in order.',
    items: ['She', 'goes', 'to school', 'at eight'],
  },
  categorize: {
    question: 'Sort the examples by meaning.',
    items: ['I walk to school.', 'The sun rises in the east.', 'She studies every evening.'],
    categories: ['Habit', 'Fact'],
  },
  fill_grid: {
    question: 'Complete the grid with the correct verb forms.',
    rows: [['I', 'work'], ['He', 'works']],
  },
  reading_highlight: {
    question: 'Highlight all the present simple verbs.',
    text: 'Tom lives in Kyiv and studies English after school.',
    targets: ['lives', 'studies'],
  },
  highlight_glossary: {
    question: 'Highlight the useful vocabulary in the text.',
    text: 'Tom lives in Kyiv and studies English after school.',
    targets: ['Kyiv', 'studies'],
    pairs: [{ left: 'Kyiv', right: 'Київ' }, { left: 'studies', right: 'навчається' }],
  },
  random_wheel: {
    question: 'Spin for a speaking topic.',
    items: ['your school day', 'your weekend', 'a family routine', 'a friend\'s habit'],
    timeLimit: 30,
    repeat: true,
  },
  audio_transcription: {
    question: 'Listen and transcribe the sentence.',
    media: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3',
    text: 'Type what you hear and then correct it into a full sentence.',
  },
  video_questions: {
    question: 'Watch and answer.',
    media: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    text: 'What is the main action in the clip?',
  },
  image_labeling: {
    question: 'Label the classroom diagram.',
    media: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1200&q=80',
    items: ['desk', 'board', 'window'],
  },
  hotspot_selection: {
    question: 'Select the object the teacher uses most.',
    media: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80',
    text: 'Use the image to justify your answer.',
  },
  timeline_order: {
    question: 'Put the daily routine in order.',
    items: ['wake up', 'eat breakfast', 'go to school', 'do homework'],
  },
  sentence_builder: {
    question: 'Build a correct sentence.',
    items: ['my brother', 'plays', 'football', 'after school'],
  },
  dialogue_completion: {
    question: 'Complete the dialogue.',
    text: 'A: What time ___ you start?\nB: I ___ at nine.',
    answer: 'do | start',
  },
  error_correction: {
    question: 'Correct the error.',
    text: 'She walk to school every day.',
    answer: 'She walks to school every day.',
  },
  pronunciation_shadowing: {
    question: 'Repeat the sentence after the audio.',
    media: 'https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3',
    text: 'Focus on rhythm and stress.',
  },
  opinion_survey: {
    question: 'How often do you review grammar?',
    options: ['Every day', 'A few times a week', 'Rarely'],
    answer: 'Every day',
  },
  scale: {
    question: 'Rate your confidence with present simple.',
    min: 1,
    max: 5,
    answer: '4',
  },
  memory_recall: {
    question: 'Without looking back, write two signal words.',
    text: 'Recall from memory.',
    answer: 'always | usually',
  },
  compare_contrast_table: {
    question: 'Compare present simple and present continuous.',
    rows: [['Present simple', 'habit'], ['Present continuous', 'action now']],
  },
  map_geography_label: {
    question: 'Label the places on the map.',
    media: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=1200&q=80',
    items: ['north', 'river', 'capital'],
  },
  flash_response: {
    question: 'Answer in five seconds: what is one daily habit?',
    text: 'Write the first correct answer that comes to mind.',
    answer: 'I read every night.',
  },
  choose_and_explain: {
    ref: 'task-reflect',
    question: 'Choose the better sentence and explain why.',
    text: 'A. She walk to school.\nB. She walks to school.',
    answer: 'B',
  },
  scenario_decision: {
    question: 'A learner forgets the third-person -s. What do you tell them?',
    text: 'Choose a response and justify it.',
    answer: 'Remind them that he/she/it takes -s.',
  },
  peer_review_checklist: {
    question: 'Review your partner\'s paragraph.',
    items: ['Has a clear topic sentence', 'Uses present simple accurately', 'Includes time expressions'],
  },
  fill_table_matrix: {
    question: 'Fill the table.',
    columns: ['Subject', 'Verb'],
    rows: [['I / You / We / They', 'work'], ['He / She / It', 'works']],
  },
  table_reveal: {
    question: 'Reveal the hidden values in the table.',
    columns: ['Subject', 'Verb'],
    rows: [['I / You / We / They', 'work'], ['He / She / It', 'works']],
    revealMode: 'manual',
    hiddenCells: ['0:1', '1:1'],
    randomHiddenCount: 2,
  },
  matching_pairs_categories: {
    question: 'Match the example to its category.',
    pairs: [{ left: 'She studies every day.', right: 'Habit' }, { left: 'Water boils at 100°C.', right: 'Fact' }],
    categories: ['Habit', 'Fact'],
  },
  story_reconstruction: {
    question: 'Rebuild the short story in order.',
    items: ['Maya wakes up.', 'She eats breakfast.', 'She walks to school.', 'She studies English.'],
  },
  image_compare_spot: {
    question: 'Compare the two classroom scenes.',
    media: 'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1200&q=80',
    text: 'Spot and describe three differences.',
  },
  justify_order: {
    question: 'Order the steps and explain your reasoning.',
    items: ['identify the subject', 'choose the tense', 'check the verb ending', 'read the full sentence'],
  },
  keyword_expand: {
    question: 'Turn the keywords into a full sentence.',
    text: 'she / study / library / every Friday',
    answer: 'She studies in the library every Friday.',
  },
  word_family_builder: {
    question: 'Build the word family from the root.',
    items: ['teach', 'teacher', 'teaching', 'taught'],
  },
  emoji_symbol_match: {
    question: 'Match the symbol to the meaning.',
    pairs: [{ left: 'clock', right: 'daily routine' }, { left: 'books', right: 'study' }],
  },
  conditional_branch_questions: {
    question: 'If the learner chooses the wrong form, what follow-up do they get?',
    text: 'Branch A: explain the rule.\nBranch B: show another example.',
    answer: 'Branch A',
  },
  highlight_differences: {
    question: 'Highlight what changed.',
    text: 'He walk to school.\nHe walks to school.',
    targets: ['walk', 'walks'],
  },
  categorize_grammar: {
    question: 'Sort the examples by grammar rule.',
    items: ['She walks', 'They walk', 'Does he work?', 'He does not work'],
    categories: ['affirmative', 'negative', 'question'],
  },
  puzzle_jigsaw: {
    question: 'Assemble the idea map.',
    rows: [['subject', 'verb'], ['time', 'detail']],
  },
  highlight_mistake: {
    question: 'Highlight the mistake in the sentence.',
    text: 'She go to school every day.',
    answer: 'go',
    instruction: 'Tap the word that is incorrect.',
  },
  select_and_correct: {
    question: 'Select the incorrect word and correct it.',
    text: 'He don\'t like apples.',
    answer: 'doesn\'t',
    instruction: 'Tap the wrong word, then type the correction.',
  },
  drag_match: {
    question: 'Drag each item to its matching definition.',
    pairs: [
      { left: 'apple', right: 'a round fruit' },
      { left: 'carrot', right: 'an orange vegetable' },
      { left: 'bread', right: 'baked from flour' },
    ],
  },
  table_drag: {
    question: 'Drag the correct verb form into each cell.',
    columns: ['Pronoun', 'Verb'],
    rows: [['I / You / We / They', 'work'], ['He / She / It', 'works']],
    hiddenCells: ['0:1', '1:1'],
    options: ['work', 'works', 'working'],
  },
  dialogue_fill: {
    question: 'Fill in the missing words in the dialogue.',
    text: 'A: What time [1] you start?\nB: I [2] at nine.\nA: [3] you walk to school?\nB: Yes, I [4].',
    answer: 'do | start | Do | do',
    hint: 'Use the correct form of "do" and the base verb.',
  },
  dialogue_reconstruct: {
    question: 'Put the dialogue in the correct order.',
    text: 'A: Good morning! How are you?\nB: I\'m fine, thanks. And you?\nA: Great! Are you ready for the test?\nB: Yes, I studied all night.\nA: Good luck!',
    targets: ['0'],
    hint: 'The first message is pinned. Drag the rest into order.',
  },
  word_hide_reveal: {
    question: 'Read the text and reveal the hidden words.',
    text: 'The quick brown fox jumps over the lazy dog near the river.',
    focusWords: ['quick', 'jumps', 'lazy'],
    hideMode: 'reveal',
    hideCount: 2,
    hideMinLength: 3,
  },
  word_hide_drag: {
    question: 'Drag the missing words back into the text.',
    text: 'The quick brown fox jumps over the lazy dog near the river.',
    focusWords: ['quick', 'jumps', 'lazy'],
    hideMode: 'drag',
    hideCount: 2,
    hideMinLength: 3,
  },
  word_hide_type: {
    question: 'Type the missing words to complete the text.',
    text: 'The quick brown fox jumps over the lazy dog near the river.',
    focusWords: ['quick', 'jumps', 'lazy'],
    hideMode: 'type',
    hideCount: 2,
    hideMinLength: 3,
  },
};

export function createDefaultBlock(type, { blank = false } = {}) {
  const normalizedType = type === 'fill_grid' ? 'fill_table_matrix' : type;
  const id = makeId();
  if (normalizedType === 'group') {
    const children = [
      createDefaultBlock('multiple_choice', { blank }),
      createDefaultBlock('fill_typing', { blank }),
    ];
    return {
      id,
      ref: `group-${id}`,
      type: 'group',
      title: blank ? '' : 'Practice Group',
      instruction: blank ? '' : 'Drop tasks here to build a nested practice set.',
      enabled: true,
      children,
      layout: 'tabs',
      itemRefs: children.map((child) => child.ref),
    };
  }

  if (normalizedType === 'split_group') {
    const children = [
      createDefaultBlock('multiple_choice', { blank }),
      createDefaultBlock('fill_typing', { blank }),
    ];
    return {
      id,
      ref: `split-group-${id}`,
      type: 'split_group',
      title: blank ? '' : 'Split Group',
      instruction: blank ? '' : 'Two tasks displayed side by side.',
      enabled: true,
      children,
      layout: 'split',
      itemRefs: children.map((child) => child.ref),
    };
  }

  const isSlide = SLIDE_REGISTRY.some((entry) => entry.type === normalizedType);
  if (isSlide) {
    return withIds({
      type: normalizedType,
      instruction: '',
      enabled: true,
      text: '',
      examples: [],
      notes: [],
      ...(blank ? {} : SLIDE_PRESETS[normalizedType]),
    });
  }

  const definition = TASK_TYPE_MAP[normalizedType] || { type: normalizedType, label: normalizedType };
  return withIds({
    type: 'task',
    taskType: normalizedType,
    title: '',
    question: '',
    instruction: '',
    hint: '',
    explanation: '',
    enabled: true,
    options: [],
    answer: '',
    correct: '',
    items: [],
    blanks: [],
    text: '',
    pairs: [],
    cards: [],
    targets: [],
    media: undefined,
    rows: undefined,
    columns: undefined,
    categories: undefined,
    hiddenRows: undefined,
    hiddenCells: undefined,
    revealMode: undefined,
    randomHiddenCount: undefined,
    min: type === 'scale' ? 1 : undefined,
    max: type === 'scale' ? 5 : undefined,
    multiple: normalizedType === 'multi_select',
    timeLimit: normalizedType === 'random_wheel' ? 30 : undefined,
    repeat: normalizedType === 'random_wheel',
    shuffle: normalizedType !== 'random_wheel',
    ...(blank ? {} : TASK_PRESETS[normalizedType]),
  });
}

export function findBlockById(blocks, blockId) {
  for (const block of blocks || []) {
    if (block.id === blockId) return block;
    if (block.children?.length) {
      const child = findBlockById(block.children, blockId);
      if (child) return child;
    }
  }
  return null;
}

export function updateBlockInTree(blocks, blockId, updater) {
  return (blocks || []).map((block) => {
    if (block.id === blockId) return updater(block);
    if (block.children?.length) {
      return { ...block, children: updateBlockInTree(block.children, blockId, updater) };
    }
    return block;
  });
}

export function deleteBlockFromTree(blocks, blockId) {
  return (blocks || []).flatMap((block) => {
    if (block.id === blockId) return [];
    if (block.children?.length) {
      return [{ ...block, children: deleteBlockFromTree(block.children, blockId) }];
    }
    return [block];
  });
}

export function addBlockToGroup(blocks, groupId, block, insertIndex = null) {
  return updateBlockInTree(blocks, groupId, (group) => {
    const children = [...(group.children || [])];
    const index = insertIndex === null ? children.length : Math.max(0, Math.min(insertIndex, children.length));
    children.splice(index, 0, block);
    return { ...group, children, itemRefs: children.map((child) => child.ref) };
  });
}

export function reorderChildrenInGroup(blocks, groupId, childId, targetIndex) {
  return updateBlockInTree(blocks, groupId, (group) => {
    const children = [...(group.children || [])];
    const sourceIndex = children.findIndex((child) => child.id === childId);
    if (sourceIndex === -1) return group;
    const [moved] = children.splice(sourceIndex, 1);
    const insertIndex = Math.max(0, Math.min(targetIndex, children.length));
    children.splice(insertIndex, 0, moved);
    return { ...group, children, itemRefs: children.map((child) => child.ref) };
  });
}

export function updateBlockField(block, field, value) {
  if (['options', 'items', 'examples', 'notes', 'targets', 'blanks', 'keywords', 'taskRefs', 'categories', 'steps', 'hiddenRows', 'hiddenCells'].includes(field)) {
    return { ...block, [field]: value.split('\n').map((item) => item.trim()).filter(Boolean) };
  }
  if (field === 'pairsText') {
    const parsedPairs = value.split('\n').map((line) => {
      const [left, right] = line.split('=>').map((item) => item.trim());
      return { left: left || '', right: right || '' };
    }).filter((pair) => pair.left || pair.right);
    return {
      ...block,
      pairs: parsedPairs,
      cards: parsedPairs.map((pair) => ({ front: pair.left, back: pair.right })),
    };
  }
  if (field === 'rowsText') {
    return {
      ...block,
      rows: value.split('\n').map((line) => line.split('|').map((cell) => cell.trim())).filter((row) => row.some(Boolean)),
    };
  }
  if (field === 'columnsText') {
    return {
      ...block,
      columns: value.split('|').map((cell) => cell.trim()).filter(Boolean),
    };
  }
  if (field === 'enabled' || field === 'multiple' || field === 'repeat' || field === 'shuffle') {
    return { ...block, [field]: value };
  }
  return { ...block, [field]: value };
}

export function createLessonTemplate(kind = 'blank') {
  const baseSlide = createDefaultBlock('slide');
  const baseSettings = {
    showHints: true,
    showExplanations: true,
    grammarTopic: '',
    lessonTopic: '',
    focus: '',
    difficulty: '',
  };
  if (kind === 'grammar') {
    return {
      id: makeId(),
      title: 'New Grammar Lesson',
      settings: { ...baseSettings, grammarTopic: 'Present Simple', focus: 'grammar', difficulty: 'A2' },
      blocks: [
        { ...createDefaultBlock('structure'), title: 'Grammar Point' },
        createDefaultBlock('multiple_choice'),
      ],
      warnings: [],
      lesson: { title: 'New Grammar Lesson', slides: [], tasks: [] },
    };
  }
  if (kind === 'vocabulary') {
    return {
      id: makeId(),
      title: 'New Vocabulary Lesson',
      settings: { ...baseSettings, lessonTopic: 'Daily routines', focus: 'vocabulary', difficulty: 'A2' },
      blocks: [
        { ...baseSlide, title: 'Vocabulary Set', content: '## Target words\n- routine\n- schedule\n- habit\n- fact' },
        createDefaultBlock('cards'),
      ],
      warnings: [],
      lesson: { title: 'New Vocabulary Lesson', slides: [], tasks: [] },
    };
  }
  if (kind === 'reading') {
    return {
      id: makeId(),
      title: 'New Reading Lesson',
      settings: { ...baseSettings, lessonTopic: 'School day', focus: 'reading', difficulty: 'B1' },
      blocks: [
        { ...createDefaultBlock('two_column_text_task'), title: 'Reading + Tasks' },
        createDefaultBlock('reading_highlight'),
      ],
      warnings: [],
      lesson: { title: 'New Reading Lesson', slides: [], tasks: [] },
    };
  }
  if (kind === 'catalog') {
    return createCatalogLesson();
  }
  return {
    id: makeId(),
    title: 'Untitled Lesson',
    settings: baseSettings,
    blocks: [
      { ...baseSlide, title: 'Lesson Title', content: '## Start here\nAdd your first slide content here with **markdown** formatting.' },
    ],
    warnings: [],
    lesson: { title: 'Untitled Lesson', slides: [], tasks: [] },
  };
}

export function createPromptPresetLesson(config = {}, existingLesson = null) {
  const templateKind = ['grammar', 'vocabulary', 'reading'].includes(config.templatePreset) ? config.templatePreset : 'blank';
  const baseLesson = existingLesson ? { ...existingLesson } : createLessonTemplate(templateKind);
  const settings = {
    ...(baseLesson.settings || {}),
    lessonTopic: config.lessonTopic || baseLesson.settings?.lessonTopic || '',
    grammarTopic: config.grammarTopic || baseLesson.settings?.grammarTopic || '',
    focus: config.focus || baseLesson.settings?.focus || '',
    difficulty: config.level || config.difficulty || baseLesson.settings?.difficulty || '',
    showHints: config.showHints ?? baseLesson.settings?.showHints ?? true,
    showExplanations: config.showExplanations ?? baseLesson.settings?.showExplanations ?? true,
  };

  const shouldSeedBlocks = !existingLesson || !(existingLesson.blocks || []).length || existingLesson.title === 'Untitled Lesson';
  const nextBlocks = shouldSeedBlocks
    ? [
        ...(config.selectedSlides || []).slice(0, Math.max(config.slideCount || 3, 1)).map((type) => createDefaultBlock(type)),
        ...((config.autoTaskSelection ? TASK_REGISTRY.map((entry) => entry.type) : (config.selectedTasks || [])).slice(0, Math.max(config.taskCount || 3, 1)).map((type) => createDefaultBlock(type))),
      ]
    : (baseLesson.blocks || []);

  return {
    ...baseLesson,
    title: config.lessonTitle || config.lessonTopic || baseLesson.title || 'Untitled Lesson',
    settings,
    blocks: nextBlocks.length > 0 ? nextBlocks : baseLesson.blocks,
  };
}

function lines(value) {
  return Array.isArray(value) ? value.join('\n') : value || '';
}

export function getTaskDslExample(type) {
  return generateDSL({ title: 'Task Example', blocks: [createDefaultBlock(type)] });
}

export function getSlideDslExample(type) {
  return generateDSL({ title: 'Slide Example', blocks: [createDefaultBlock(type)] });
}

export function serializeBlockField(block, field) {
  if (field === 'pairsText') {
    return ((block.pairs?.length ? block.pairs.map((pair) => `${pair.left} => ${pair.right}`) : block.cards?.map((card) => `${card.front} => ${card.back}`)) || []).join('\n');
  }
  if (field === 'rowsText') return lines((block.rows || []).map((row) => row.join(' | ')));
  if (field === 'columnsText') return lines(block.columns || []).replace(/\n/g, ' | ');
  return Array.isArray(block[field]) ? lines(block[field]) : (block[field] || '');
}

export function getTaskCategories() {
  return [...new Set(TASK_REGISTRY.map((entry) => entry.category))].filter(Boolean);
}

export function createCatalogLesson() {
  const slideBlocks = SLIDE_REGISTRY.map((entry) => createDefaultBlock(entry.type));
  const taskBlocks = TASK_REGISTRY.map((entry) => createDefaultBlock(entry.type));
  const nestedGroup = {
    ...createDefaultBlock('group'),
    title: 'Nested Group Example',
    instruction: 'Use this group to test nested editing, tabbing, drag-drop, and DSL round-tripping.',
    children: [createDefaultBlock('multiple_choice'), createDefaultBlock('drag_to_blank'), createDefaultBlock('choose_and_explain')],
  };
  nestedGroup.itemRefs = nestedGroup.children.map((child) => child.ref);

  return {
    id: makeId(),
    title: 'All Slide And Task Types',
    settings: { showHints: true, showExplanations: true, grammarTopic: '', lessonTopic: 'Full catalog', focus: 'mixed', difficulty: 'B1' },
    blocks: [...slideBlocks, nestedGroup, ...taskBlocks],
    warnings: [],
    lesson: { title: 'All Slide And Task Types', slides: [], tasks: [] },
  };
}

export function getCatalogDsl() {
  return generateDSL(createCatalogLesson());
}
