function defineTask(type, label, kind, category, keywords, description, extra = {}) {
  return { type, label, kind, category, keywords, description, ...extra };
}

export const TASK_REGISTRY = [
  defineTask('multiple_choice', 'Multiple Choice', 'choice', 'Core Practice', ['choice', 'quiz', 'single answer'], 'Choose one correct option from a short list.'),
  defineTask('multi_select', 'Multi Select', 'choice', 'Core Practice', ['choice', 'checkbox', 'multiple answers'], 'Choose all options that apply.'),
  defineTask('true_false', 'True / False', 'choice', 'Core Practice', ['true', 'false', 'binary'], 'Decide whether a statement is correct.'),
  defineTask('yes_no', 'Yes / No', 'choice', 'Core Practice', ['yes', 'no', 'binary'], 'Quick binary response for checks and opinion prompts.'),
  defineTask('either_or', 'Either / Or', 'choice', 'Core Practice', ['choice', 'binary', 'compare'], 'Force a choice between two alternatives.'),
  defineTask('fill_typing', 'Fill Typing', 'text', 'Input', ['typing', 'gap fill', 'input'], 'Type the missing answer directly into a field.'),
  defineTask('short_answer', 'Short Answer', 'text', 'Input', ['typing', 'open answer', 'short text'], 'Capture a short written response.'),
  defineTask('long_answer', 'Long Answer', 'text', 'Input', ['writing', 'paragraph', 'extended response'], 'Collect a longer free-response answer.'),
  defineTask('drag_to_blank', 'Drag To Blank', 'text', 'Input', ['drag', 'gap fill', 'sentence'], 'Drag words or phrases into blank spaces.'),
  defineTask('type_in_blank', 'Type In Blank', 'text', 'Input', ['type', 'gap fill', 'blank', 'typing'], 'Type answers directly into blank spaces in a sentence.'),
  defineTask('match', 'Match Pairs', 'pairs', 'Matching', ['match', 'pairs', 'connect'], 'Match items from one side to another.'),
  defineTask('cards', 'Cards', 'pairs', 'Matching', ['cards', 'flashcards', 'pair review'], 'Flip or review paired front/back content.'),
  defineTask('drag_drop', 'Drag And Drop', 'pairs', 'Matching', ['drag', 'drop', 'sort'], 'Drag items into matching targets.'),
  defineTask('order', 'Order Sequence', 'collection', 'Sequencing', ['order', 'sequence', 'steps'], 'Arrange items into the correct order.'),
  defineTask('categorize', 'Categorize', 'collection', 'Sequencing', ['categories', 'sorting', 'grouping'], 'Sort items into categories.'),
  defineTask('fill_grid', 'Fill Grid', 'grid', 'Data Entry', ['grid', 'cells', 'matrix'], 'Legacy alias for the unified table builder task.', { hiddenFromLibrary: true, mergedInto: 'fill_table_matrix' }),
  defineTask('reading_highlight', 'Reading Highlight', 'text', 'Reading', ['reading', 'highlight', 'targets'], 'Highlight specific target words or phrases in a reading.'),
  defineTask('random_wheel', 'Random Wheel', 'collection', 'Speaking', ['wheel', 'random', 'speaking prompt'], 'Spin to generate speaking prompts or review topics.'),
  defineTask('audio_transcription', 'Audio Transcription', 'media', 'Listening', ['audio', 'transcription', 'dictation'], 'Listen and type what was said.'),
  defineTask('video_questions', 'Video Questions', 'media', 'Listening', ['video', 'questions', 'watch'], 'Attach questions to a video clip.'),
  defineTask('image_labeling', 'Image Labeling', 'media', 'Visual', ['image', 'label', 'diagram'], 'Label parts of an image or diagram.'),
  defineTask('hotspot_selection', 'Hotspot Selection', 'media', 'Visual', ['image', 'hotspot', 'click'], 'Select the correct area on an image.'),
  defineTask('timeline_order', 'Timeline Order', 'collection', 'Sequencing', ['timeline', 'order', 'events'], 'Arrange events in chronological order.'),
  defineTask('sentence_builder', 'Sentence Builder', 'collection', 'Writing', ['sentence', 'builder', 'word order'], 'Assemble a sentence from fragments.'),
  defineTask('dialogue_completion', 'Dialogue Completion', 'text', 'Writing', ['dialogue', 'completion', 'conversation'], 'Fill or complete a dialogue exchange.'),
  defineTask('error_correction', 'Error Correction', 'text', 'Grammar', ['grammar', 'edit', 'correction'], 'Spot and correct mistakes in a sentence.'),
  defineTask('pronunciation_shadowing', 'Pronunciation Shadowing', 'media', 'Speaking', ['pronunciation', 'shadowing', 'repeat'], 'Repeat or shadow spoken audio.'),
  defineTask('opinion_survey', 'Opinion Survey', 'choice', 'Discussion', ['survey', 'opinion', 'poll'], 'Collect learner opinions across fixed options.'),
  defineTask('scale', 'Scale Rating', 'choice', 'Discussion', ['scale', 'rating', 'likert'], 'Rate an answer on a simple numeric scale.'),
  defineTask('memory_recall', 'Memory Recall', 'text', 'Recall', ['memory', 'recall', 'retrieval'], 'Ask learners to recall information from memory.'),
  defineTask('compare_contrast_table', 'Compare Contrast Table', 'grid', 'Data Entry', ['compare', 'contrast', 'table'], 'Fill a table comparing two or more items.'),
  defineTask('map_geography_label', 'Map Geography Label', 'media', 'Visual', ['map', 'geography', 'label'], 'Place labels onto a map or diagram.'),
  defineTask('flash_response', 'Flash Response', 'text', 'Recall', ['quick response', 'flash', 'timed'], 'Collect a quick one-shot answer.'),
  defineTask('choose_and_explain', 'Choose And Explain', 'branch', 'Discussion', ['justify', 'choice', 'explain'], 'Choose an option and justify the decision.'),
  defineTask('scenario_decision', 'Scenario Decision', 'branch', 'Discussion', ['scenario', 'decision', 'branch'], 'Respond to a situation with a chosen action.'),
  defineTask('peer_review_checklist', 'Peer Review Checklist', 'collection', 'Review', ['peer review', 'checklist', 'feedback'], 'Review work using checklist criteria.'),
  defineTask('fill_table_matrix', 'Table Builder', 'grid', 'Data Entry', ['matrix', 'table', 'fill', 'cells', 'grid'], 'Complete structured table or matrix cells with one unified editor.'),
  defineTask('table_reveal', 'Table Reveal', 'grid', 'Data Entry', ['table', 'reveal', 'hidden cells'], 'Show a table with hidden cells or rows that learners reveal step by step.'),
  defineTask('matching_pairs_categories', 'Matching Categories', 'pairs', 'Matching', ['categories', 'pairs', 'matching'], 'Match terms while grouping them by category.'),
  defineTask('story_reconstruction', 'Story Reconstruction', 'collection', 'Sequencing', ['story', 'sequence', 'reconstruction'], 'Rebuild a narrative from mixed parts.'),
  defineTask('image_compare_spot', 'Image Compare Spot', 'media', 'Visual', ['image', 'compare', 'difference'], 'Compare two images and find differences.'),
  defineTask('justify_order', 'Justify Order', 'branch', 'Sequencing', ['order', 'justify', 'reasoning'], 'Arrange items and explain the ordering.'),
  defineTask('keyword_expand', 'Keyword Expand', 'text', 'Writing', ['keywords', 'expand', 'sentence'], 'Turn keywords into complete sentences.'),
  defineTask('word_family_builder', 'Word Family Builder', 'collection', 'Vocabulary', ['word family', 'morphology', 'forms'], 'Build related forms from a root word.'),
  defineTask('emoji_symbol_match', 'Emoji Symbol Match', 'pairs', 'Matching', ['emoji', 'symbol', 'match'], 'Match symbols or emoji to meaning.'),
  defineTask('conditional_branch_questions', 'Conditional Branch Questions', 'branch', 'Discussion', ['branch', 'conditional', 'follow-up'], 'Show or plan follow-up questions based on choice.'),
  defineTask('highlight_differences', 'Highlight Differences', 'text', 'Reading', ['highlight', 'differences', 'compare'], 'Mark differences between sentences or texts.'),
  defineTask('categorize_grammar', 'Categorize Grammar', 'collection', 'Grammar', ['grammar', 'sort', 'categorize'], 'Sort examples by grammar rule or pattern.'),
  defineTask('puzzle_jigsaw', 'Puzzle Jigsaw', 'grid', 'Sequencing', ['puzzle', 'jigsaw', 'assemble'], 'Assemble a larger answer from smaller pieces.'),
  defineTask('highlight_mistake', 'Highlight Mistake', 'text', 'Grammar', ['highlight', 'mistake', 'error'], 'Highlight the incorrect part of a sentence.'),
  defineTask('select_and_correct', 'Select And Correct', 'text', 'Grammar', ['select', 'correct', 'error', 'fix'], 'Select the incorrect word and type the correction.'),
  defineTask('drag_match', 'Drag Match', 'pairs', 'Matching', ['drag', 'match', 'drop', 'definitions'], 'Drag items onto their matching definitions or targets.'),
  defineTask('table_drag', 'Table Drag', 'grid', 'Data Entry', ['table', 'drag', 'cells', 'grid'], 'Drag answer options into the correct table cells.'),
  defineTask('dialogue_fill', 'Dialogue Fill', 'text', 'Writing', ['dialogue', 'fill', 'conversation', 'blanks'], 'Fill in missing words within a dialogue exchange.'),
  defineTask('dialogue_reconstruct', 'Dialogue Reconstruct', 'collection', 'Sequencing', ['dialogue', 'reconstruct', 'order', 'conversation'], 'Reorder scrambled dialogue messages into the correct sequence.'),
  defineTask('youtube', 'YouTube Video', 'media', 'Listening', ['youtube', 'video', 'watch', 'embed'], 'Embed a YouTube video with optional timestamp questions.'),
];

export const TASK_TYPE_MAP = Object.fromEntries(TASK_REGISTRY.map((entry) => [entry.type, entry]));

const LEGACY_TASK_MAP = {
  fill_grid: 'fill_table_matrix',
};

export function getTaskDefinition(taskType) {
  return TASK_TYPE_MAP[taskType] || TASK_TYPE_MAP[LEGACY_TASK_MAP[taskType]] || { type: taskType, label: taskType, kind: 'generic', category: 'Other', keywords: [], description: '' };
}

export function taskRegexEntries() {
  return [
    ...TASK_REGISTRY.map((entry) => ({
      regex: new RegExp(`^#TASK:\\s*${entry.type.replace(/_/g, '[_\\s-]*').toUpperCase()}$`, 'i'),
      type: 'task',
      taskType: entry.type,
    })),
    {
      regex: /^#TASK:\s*FILL[_\s-]*GRID$/i,
      type: 'task',
      taskType: 'fill_table_matrix',
    },
  ];
}
