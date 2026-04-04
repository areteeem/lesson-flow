import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import MonacoEditor, { loader } from '@monaco-editor/react';
import * as monacoInstance from 'monaco-editor';
import { generateDSL, parseLesson } from '../parser';
import { getSlideTemplate, getTaskTemplate } from '../config/dslPromptTemplates';
import { TASK_REGISTRY } from '../config/taskRegistry';
import { SLIDE_REGISTRY } from '../config/slideRegistry';
import { AlertTriangleIcon, CheckIcon, CircleXIcon, CopyIcon, DslIcon, ExportIcon, GridIcon, InfoCircleIcon, QuestionIcon, RefreshIcon, SaveIcon, SearchIcon, SparkIcon, TemplateIcon } from './Icons';

// Use locally installed monaco-editor instead of CDN (CDN is blocked by CSP)
loader.config({ monaco: monacoInstance });

const DSL_LANGUAGE_ID = 'lesson-dsl';
// Use a WeakSet keyed on the monaco instance to survive HMR without double-registration
const registeredInstances = new WeakSet();

const FIELD_KEYS = [
  'Title', 'Question', 'Instruction', 'Content', 'Text', 'Answer', 'Correct',
  'Options', 'Items', 'Pairs', 'Blanks', 'Categories', 'Hint', 'Explanation',
  'Shuffle', 'Layout', 'Left', 'Right', 'Steps', 'Media', 'Image', 'Video', 'Audio',
  'Min', 'Max', 'Targets', 'Columns', 'Rows', 'TimeLimit', 'LinkTo', 'Ref',
  'ShowHints', 'ShowExplanations', 'AllowSessionSave', 'VisibilityPolicy',
  'ShowCheckButton', 'AllowRetryHomework', 'EnableGrading', 'ShowTotalGrade', 'ShowPerQuestionGrade',
  'DisableBackNavigation', 'SessionTimeLimitMinutes',
  'AllowRetryLive', 'ShowCheckButtonLive', 'LockAfterSubmitLive', 'HideQuestionContentLive',
  'LiveAutoAdvanceSeconds', 'LiveAutoAdvancePolicy', 'LiveAutoAdvanceSubmissionThreshold',
  'LiveQuestionResponseDeadlineSeconds', 'LiveAutoModeTimeLimitMinutes', 'ShowLeaderboardEachQuestionLive',
  'LivePaceMode', 'LiveGroupModeEnabled', 'LiveGroupCount', 'LiveCaptainRotationEvery',
  'Multiple', 'Repeat', 'Enabled', 'Group',
  'Placeholder', 'Keywords', 'TaskRefs', 'Cards', 'Notes', 'Examples',
  'HiddenRows', 'HiddenCells', 'RevealMode', 'RandomHiddenCount',
  'LessonTopic', 'GrammarTopic', 'Focus', 'Difficulty',
];

const BLOCK_MARKERS = [
  '#LESSON', '#SLIDE', '#GROUP', '#LINK',
  ...SLIDE_REGISTRY.filter((e) => e.type !== 'slide').map((e) => `#SLIDE: ${e.type.toUpperCase()}`),
  ...TASK_REGISTRY.map((e) => `#TASK: ${e.type.toUpperCase()}`),
];

const FIELD_DOCS = {
  title: 'Human-readable block or lesson title shown in UI and reports.',
  question: 'Primary prompt for a task block. Keep it clear and concise.',
  instruction: 'Optional instructional helper text for the learner.',
  content: 'Main rich text body for slides.',
  text: 'Task text body. For blank tasks, this contains placeholders.',
  answer: 'Expected answer value(s). Use pipe separators for multi-answer tasks.',
  options: 'Selectable answer options. One option per line.',
  pairs: 'Left-right pair mappings written as left => right.',
  blanks: 'Word bank or blank values used by fill/drag blank tasks.',
  categories: 'Category labels for categorize tasks.',
  targets: 'Expected highlight/link targets that must exist in text.',
  media: 'Raw URL for media assets. Avoid markdown links here.',
  showcheckbutton: 'Controls whether the student can click Check in homework/player mode.',
  allowretryhomework: 'When true, students can retry homework tasks before final submit.',
  disablebacknavigation: 'Locks backward movement in player flow.',
  sessiontimelimitminutes: 'Hard session time cap for the player runtime.',
  liveautoadvanceseconds: 'Auto-advance countdown for live teacher-led mode.',
  liveautoadvancepolicy: 'timer | all_submitted | submission_threshold.',
  liveautoadvancesubmissionthreshold: 'Submission percent required when using submission_threshold policy.',
  livequestionresponsedeadlineseconds: 'Per-question submission deadline in live mode.',
  liveautomodetimelimitminutes: 'Total duration cap when auto mode is enabled.',
  showleaderboardeachquestionlive: 'Shows a per-question leaderboard card in live mode.',
  livepacemode: 'teacher_led | hybrid | student_paced classroom pacing behavior.',
  livegroupmodeenabled: 'Enables team assignment and team leaderboard in live sessions.',
  livegroupcount: 'Number of teams for group mode (2-8).',
  livecaptainrotationevery: 'Rotate team captains every N blocks (1-10).',
};

const LINT_PRESETS = [
  { value: 'strict', label: 'Strict' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'relaxed', label: 'Relaxed' },
];

const LINT_WORKSPACE_STORAGE_KEY = 'lesson-flow-dsl-lint-workspaces-v1';

const DSL_THEME_DEF = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'type.lesson-marker', foreground: 'c586c0', fontStyle: 'bold' },
    { token: 'type.slide-marker', foreground: '569cd6', fontStyle: 'bold' },
    { token: 'type.task-marker', foreground: '4ec9b0', fontStyle: 'bold' },
    { token: 'type.group-marker', foreground: 'dcdcaa', fontStyle: 'bold' },
    { token: 'type.link-marker', foreground: 'ce9178', fontStyle: 'bold' },
    { token: 'variable.field-key', foreground: '9cdcfe' },
    { token: 'operator.pair-arrow', foreground: 'ce9178' },
    { token: 'string.blank-marker', foreground: 'dcdcaa' },
    { token: 'string.indexed-blank', foreground: 'dcdcaa', fontStyle: 'bold' },
    { token: 'keyword.value', foreground: 'b5cea8' },
  ],
  colors: {},
};

function registerDslLanguage(monaco) {
  if (registeredInstances.has(monaco)) return;
  registeredInstances.add(monaco);

  monaco.languages.register({ id: DSL_LANGUAGE_ID });
  monaco.languages.setMonarchTokensProvider(DSL_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/^#LESSON\b.*$/, 'type.lesson-marker'],
        [/^#SLIDE\b.*$/, 'type.slide-marker'],
        [/^#TASK\b.*$/, 'type.task-marker'],
        [/^#GROUP\b.*$/, 'type.group-marker'],
        [/^#LINK\b.*$/, 'type.link-marker'],
        [/^(Title|Question|Instruction|Content|Text|Answer|Correct|Options|Items|Pairs|Blanks|Categories|Hint|Explanation|Shuffle|Layout|Left|Right|Steps|Media|Image|Video|Audio|Min|Max|Targets|Columns|Rows|TimeLimit|LinkTo|Ref|ShowHints|ShowExplanations|AllowSessionSave|VisibilityPolicy|ShowCheckButton|AllowRetryHomework|EnableGrading|ShowTotalGrade|ShowPerQuestionGrade|DisableBackNavigation|SessionTimeLimitMinutes|AllowRetryLive|ShowCheckButtonLive|LockAfterSubmitLive|HideQuestionContentLive|LiveAutoAdvanceSeconds|LiveAutoAdvancePolicy|LiveAutoAdvanceSubmissionThreshold|LiveQuestionResponseDeadlineSeconds|LiveAutoModeTimeLimitMinutes|ShowLeaderboardEachQuestionLive|LivePaceMode|LiveGroupModeEnabled|LiveGroupCount|LiveCaptainRotationEvery|Multiple|Repeat|Enabled|Group|Placeholder|Keywords|TaskRefs|Cards|Notes|Examples|HiddenRows|HiddenCells|RevealMode|RandomHiddenCount|LessonTopic|GrammarTopic|Focus|Difficulty)\s*:/i, 'variable.field-key'],
        [/=>|->/, 'operator.pair-arrow'],
        [/→/, 'operator.pair-arrow'],
        [/\[\d+\]/, 'string.indexed-blank'],
        [/\{[^}]*\}/, 'string.blank-marker'],
        [/_{3,}/, 'string.blank-marker'],
        [/\[blank\]/i, 'string.blank-marker'],
        [/\b(true|false|yes|no|manual|random)\b/i, 'keyword.value'],
      ],
    },
  });

  monaco.editor.defineTheme('dsl-dark', DSL_THEME_DEF);

  // --- Autocomplete provider ---
  monaco.languages.registerCompletionItemProvider(DSL_LANGUAGE_ID, {
    triggerCharacters: ['#', '\n'],
    provideCompletionItems(model, position) {
      const lineContent = model.getLineContent(position.lineNumber);
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = [];

      // If line starts with '#', suggest block markers
      if (lineContent.trimStart().startsWith('#')) {
        const fullRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: 1,
          endColumn: lineContent.length + 1,
        };
        BLOCK_MARKERS.forEach((marker) => {
          suggestions.push({
            label: marker,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: marker,
            range: fullRange,
            sortText: marker.includes('TASK') ? '1' : '0',
          });
        });
        return { suggestions };
      }

      // If line is empty or has just started a word, suggest field keys
      if (!lineContent.trim() || /^[A-Za-z]*$/.test(lineContent.trimStart())) {
        FIELD_KEYS.forEach((key) => {
          suggestions.push({
            label: `${key}:`,
            kind: monaco.languages.CompletionItemKind.Property,
            insertText: `${key}: `,
            range,
            documentation: `DSL field: ${key}`,
          });
        });
      }

      return { suggestions };
    },
  });

  // --- Snippet completions for task types ---
  monaco.languages.registerCompletionItemProvider(DSL_LANGUAGE_ID, {
    triggerCharacters: [':'],
    provideCompletionItems(model, position) {
      const lineContent = model.getLineContent(position.lineNumber);
      if (!/^#TASK\s*:\s*/i.test(lineContent.trimStart())) return { suggestions: [] };

      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: 1,
        endColumn: lineContent.length + 1,
      };

      const snippets = {
        MULTIPLE_CHOICE: '#TASK: MULTIPLE_CHOICE\nQuestion: ${1:What is the correct answer?}\nOptions:\n${2:Option A}\n${3:Option B}\n${4:Option C}\nAnswer: ${5:Option A}\nExplanation: ${6:Why this is correct.}\n',
        MULTI_SELECT: '#TASK: MULTI_SELECT\nQuestion: ${1:Select all that apply.}\nOptions:\n${2:Option A}\n${3:Option B}\n${4:Option C}\n${5:Option D}\nAnswer: ${6:Option A | Option B}\n',
        FILL_TYPING: '#TASK: FILL_TYPING\nQuestion: ${1:Type the missing word.}\nText: ${2:She ___ to school every day.}\nAnswer: ${3:goes}\n',
        DRAG_TO_BLANK: '#TASK: DRAG_TO_BLANK\nQuestion: ${1:Drag the words into the blanks.}\nText: ${2:He [1] to work by [2] every [3].}\nBlanks:\n${3:goes}\n${4:bus}\n${5:morning}\nOptions:\n${6:car}\n',
        MATCH: '#TASK: MATCH\nQuestion: ${1:Match each item.}\nPairs:\n${2:term 1} => ${3:definition 1}\n${4:term 2} => ${5:definition 2}\n',
        ORDER: '#TASK: ORDER\nQuestion: ${1:Put in the correct order.}\nItems:\n${2:First}\n${3:Second}\n${4:Third}\n',
        CATEGORIZE: '#TASK: CATEGORIZE\nQuestion: ${1:Sort items by category.}\nCategories:\n${2:Category A}\n${3:Category B}\nPairs:\n${4:item 1} => ${5:Category A}\n${6:item 2} => ${7:Category B}\n',
        TRUE_FALSE: '#TASK: TRUE_FALSE\nQuestion: ${1:Statement to evaluate.}\nAnswer: ${2:True}\n',
        TABLE_DRAG: '#TASK: TABLE_DRAG\nQuestion: ${1:Drag values into the correct cells.}\nColumns:\n${2:Col A}\n${3:Col B}\nRows:\n${4:Row 1 | val1}\n${5:Row 2 | val2}\nHiddenCells:\n${6:0:1}\n${7:1:1}\nOptions:\n${8:val1}\n${9:val2}\n',
        DIALOGUE_FILL: '#TASK: DIALOGUE_FILL\nQuestion: ${1:Fill in the dialogue.}\nText:\nA: ${2:What time [1] you start?}\nB: ${3:I [2] at nine.}\nAnswer: ${4:do | start}\n',
        DIALOGUE_COMPLETION: '#TASK: DIALOGUE_COMPLETION\nQuestion: ${1:Complete the dialogue.}\nText:\nA: ${2:What time ___ you start?}\nB: ${3:I ___ at nine.}\nAnswer: ${4:do | start}\n',
        READING_HIGHLIGHT: '#TASK: READING_HIGHLIGHT\nQuestion: ${1:Highlight the target words.}\nText:\n${2:Tom lives in Kyiv and studies English.}\nTargets:\n${3:lives}\n${4:studies}\n',
        HIGHLIGHT_GLOSSARY: '#TASK: HIGHLIGHT_GLOSSARY\nQuestion: ${1:Highlight the useful vocabulary.}\nText:\n${2:Tom lives in Kyiv and studies English.}\nTargets:\n${3:Kyiv}\n${4:studies}\nPairs:\n${5:Kyiv} => ${6:Київ}\n${7:studies} => ${8:навчається}\n',
        ERROR_CORRECTION: '#TASK: ERROR_CORRECTION\nQuestion: ${1:Correct the error.}\nText: ${2:She walk to school every day.}\nAnswer: ${3:She walks to school every day.}\n',
      };

      return {
        suggestions: Object.entries(snippets).map(([type, snippet]) => ({
          label: `#TASK: ${type}`,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: snippet,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          documentation: TASK_REGISTRY.find((t) => t.type === type.toLowerCase())?.description || '',
          sortText: `0_${type}`,
        })),
      };
    },
  });

    // --- Hover docs for known field keys ---
    monaco.languages.registerHoverProvider(DSL_LANGUAGE_ID, {
      provideHover(model, position) {
        const line = model.getLineContent(position.lineNumber);
        const fieldMatch = line.match(/^\s*([A-Za-z][A-Za-z0-9_ ]*)\s*:/);
        if (!fieldMatch) return null;

        const rawField = fieldMatch[1].trim();
        const normalized = rawField.toLowerCase().replace(/\s+/g, '');
        const docs = FIELD_DOCS[normalized];
        if (!docs) return null;

        return {
          range: new monaco.Range(position.lineNumber, 1, position.lineNumber, fieldMatch[0].length + 1),
          contents: [
            { value: `**${rawField}:**` },
            { value: docs },
          ],
        };
      },
    });

  // --- Folding ranges for blocks ---
  monaco.languages.registerFoldingRangeProvider(DSL_LANGUAGE_ID, {
    provideFoldingRanges(model) {
      const ranges = [];
      const lineCount = model.getLineCount();
      let blockStart = null;
      for (let i = 1; i <= lineCount; i++) {
        const line = model.getLineContent(i).trim();
        if (/^#(LESSON|SLIDE|TASK|GROUP|LINK)\b/i.test(line)) {
          if (blockStart !== null) {
            ranges.push({ start: blockStart, end: i - 1, kind: monaco.languages.FoldingRangeKind.Region });
          }
          blockStart = i;
        }
      }
      if (blockStart !== null && blockStart < lineCount) {
        ranges.push({ start: blockStart, end: lineCount, kind: monaco.languages.FoldingRangeKind.Region });
      }
      return ranges;
    },
  });
}

function getWorkspaceLintId() {
  if (typeof window === 'undefined') return 'workspace';
  const pathname = String(window.location.pathname || '').trim();
  return pathname || 'workspace';
}

function loadLintWorkspaceState(workspaceId) {
  if (typeof window === 'undefined') {
    return { preset: 'balanced', filters: { error: true, warning: true, info: true }, profiles: {} };
  }

  try {
    const all = JSON.parse(localStorage.getItem(LINT_WORKSPACE_STORAGE_KEY) || '{}');
    const workspace = all?.[workspaceId] || {};
    return {
      preset: workspace.preset || 'balanced',
      filters: {
        error: workspace?.filters?.error !== false,
        warning: workspace?.filters?.warning !== false,
        info: workspace?.filters?.info !== false,
      },
      profiles: workspace.profiles && typeof workspace.profiles === 'object' ? workspace.profiles : {},
    };
  } catch {
    return { preset: 'balanced', filters: { error: true, warning: true, info: true }, profiles: {} };
  }
}

function saveLintWorkspaceState(workspaceId, value) {
  if (typeof window === 'undefined') return;
  try {
    const all = JSON.parse(localStorage.getItem(LINT_WORKSPACE_STORAGE_KEY) || '{}');
    all[workspaceId] = value;
    localStorage.setItem(LINT_WORKSPACE_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Ignore storage write failures.
  }
}

function normalizeDslSpacing(text) {
  const source = String(text || '').replace(/\r\n?/g, '\n');
  const rawLines = source.split('\n').map((line) => line.replace(/\s+$/g, ''));
  const output = [];

  rawLines.forEach((line, index) => {
    const trimmed = line.trim();
    const isMarker = /^#(LESSON|SLIDE|TASK|GROUP|SPLIT_GROUP|LINK)\b/i.test(trimmed);

    if (isMarker && output.length > 0 && output[output.length - 1] !== '') {
      output.push('');
    }

    output.push(trimmed === '' ? '' : line);

    if (index === rawLines.length - 1) return;
  });

  const compact = [];
  output.forEach((line) => {
    const isBlank = line.trim() === '';
    const previousBlank = compact.length > 0 && compact[compact.length - 1].trim() === '';
    if (isBlank && previousBlank) return;
    compact.push(isBlank ? '' : line);
  });

  const normalized = compact.join('\n').trim();
  return normalized ? `${normalized}\n` : '';
}

function buildParserTrace(dslText) {
  const lines = String(dslText || '').split('\n');
  const markers = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!/^#(LESSON|SLIDE|TASK|GROUP|SPLIT_GROUP|LINK)\b/i.test(trimmed)) return;
    markers.push({ startLine: index + 1, marker: trimmed });
  });

  if (markers.length === 0) return [];

  return markers.map((entry, index) => {
    const endLine = index < markers.length - 1 ? markers[index + 1].startLine - 1 : lines.length;
    const sectionLines = lines.slice(entry.startLine - 1, endLine);
    const titleLine = sectionLines.find((line) => /^\s*(Title|Question|Instruction)\s*:/i.test(line.trim())) || '';
    const label = titleLine ? titleLine.replace(/^\s*([A-Za-z][A-Za-z0-9_ ]*)\s*:\s*/i, '').trim() : '';
    return {
      id: `${index}-${entry.startLine}`,
      marker: entry.marker,
      startLine: entry.startLine,
      endLine,
      label,
      lineCount: Math.max(1, endLine - entry.startLine + 1),
    };
  });
}

function toLessonModelFromParsed(parsed) {
  return {
    title: parsed?.title || 'Untitled Lesson',
    settings: parsed?.settings || {},
    blocks: parsed?.blocks || [],
    lesson: parsed?.lesson || { title: parsed?.title || 'Untitled Lesson', slides: [], tasks: [] },
  };
}

function baseSeverityFromMessage(msg) {
  const lower = String(msg || '').toLowerCase();
  if (lower.includes('failed to parse') || lower.includes('parse error') || lower.includes('missing required') || lower.includes(' is not in options') || lower.includes(' is not one of the options')) {
    return 'error';
  }
  if (lower.includes('unknown') || lower.includes('ignored') || lower.includes('has no') || lower.includes('auto-repair incomplete')) {
    return 'warning';
  }
  return 'info';
}

function applyLintPreset(severity, message, preset) {
  const lower = String(message || '').toLowerCase();
  if (preset === 'strict') {
    if (severity === 'info') return 'warning';
    if (severity === 'warning' && (lower.includes('has no') || lower.includes('missing') || lower.includes('not in options'))) {
      return 'error';
    }
    return severity;
  }
  if (preset === 'relaxed') {
    if (severity === 'error') return 'error';
    return 'info';
  }
  return severity;
}

function classifyWarnings(warnings, lines, lintPreset = 'balanced') {
  return warnings.map((msg) => {
    let lineNum = 1;
    const labelMatch = msg.match(/(?:Task|Slide)\s+"([^"]+)"/);
    if (labelMatch) {
      const label = labelMatch[1].toLowerCase();
      for (let i = 0; i < lines.length; i++) {
        const current = String(lines[i] || '').toLowerCase();
        if (current.includes(label)) {
          lineNum = i + 1;
          break;
        }
      }
    }

    const fieldMatch = msg.match(/missing required field:\s*([a-zA-Z0-9_]+)/i) || msg.match(/has no\s+([a-zA-Z0-9_]+)/i);
    if (fieldMatch && lineNum === 1) {
      const fieldName = fieldMatch[1].toLowerCase();
      for (let i = 0; i < lines.length; i++) {
        if (String(lines[i] || '').trim().toLowerCase().startsWith(`${fieldName}:`)) {
          lineNum = i + 1;
          break;
        }
      }
    }

    const base = baseSeverityFromMessage(msg);
    const sev = applyLintPreset(base, msg, lintPreset);
    return { msg, sev, lineNum };
  });
}

function mapWarningsToMarkers(warnings, lines, monaco, lintPreset = 'balanced') {
  return classifyWarnings(warnings, lines, lintPreset).map((item) => {
    const severity = item.sev === 'error' ? monaco.MarkerSeverity.Error
      : item.sev === 'warning' ? monaco.MarkerSeverity.Warning
      : monaco.MarkerSeverity.Info;

    return {
      severity,
      message: item.msg,
      startLineNumber: item.lineNum,
      startColumn: 1,
      endLineNumber: item.lineNum,
      endColumn: (lines[item.lineNum - 1] || '').length + 1,
    };
  });
}

function blockRangeForLine(lines, lineNum) {
  const safeLines = Array.isArray(lines) ? lines : [];
  if (safeLines.length === 0) return { start: 0, end: 0 };
  const lineIndex = Math.max(0, Math.min(safeLines.length - 1, Number(lineNum || 1) - 1));

  let start = 0;
  for (let i = lineIndex; i >= 0; i--) {
    if (/^#(LESSON|SLIDE|TASK|GROUP|SPLIT_GROUP|LINK)\b/i.test(String(safeLines[i] || '').trim())) {
      start = i;
      break;
    }
  }

  let end = safeLines.length - 1;
  for (let i = start + 1; i < safeLines.length; i++) {
    if (/^#(LESSON|SLIDE|TASK|GROUP|SPLIT_GROUP|LINK)\b/i.test(String(safeLines[i] || '').trim())) {
      end = i - 1;
      break;
    }
  }

  return { start, end };
}

function hasFieldInRange(lines, range, fieldName) {
  const needle = String(fieldName || '').trim().toLowerCase();
  if (!needle) return false;
  for (let i = range.start; i <= range.end; i++) {
    if (String(lines[i] || '').trim().toLowerCase().startsWith(`${needle}:`)) return true;
  }
  return false;
}

function quickFixLabelForMessage(message) {
  const msg = String(message || '');
  if (/missing required field/i.test(msg)) return 'Add required field';
  if (/has no options/i.test(msg)) return 'Insert options scaffold';
  if (/has no Question or Instruction/i.test(msg)) return 'Insert question prompt';
  if (/is not one of the options|is not in options/i.test(msg)) return 'Add missing option';
  if (/text has no blank markers/i.test(msg)) return 'Add blank marker';
  if (/Unknown block marker/i.test(msg)) return 'Normalize marker';
  if (/Ignored text found before the first block marker/i.test(msg)) return 'Insert lesson header';
  return '';
}

function applyQuickFixForIssue(dslText, item) {
  const lines = String(dslText || '').replace(/\r\n?/g, '\n').split('\n');
  const range = blockRangeForLine(lines, item?.lineNum || 1);
  const message = String(item?.msg || '');
  let applied = false;

  if (/Ignored text found before the first block marker/i.test(message)) {
    lines.unshift('', 'Title: Untitled Lesson', '#LESSON');
    applied = true;
  }

  const requiredFieldMatch = message.match(/missing required field:\s*([a-zA-Z0-9_]+)/i);
  if (requiredFieldMatch) {
    const field = requiredFieldMatch[1];
    if (!hasFieldInRange(lines, range, field)) {
      lines.splice(range.end + 1, 0, `${field.charAt(0).toUpperCase()}${field.slice(1)}: TODO`);
      applied = true;
    }
  }

  if (/has no Question or Instruction/i.test(message) && !hasFieldInRange(lines, range, 'question') && !hasFieldInRange(lines, range, 'instruction')) {
    lines.splice(range.end + 1, 0, 'Question: Add prompt here');
    applied = true;
  }

  if (/has no options/i.test(message) && !hasFieldInRange(lines, range, 'options')) {
    lines.splice(range.end + 1, 0, 'Options:', 'Option A', 'Option B', 'Option C');
    applied = true;
  }

  const missingOptionMatch = message.match(/answer\s+"([^"]+)"\s+is not (?:one of the options|in options)/i);
  if (missingOptionMatch) {
    const candidate = missingOptionMatch[1].trim();
    if (candidate) {
      if (!hasFieldInRange(lines, range, 'options')) {
        lines.splice(range.end + 1, 0, 'Options:', candidate);
        applied = true;
      } else {
        const existing = lines.slice(range.start, range.end + 1).map((line) => String(line || '').trim().toLowerCase());
        if (!existing.includes(candidate.toLowerCase())) {
          lines.splice(range.end + 1, 0, candidate);
          applied = true;
        }
      }
    }
  }

  if (/text has no blank markers/i.test(message)) {
    for (let i = range.start; i <= range.end; i++) {
      const trimmed = String(lines[i] || '').trim();
      if (/^Text\s*:/i.test(trimmed) && !/(\{\}|_{3,}|\[blank\]|\[\d+\])/i.test(trimmed)) {
        lines[i] = `${lines[i]} ___`;
        applied = true;
        break;
      }
    }
  }

  if (/Unknown block marker/i.test(message)) {
    const lineIndex = Math.max(0, Math.min(lines.length - 1, (item?.lineNum || 1) - 1));
    lines[lineIndex] = '#SLIDE';
    applied = true;
  }

  const nextDsl = normalizeDslSpacing(lines.join('\n'));
  return {
    applied,
    nextDsl,
  };
}

function downloadTextFile(content, fileName, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function ToolbarButton({ label, hint, icon, active = false, tone = 'neutral', className = '', ...props }) {
  const toneClass = active
    ? tone === 'warning'
      ? 'border-amber-400 bg-amber-500/20 text-amber-100'
      : tone === 'success'
        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
        : tone === 'accent'
          ? 'border-blue-400 bg-blue-500/20 text-blue-100'
          : 'border-violet-400 bg-violet-500/20 text-violet-100'
    : 'border-zinc-600 bg-zinc-900/85 text-zinc-100 hover:border-zinc-300 hover:bg-zinc-800';

  return (
    <button
      type="button"
      title={hint}
      aria-label={hint}
      className={`inline-flex min-h-9 items-center gap-2 border px-3 py-2 text-[11px] font-medium transition ${toneClass} ${className}`}
      {...props}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function StatusChip({ icon, label, value, tone = 'neutral' }) {
  const toneClass = tone === 'danger'
    ? 'border-red-500/25 bg-red-500/10 text-red-200'
    : tone === 'warning'
      ? 'border-amber-500/25 bg-amber-500/10 text-amber-200'
      : tone === 'success'
        ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
        : 'border-zinc-700 bg-zinc-900/70 text-zinc-300';

  return (
    <div className={`inline-flex min-h-9 items-center gap-2 border px-3 py-2 text-[11px] ${toneClass}`}>
      {icon}
      <span className="uppercase tracking-[0.14em] opacity-70">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

export default function DslMonacoEditor({ value, onChange, onLoadTemplate }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const timerRef = useRef(null);
  const workspaceLintId = useMemo(() => getWorkspaceLintId(), []);
  const lintDefaults = useMemo(() => loadLintWorkspaceState(workspaceLintId), [workspaceLintId]);
  const [warnings, setWarnings] = useState([]);
  const [copied, setCopied] = useState(null);
  const [showPasteFix, setShowPasteFix] = useState(false);
  const [fixDsl, setFixDsl] = useState('');
  const [lintPreset, setLintPreset] = useState(lintDefaults.preset || 'balanced');
  const [severityFilters, setSeverityFilters] = useState(lintDefaults.filters || { error: true, warning: true, info: true });
  const [lintProfiles, setLintProfiles] = useState(lintDefaults.profiles || {});
  const [selectedProfile, setSelectedProfile] = useState('');
  const [showParserTrace, setShowParserTrace] = useState(false);
  const [selectedTraceId, setSelectedTraceId] = useState('');
  const [showParsedPanel, setShowParsedPanel] = useState(false);
  const [quickFixNotice, setQuickFixNotice] = useState('');
  const [showProblemsPanel, setShowProblemsPanel] = useState(false);
  const [showUtilityShelf, setShowUtilityShelf] = useState(false);
  const [showTemplateHelp, setShowTemplateHelp] = useState(false);
  const [selectedTemplateKind, setSelectedTemplateKind] = useState('task');
  const [selectedTemplateType, setSelectedTemplateType] = useState('multiple_choice');
  const [dismissedIssueKeys, setDismissedIssueKeys] = useState([]);

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const classifiedWarnings = useMemo(() => {
    const lines = String(value || '').split('\n');
    return classifyWarnings(warnings, lines, lintPreset);
  }, [lintPreset, value, warnings]);

  const issueKey = useCallback((item) => `${item.sev}:${item.lineNum}:${item.msg}`, []);

  const visibleWarnings = useMemo(() => {
    return classifiedWarnings.filter((entry) => severityFilters[entry.sev] !== false && !dismissedIssueKeys.includes(issueKey(entry)));
  }, [classifiedWarnings, dismissedIssueKeys, issueKey, severityFilters]);

  const hiddenIssueCount = classifiedWarnings.length - visibleWarnings.length;

  const taskTemplateEntries = useMemo(() => TASK_REGISTRY.filter((entry) => !entry.hiddenFromLibrary), []);
  const slideTemplateEntries = useMemo(() => SLIDE_REGISTRY, []);
  const selectedTemplate = useMemo(() => {
    if (selectedTemplateKind === 'slide') {
      return slideTemplateEntries.find((entry) => entry.type === selectedTemplateType) || slideTemplateEntries[0] || null;
    }
    return taskTemplateEntries.find((entry) => entry.type === selectedTemplateType) || taskTemplateEntries[0] || null;
  }, [selectedTemplateKind, selectedTemplateType, slideTemplateEntries, taskTemplateEntries]);
  const selectedTemplateDsl = useMemo(() => {
    if (!selectedTemplate) return '';
    return selectedTemplateKind === 'slide'
      ? getSlideTemplate(selectedTemplate.type)
      : getTaskTemplate(selectedTemplate.type);
  }, [selectedTemplate, selectedTemplateKind]);

  const parserTrace = useMemo(() => buildParserTrace(value || ''), [value]);

  const parsedPreview = useMemo(() => {
    try {
      return parseLesson(value || '');
    } catch (error) {
      return { error: error?.message || 'Failed to parse DSL.' };
    }
  }, [value]);

  const warningReport = useCallback(() => {
    if (classifiedWarnings.length === 0) return 'No issues detected.';
    return classifiedWarnings.map((entry) => `- Line ${entry.lineNum}: ${entry.msg}`).join('\n');
  }, [classifiedWarnings]);

  const validate = useCallback((text) => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor) return;

    try {
      const result = parseLesson(text);
      const lines = text.split('\n');
      const markers = mapWarningsToMarkers(result.warnings || [], lines, monaco, lintPreset);
      monaco.editor.setModelMarkers(editor.getModel(), 'dsl-validator', markers);
      setWarnings(result.warnings || []);
    } catch {
      setWarnings(['Parse error — check DSL syntax']);
    }
  }, [lintPreset]);

  const scheduleValidation = useCallback((text) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => validate(text), 350);
  }, [validate]);

  const handleMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerDslLanguage(monaco);
    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, DSL_LANGUAGE_ID);
    validate(value || '');
  };

  const handleChange = (nextValue) => {
    const v = nextValue || '';
    onChange(v);
    scheduleValidation(v);
  };

  const goToLine = (lineNum) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.revealLineInCenter(lineNum);
    editor.setPosition({ lineNumber: lineNum, column: 1 });
    editor.focus();
  };

  const handleApplyQuickFix = useCallback((item) => {
    const result = applyQuickFixForIssue(value || '', item);
    if (!result.applied) {
      setQuickFixNotice('No safe quick fix available for this issue.');
      return;
    }
    onChange(result.nextDsl);
    scheduleValidation(result.nextDsl);
    setQuickFixNotice('Quick fix applied.');
    setTimeout(() => setQuickFixNotice(''), 1800);
  }, [onChange, scheduleValidation, value]);

  const handleAutoFormat = () => {
    const formatted = normalizeDslSpacing(value || '');
    onChange(formatted);
    scheduleValidation(formatted);
  };

  const handleSafeNormalize = () => {
    const parsed = parseLesson(value || '');
    const normalized = generateDSL(toLessonModelFromParsed(parsed));
    onChange(normalized);
    scheduleValidation(normalized);
    setQuickFixNotice('Safe normalize completed.');
    setTimeout(() => setQuickFixNotice(''), 1800);
  };

  const handleExportWarningsJson = () => {
    downloadTextFile(JSON.stringify(visibleWarnings, null, 2), 'dsl-warnings.json', 'application/json;charset=utf-8');
  };

  const handleExportWarningsCsv = () => {
    const rows = [
      ['severity', 'line', 'message'],
      ...visibleWarnings.map((entry) => [entry.sev, String(entry.lineNum), entry.msg]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    downloadTextFile(csv, 'dsl-warnings.csv', 'text/csv;charset=utf-8');
  };

  const saveCurrentLintProfile = () => {
    const proposedName = typeof window !== 'undefined' ? window.prompt('Profile name for this workspace?', selectedProfile || 'custom-profile') : '';
    const profileName = String(proposedName || '').trim();
    if (!profileName) return;

    setLintProfiles((current) => ({
      ...current,
      [profileName]: {
        preset: lintPreset,
        filters: severityFilters,
      },
    }));
    setSelectedProfile(profileName);
  };

  const applyLintProfile = (profileName) => {
    if (!profileName) {
      setSelectedProfile('');
      return;
    }
    const profile = lintProfiles[profileName];
    if (!profile) return;
    setSelectedProfile(profileName);
    setLintPreset(profile.preset || 'balanced');
    setSeverityFilters(profile.filters || { error: true, warning: true, info: true });
  };

  useEffect(() => {
    saveLintWorkspaceState(workspaceLintId, {
      preset: lintPreset,
      filters: severityFilters,
      profiles: lintProfiles,
    });
  }, [lintPreset, lintProfiles, severityFilters, workspaceLintId]);

  useEffect(() => {
    scheduleValidation(value || '');
  }, [lintPreset, scheduleValidation, value]);

  useEffect(() => {
    const available = new Set(classifiedWarnings.map((entry) => issueKey(entry)));
    setDismissedIssueKeys((current) => current.filter((key) => available.has(key)));
  }, [classifiedWarnings, issueKey]);

  const insertTemplateSnippet = useCallback((snippet) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !snippet) return;

    const selection = editor.getSelection();
    if (!selection) return;

    editor.executeEdits('dsl-template-help', [{ range: selection, text: `${snippet.trim()}\n` }]);
    const nextValue = editor.getValue();
    onChange(nextValue);
    scheduleValidation(nextValue);
    editor.focus();
  }, [onChange, scheduleValidation]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const sevColor = { error: 'text-red-400', warning: 'text-amber-400', info: 'text-blue-400' };
  const sevBg = { error: 'bg-red-500/20 text-red-400', warning: 'bg-amber-500/20 text-amber-400', info: 'bg-blue-500/20 text-blue-400' };
  const errorCount = classifiedWarnings.filter((entry) => entry.sev === 'error').length;
  const warningCount = classifiedWarnings.filter((entry) => entry.sev === 'warning').length;
  const infoCount = classifiedWarnings.filter((entry) => entry.sev === 'info').length;
  const selectedTrace = parserTrace.find((entry) => entry.id === selectedTraceId) || parserTrace[0] || null;
  const lineCount = useMemo(() => String(value || '').split('\n').length, [value]);
  const blockCount = parserTrace.length;
  const visibleIssueCount = visibleWarnings.length;

  return (
    <div className="flex h-full min-h-[34rem] flex-col bg-zinc-950" role="region" aria-label="Lexor DSL editor workspace">
      <div className="border border-b-0 border-zinc-700 bg-[linear-gradient(180deg,#161616_0%,#101010_100%)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-zinc-100">
              <span className="inline-flex h-8 w-8 items-center justify-center border border-zinc-700 bg-zinc-900">
                <DslIcon size={16} />
              </span>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-300">Lexor DSL workspace</div>
                <div className="mt-1 text-[11px] text-zinc-500">Write lesson blocks directly, inspect the parser, and export fixes without leaving the editor.</div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip icon={<CircleXIcon size={14} />} label="Errors" value={errorCount} tone={errorCount > 0 ? 'danger' : 'neutral'} />
            <StatusChip icon={<AlertTriangleIcon size={14} />} label="Warnings" value={warningCount} tone={warningCount > 0 ? 'warning' : 'neutral'} />
            <StatusChip icon={<InfoCircleIcon size={14} />} label="Info" value={infoCount} />
            <StatusChip icon={<SearchIcon size={14} />} label="Blocks" value={blockCount} tone={blockCount > 0 ? 'success' : 'neutral'} />
            <StatusChip icon={<CheckIcon size={14} />} label="Lines" value={lineCount} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="DSL editor actions">
          <ToolbarButton
            onClick={() => copyToClipboard(value || '', 'dsl')}
            label={copied === 'dsl' ? 'Copied DSL' : 'Copy DSL'}
            hint="Copy the current DSL to the clipboard."
            icon={<CopyIcon size={14} />}
          />
          <ToolbarButton onClick={handleAutoFormat} label="Auto Format" hint="Normalize spacing and layout in the current DSL." icon={<RefreshIcon size={14} />} />
          <ToolbarButton onClick={() => setShowProblemsPanel((current) => !current)} label={showProblemsPanel ? 'Hide Problems' : `Problems (${visibleIssueCount})`} hint="Open the problems list and jump to issues by line." icon={<AlertTriangleIcon size={14} />} active={showProblemsPanel} tone="warning" />
          <ToolbarButton onClick={() => setShowPasteFix((current) => !current)} label={showPasteFix ? 'Cancel Paste' : 'Paste Fix'} hint="Paste a corrected DSL version and apply it safely." icon={<SparkIcon size={14} />} active={showPasteFix} tone="success" />
          {onLoadTemplate && <ToolbarButton onClick={() => onLoadTemplate('blank')} label="Blank" hint="Load a clean blank lesson template." icon={<TemplateIcon size={14} />} />}
          {onLoadTemplate && <ToolbarButton onClick={() => onLoadTemplate('catalog')} label="All Types" hint="Load the all-types DSL reference lesson." icon={<QuestionIcon size={14} />} />}
          <ToolbarButton onClick={() => setShowTemplateHelp((current) => !current)} label={showTemplateHelp ? 'Hide Templates' : 'Task Templates'} hint="Open ready-to-paste DSL examples for task and slide types." icon={<TemplateIcon size={14} />} active={showTemplateHelp} tone="accent" />
          <ToolbarButton onClick={() => setShowUtilityShelf((current) => !current)} label={showUtilityShelf ? 'Hide Tools' : 'More Tools'} hint="Show parser, export, and profile utilities." icon={<GridIcon size={14} />} active={showUtilityShelf} tone="accent" />

          <label className="ml-auto inline-flex min-h-9 items-center gap-2 border border-zinc-700 px-3 py-2 text-[11px] text-zinc-400" title="Choose how strict the DSL validator should be.">
            <span className="inline-flex items-center gap-2"><AlertTriangleIcon size={14} /><span className="uppercase tracking-[0.14em]">Preset</span></span>
            <select value={lintPreset} onChange={(event) => setLintPreset(event.target.value)} className="bg-transparent text-[11px] text-zinc-200 outline-none">
              {LINT_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>{preset.label}</option>
              ))}
            </select>
          </label>
        </div>

        {showUtilityShelf && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border border-zinc-800 bg-zinc-950/80 p-2">
            <ToolbarButton
              onClick={() => {
                const prompt = `Fix the following Lesson DSL. Return ONLY the corrected DSL, no explanations:\n\n${value || ''}${warnings.length ? `\n\nCurrent issues with line numbers:\n${warningReport()}` : ''}`;
                copyToClipboard(prompt, 'fix');
              }}
              label={copied === 'fix' ? 'Copied Prompt' : 'Copy Fix Prompt'}
              hint="Copy the DSL together with current issues for external AI repair."
              icon={<ExportIcon size={14} />}
            />
            <ToolbarButton onClick={handleSafeNormalize} label="Safe Normalize" hint="Rebuild the DSL from the parsed lesson model." icon={<SparkIcon size={14} />} />
            <ToolbarButton onClick={() => setShowParsedPanel((current) => !current)} label="Parsed JSON" hint="Show or hide the parsed lesson structure." icon={<GridIcon size={14} />} active={showParsedPanel} tone="accent" />
            <ToolbarButton onClick={() => setShowParserTrace((current) => !current)} label="Parser Trace" hint="Inspect how the DSL parser segmented the document into blocks." icon={<SearchIcon size={14} />} active={showParserTrace} />
            <ToolbarButton onClick={handleExportWarningsJson} label="Warnings JSON" hint="Export visible warnings as a JSON file." icon={<ExportIcon size={14} />} />
            <ToolbarButton onClick={handleExportWarningsCsv} label="Warnings CSV" hint="Export visible warnings as a CSV file." icon={<ExportIcon size={14} className="rotate-90" />} />
            <label className="inline-flex min-h-9 items-center gap-2 border border-zinc-700 px-3 py-2 text-[11px] text-zinc-400" title="Reuse a saved lint profile for this workspace.">
              <span className="inline-flex items-center gap-2"><DslIcon size={14} /><span className="uppercase tracking-[0.14em]">Profile</span></span>
              <select value={selectedProfile} onChange={(event) => applyLintProfile(event.target.value)} className="bg-transparent text-[11px] text-zinc-200 outline-none">
                <option value="">Current</option>
                {Object.keys(lintProfiles).sort().map((profileName) => (
                  <option key={profileName} value={profileName}>{profileName}</option>
                ))}
              </select>
            </label>
            <ToolbarButton onClick={saveCurrentLintProfile} label="Save Profile" hint="Save the current preset and filters as a reusable workspace profile." icon={<SaveIcon size={14} />} />
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500" id="dsl-editor-help">
          <span className="inline-flex items-center gap-1.5"><InfoCircleIcon size={13} />Use # to insert block markers, keep the main row for writing tools, and open More Tools only when you need parser/export utilities.</span>
        </div>
      </div>

      {quickFixNotice && <div role="status" className="border border-b-0 border-zinc-800 bg-zinc-950 px-4 py-2 text-[11px] text-emerald-300">{quickFixNotice}</div>}

      {showPasteFix && (
        <div className="border border-b-0 border-t-0 border-zinc-800 bg-zinc-950 px-4 py-3">
          <div className="mb-1.5 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500"><SparkIcon size={14} />Paste corrected DSL from AI</div>
          <textarea
            value={fixDsl}
            onChange={(event) => setFixDsl(event.target.value)}
            rows={6}
            placeholder="Paste the corrected DSL here…"
            aria-label="Paste corrected DSL"
            className="w-full resize-y border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              disabled={!fixDsl.trim()}
              onClick={() => {
                onChange(fixDsl.trim());
                scheduleValidation(fixDsl.trim());
                setFixDsl('');
                setShowPasteFix(false);
              }}
              className="border border-emerald-600 bg-emerald-600 px-3 py-1 text-[10px] font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
            >
              Apply Fix
            </button>
            <button type="button" onClick={() => { setFixDsl(''); setShowPasteFix(false); }} className="border border-zinc-700 px-3 py-1 text-[10px] font-medium text-zinc-400 transition hover:text-zinc-200">Cancel</button>
          </div>
        </div>
      )}

      {showTemplateHelp && (
        <div className="border border-b-0 border-t-0 border-zinc-800 bg-zinc-950 px-4 py-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setSelectedTemplateKind('task'); if (selectedTemplateKind !== 'task') setSelectedTemplateType(taskTemplateEntries[0]?.type || 'multiple_choice'); }} className={selectedTemplateKind === 'task' ? 'border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-[11px] font-medium text-zinc-900' : 'border border-zinc-700 px-3 py-1.5 text-[11px] text-zinc-400'}>Tasks</button>
                <button type="button" onClick={() => { setSelectedTemplateKind('slide'); if (selectedTemplateKind !== 'slide') setSelectedTemplateType(slideTemplateEntries[0]?.type || 'slide'); }} className={selectedTemplateKind === 'slide' ? 'border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-[11px] font-medium text-zinc-900' : 'border border-zinc-700 px-3 py-1.5 text-[11px] text-zinc-400'}>Slides</button>
              </div>
              <div className="max-h-64 overflow-auto border border-zinc-800 bg-zinc-900/70">
                {(selectedTemplateKind === 'slide' ? slideTemplateEntries : taskTemplateEntries).map((entry) => (
                  <button
                    key={entry.type}
                    type="button"
                    onClick={() => setSelectedTemplateType(entry.type)}
                    className={selectedTemplateType === entry.type ? 'flex w-full items-start justify-between border-b border-zinc-800 bg-zinc-800 px-3 py-2 text-left text-xs text-zinc-100' : 'flex w-full items-start justify-between border-b border-zinc-800 px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800'}
                  >
                    <span>
                      <span className="block font-medium">{entry.label}</span>
                      <span className="mt-0.5 block text-[10px] text-zinc-500">{selectedTemplateKind === 'slide' ? entry.layout : entry.category}</span>
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{entry.type}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">DSL template help</div>
                  <div className="mt-1 text-xs text-zinc-400">Use these parser-safe examples as a reference or insert them directly at the cursor.</div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => copyToClipboard(selectedTemplateDsl, 'template')} className="border border-zinc-700 px-3 py-1.5 text-[11px] text-zinc-300 hover:border-zinc-500 hover:text-white">{copied === 'template' ? 'Copied' : 'Copy template'}</button>
                  <button type="button" onClick={() => insertTemplateSnippet(selectedTemplateDsl)} className="border border-blue-500/60 bg-blue-500/10 px-3 py-1.5 text-[11px] text-blue-100 hover:bg-blue-500/20">Insert at cursor</button>
                </div>
              </div>
              <pre className="max-h-72 overflow-auto border border-zinc-800 bg-[#161616] p-3 text-[11px] text-zinc-200">{selectedTemplateDsl || 'Select a task or slide type to see its DSL template.'}</pre>
            </div>
          </div>
        </div>
      )}

      <div className="dsl-editor-host min-h-[24rem] flex-1 overflow-hidden border border-zinc-800 bg-[#1e1e1e]">
        <div className={showParsedPanel ? 'grid h-full min-h-0 grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.9fr)]' : 'h-full min-h-0'}>
          <div className="relative h-full min-h-0" aria-label="Primary DSL code editor">
            {!String(value || '').trim() && (
              <div className="pointer-events-none absolute inset-x-6 top-4 z-10 border border-zinc-700 bg-zinc-950/80 px-3 py-2 text-[11px] text-zinc-400">
                Start with <span className="font-semibold text-zinc-100">#LESSON</span>, then add <span className="font-semibold text-zinc-100">#SLIDE</span> or <span className="font-semibold text-zinc-100">#TASK</span> blocks. Use Blank or All Types above if you want a starter structure.
              </div>
            )}
            <MonacoEditor
              height="100%"
              defaultLanguage={DSL_LANGUAGE_ID}
              language={DSL_LANGUAGE_ID}
              theme="dsl-dark"
              value={value}
              onChange={handleChange}
              beforeMount={(monaco) => monaco.editor.defineTheme('dsl-dark', DSL_THEME_DEF)}
              onMount={handleMount}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                tabSize: 2,
                lineNumbersMinChars: 3,
                automaticLayout: true,
                glyphMargin: true,
                accessibilitySupport: 'on',
                ariaLabel: 'Lexor DSL editor. Use # for block markers and field names for autocomplete.',
                scrollbar: { verticalScrollbarSize: 12, horizontalScrollbarSize: 12 },
                overviewRulerBorder: false,
                bracketPairColorization: { enabled: true },
                padding: { top: 10, bottom: 16 },
              }}
            />
          </div>
          {showParsedPanel && (
            <div className="min-h-0 overflow-auto border-l border-zinc-800 bg-zinc-950 p-4" role="region" aria-label="Parsed lesson JSON preview">
              <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500"><GridIcon size={14} />Parsed JSON Debug</div>
              <pre className="whitespace-pre-wrap text-[11px] text-zinc-300">{JSON.stringify(parsedPreview, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>

      {showParserTrace && (
        <div className="max-h-64 overflow-auto border border-t-0 border-zinc-800 bg-zinc-900" role="region" aria-label="Parser trace panel">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500"><SearchIcon size={14} />Parser Trace</div>
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="border-r border-zinc-800">
              {parserTrace.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setSelectedTraceId(entry.id);
                    goToLine(entry.startLine);
                  }}
                  className={entry.id === selectedTrace?.id ? 'flex w-full items-center justify-between border-b border-zinc-800 bg-zinc-800 px-3 py-1.5 text-left text-xs text-zinc-100' : 'flex w-full items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800'}
                >
                  <span>{entry.marker}{entry.label ? ` · ${entry.label}` : ''}</span>
                  <span className="text-zinc-500">Ln {entry.startLine}</span>
                </button>
              ))}
              {parserTrace.length === 0 && <div className="px-3 py-2 text-xs text-zinc-500">No trace data available.</div>}
            </div>
            <div className="px-3 py-2 text-xs text-zinc-300">
              {selectedTrace ? (
                <div className="space-y-1">
                  <div><span className="text-zinc-500">Marker:</span> {selectedTrace.marker}</div>
                  <div><span className="text-zinc-500">Lines:</span> {selectedTrace.startLine} - {selectedTrace.endLine}</div>
                  <div><span className="text-zinc-500">Length:</span> {selectedTrace.lineCount} lines</div>
                  <div><span className="text-zinc-500">Label:</span> {selectedTrace.label || 'No title/question line found'}</div>
                </div>
              ) : (
                <div className="text-zinc-500">Select a block from trace list.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {classifiedWarnings.length > 0 && showProblemsPanel && (
        <div className="max-h-56 overflow-auto border border-t-0 border-zinc-800 bg-zinc-900" role="region" aria-label="DSL problems list">
          <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-2">
            <span className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500"><AlertTriangleIcon size={14} />Problems</span>
            {errorCount > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sevBg.error}`}>{errorCount}</span>}
            {warningCount > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sevBg.warning}`}>{warningCount}</span>}
            {infoCount > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sevBg.info}`}>{infoCount}</span>}
            <div className="ml-auto flex items-center gap-1 text-[10px] text-zinc-500">
              {hiddenIssueCount > 0 && <button type="button" onClick={() => setDismissedIssueKeys([])} className="border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:border-zinc-500 hover:text-white">Show hidden ({hiddenIssueCount})</button>}
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={severityFilters.error} onChange={(event) => setSeverityFilters((current) => ({ ...current, error: event.target.checked }))} />Errors</label>
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={severityFilters.warning} onChange={(event) => setSeverityFilters((current) => ({ ...current, warning: event.target.checked }))} />Warnings</label>
              <label className="inline-flex items-center gap-1"><input type="checkbox" checked={severityFilters.info} onChange={(event) => setSeverityFilters((current) => ({ ...current, info: event.target.checked }))} />Info</label>
            </div>
          </div>
          {visibleWarnings.map((item, index) => {
            const quickFix = quickFixLabelForMessage(item.msg);
            return (
              <div
                key={`${item.sev}-${index}-${item.lineNum}`}
                role="button"
                tabIndex={0}
                onClick={() => goToLine(item.lineNum)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    goToLine(item.lineNum);
                  }
                }}
                className="flex w-full items-start gap-2 border-b border-zinc-800 px-3 py-1.5 text-left text-xs hover:bg-zinc-800"
              >
                <span className={`mt-0.5 ${sevColor[item.sev]}`}>
                  {item.sev === 'error' ? <CircleXIcon size={13} /> : item.sev === 'warning' ? <AlertTriangleIcon size={13} /> : <InfoCircleIcon size={13} />}
                </span>
                <span className="text-zinc-300">{item.msg}</span>
                {quickFix && (
                  <span className="ml-auto mr-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleApplyQuickFix(item);
                      }}
                      className="border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                    >
                      {quickFix}
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDismissedIssueKeys((current) => [...current, issueKey(item)]);
                  }}
                  className="shrink-0 text-zinc-500 transition hover:text-zinc-200"
                  aria-label="Hide issue"
                  title="Hide issue"
                >
                  X
                </button>
                <span className="shrink-0 text-zinc-600">Ln {item.lineNum}</span>
              </div>
            );
          })}
          {visibleWarnings.length === 0 && <div className="px-3 py-2 text-xs text-zinc-500">All issues are hidden by severity filters.</div>}
        </div>
      )}
    </div>
  );
}
