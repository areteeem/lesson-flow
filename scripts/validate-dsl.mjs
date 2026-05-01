import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const fixtures = [
  {
    name: 'choice + points fixture',
    dsl: `#LESSON
Title: Present Simple Drill

#TASK: MULTIPLE_CHOICE
Question: Which sentence is correct?
Options:
He go to school.
He goes to school.
He going to school.
He gone to school.
Answer: He goes to school.
Points: 2
`,
  },
  {
    name: 'blank + categorize fixture',
    dsl: `#LESSON
Title: Mixed practice

#TASK: DRAG_TO_BLANK
Question: Complete the sentence.
Text:
She [1] to school by [2].
Blanks:
goes
bus
Options:
train
run

#TASK: CATEGORIZE
Question: Sort by type.
Categories:
Habit
Fact
Items:
He studies every day. => Habit
The sun rises in the east. => Fact
`,
  },
  {
    name: 'media fixture',
    dsl: `#LESSON
Title: Media task

#TASK: YOUTUBE
Question: Watch and answer.
Media: https://www.youtube.com/watch?v=dQw4w9WgXcQ
`,
  },
];

function parseBlocks(dsl) {
  const blocks = [];
  const lines = dsl.replace(/\r\n/g, '\n').split('\n');
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('#')) {
      current = { marker: trimmed, fields: new Map(), lists: new Map() };
      blocks.push(current);
      continue;
    }

    if (!current) continue;

    const fieldMatch = /^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (fieldMatch) {
      const key = fieldMatch[1];
      const value = fieldMatch[2];
      if (value) {
        current.fields.set(key, value);
      } else {
        current.lists.set(key, []);
      }
      continue;
    }

    const listKeys = [...current.lists.keys()];
    if (listKeys.length > 0) {
      const lastList = listKeys[listKeys.length - 1];
      current.lists.get(lastList).push(trimmed);
    }
  }

  return blocks;
}

function validateFixture(entry) {
  const errors = [];
  const blocks = parseBlocks(entry.dsl);

  if (blocks.length === 0 || blocks[0].marker !== '#LESSON') {
    errors.push('DSL must start with #LESSON.');
  }

  for (const block of blocks) {
    if (block.marker.startsWith('#TASK: MULTIPLE_CHOICE')) {
      const options = block.lists.get('Options') || [];
      const answer = (block.fields.get('Answer') || '').trim();
      if (options.length < 3) errors.push('MULTIPLE_CHOICE requires at least 3 options.');
      if (answer && !options.includes(answer)) {
        errors.push(`Answer "${answer}" is not one of Options.`);
      }
    }

    if (block.marker.startsWith('#TASK: DRAG_TO_BLANK')) {
      const text = block.lists.get('Text')?.join(' ') || block.fields.get('Text') || '';
      const blanks = block.lists.get('Blanks') || [];
      const blankCount = (text.match(/\[[0-9]+\]|\{\}|___|\[blank\]/g) || []).length;
      if (blankCount !== blanks.length) {
        errors.push(`DRAG_TO_BLANK blank count mismatch: text=${blankCount}, blanks=${blanks.length}.`);
      }
    }

    if (block.marker.startsWith('#TASK: CATEGORIZE')) {
      const categories = block.lists.get('Categories') || [];
      const items = block.lists.get('Items') || [];
      if (categories.length < 2) errors.push('CATEGORIZE requires at least 2 categories.');
      for (const item of items) {
        if (!item.includes('=>')) errors.push(`CATEGORIZE item missing mapping: ${item}`);
      }
    }

    if (block.marker.startsWith('#TASK: YOUTUBE')) {
      const media = (block.fields.get('Media') || '').trim();
      if (!/^https?:\/\//.test(media)) errors.push('YOUTUBE task requires raw Media URL.');
    }
  }

  return errors;
}

function validatePromptSpecText() {
  const promptFilePath = path.join(root, 'src', 'config', 'dslPromptTemplates.js');
  const source = fs.readFileSync(promptFilePath, 'utf8');
  const requiredSnippets = [
    'Points: N',
    'For media tasks, use **Media:** as canonical source',
    'Output pure DSL only',
    'Use plain ASCII punctuation',
    'Parser safety checklist before final output',
  ];

  const missing = requiredSnippets.filter((snippet) => !source.includes(snippet));
  return missing;
}

let hasFailure = false;

function validateDslMetadataRoundTripContract() {
  const parserSource = fs.readFileSync(path.join(root, 'src', 'parser.js'), 'utf8');
  const aiBridgeSource = fs.readFileSync(path.join(root, 'src', 'utils', 'aiBridge.js'), 'utf8');
  const errors = [];

  if (!parserSource.includes('parseInlineSettingList(rawData.focus)')) {
    errors.push('parser.js must normalize Focus with parseInlineSettingList().');
  }

  if (!parserSource.includes('parseInlineSettingList(rawData.difficulty)')) {
    errors.push('parser.js must normalize Difficulty with parseInlineSettingList().');
  }

  if (!aiBridgeSource.includes("Focus: ${focus.join(', ')}")) {
    errors.push('aiBridge.js must serialize Focus using comma-delimited lesson metadata.');
  }

  if (!aiBridgeSource.includes("Difficulty: ${difficulty.join(', ')}")) {
    errors.push('aiBridge.js must serialize Difficulty using comma-delimited lesson metadata.');
  }

  return errors;
}

function validatePromptValidationHooks() {
  const apiSource = fs.readFileSync(path.join(root, 'api', 'ai.js'), 'utf8');
  const bridgeSource = fs.readFileSync(path.join(root, 'src', 'utils', 'aiBridge.js'), 'utf8');
  const errors = [];

  if (!apiSource.includes('validateAiPromptRequest')) {
    errors.push('api/ai.js must validate prompt requests before proxying upstream.');
  }

  if (!bridgeSource.includes('validateAiPromptRequest')) {
    errors.push('src/utils/aiBridge.js must validate prompt requests before sending them.');
  }

  if (!bridgeSource.includes('getBlockingDslIssues')) {
    errors.push('src/utils/aiBridge.js must reject AI DSL with blocking parser issues.');
  }

  return errors;
}

for (const fixture of fixtures) {
  const errors = validateFixture(fixture);
  if (errors.length > 0) {
    hasFailure = true;
    console.error(`[dsl:validate] ${fixture.name} failed:`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
  }
}

const missingSnippets = validatePromptSpecText();
if (missingSnippets.length > 0) {
  hasFailure = true;
  console.error('[dsl:validate] Prompt spec is missing required rules:');
  for (const item of missingSnippets) {
    console.error(`  - ${item}`);
  }
}

const metadataContractErrors = validateDslMetadataRoundTripContract();
if (metadataContractErrors.length > 0) {
  hasFailure = true;
  console.error('[dsl:validate] Metadata round-trip contract failed:');
  for (const item of metadataContractErrors) {
    console.error(`  - ${item}`);
  }
}

const promptValidationErrors = validatePromptValidationHooks();
if (promptValidationErrors.length > 0) {
  hasFailure = true;
  console.error('[dsl:validate] Prompt validation hooks failed:');
  for (const item of promptValidationErrors) {
    console.error(`  - ${item}`);
  }
}

if (hasFailure) {
  console.error('[dsl:validate] FAILED');
  process.exit(1);
}

console.log('[dsl:validate] OK');
