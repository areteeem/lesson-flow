import { useRef, useCallback, useEffect, useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { parseLesson } from '../parser';
import { TASK_REGISTRY } from '../config/taskRegistry';
import { SLIDE_REGISTRY } from '../config/slideRegistry';

const DSL_LANGUAGE_ID = 'lesson-dsl';
let languageRegistered = false;

const FIELD_KEYS = [
  'Title', 'Question', 'Instruction', 'Content', 'Text', 'Answer', 'Correct',
  'Options', 'Items', 'Pairs', 'Blanks', 'Categories', 'Hint', 'Explanation',
  'Shuffle', 'Layout', 'Left', 'Right', 'Steps', 'Media', 'Image', 'Video', 'Audio',
  'Min', 'Max', 'Targets', 'Columns', 'Rows', 'TimeLimit', 'LinkTo', 'Ref',
  'ShowHints', 'ShowExplanations', 'Multiple', 'Repeat', 'Enabled', 'Group',
  'Placeholder', 'Keywords', 'TaskRefs', 'Cards', 'Notes', 'Examples',
  'HiddenRows', 'HiddenCells', 'RevealMode', 'RandomHiddenCount',
  'LessonTopic', 'GrammarTopic', 'Focus', 'Difficulty',
];

const BLOCK_MARKERS = [
  '#LESSON', '#SLIDE', '#GROUP', '#LINK',
  ...SLIDE_REGISTRY.filter((e) => e.type !== 'slide').map((e) => `#SLIDE: ${e.type.toUpperCase()}`),
  ...TASK_REGISTRY.map((e) => `#TASK: ${e.type.toUpperCase()}`),
];

function registerDslLanguage(monaco) {
  if (languageRegistered) return;
  languageRegistered = true;

  monaco.languages.register({ id: DSL_LANGUAGE_ID });
  monaco.languages.setMonarchTokensProvider(DSL_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/^#LESSON\b.*$/, 'type.lesson-marker'],
        [/^#SLIDE\b.*$/, 'type.slide-marker'],
        [/^#TASK\b.*$/, 'type.task-marker'],
        [/^#GROUP\b.*$/, 'type.group-marker'],
        [/^#LINK\b.*$/, 'type.link-marker'],
        [/^(Title|Question|Instruction|Content|Text|Answer|Correct|Options|Items|Pairs|Blanks|Categories|Hint|Explanation|Shuffle|Layout|Left|Right|Steps|Media|Image|Video|Audio|Min|Max|Targets|Columns|Rows|TimeLimit|LinkTo|Ref|ShowHints|ShowExplanations|Multiple|Repeat|Enabled|Group|Placeholder|Keywords|TaskRefs|Cards|Notes|Examples|HiddenRows|HiddenCells|RevealMode|RandomHiddenCount|LessonTopic|GrammarTopic|Focus|Difficulty)\s*:/i, 'variable.field-key'],
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

  monaco.editor.defineTheme('dsl-dark', {
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
  });

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

function mapWarningsToMarkers(warnings, lines, monaco) {
  return warnings.map((msg) => {
    let lineNum = 1;
    // Try to find a task/slide label from the warning, e.g. Task "Q1" or Slide "S1"
    const labelMatch = msg.match(/(?:Task|Slide)\s+"([^"]+)"/);
    if (labelMatch) {
      const label = labelMatch[1];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(label) || lines[i].match(/^\[(Task|Slide)\b/i)) {
          // Check if the block around this line contains the label
          const blockLine = lines[i];
          if (blockLine.toLowerCase().includes(label.toLowerCase())) {
            lineNum = i + 1;
            break;
          }
        }
      }
      // Fallback: search for Question: or Title: containing the label
      if (lineNum === 1) {
        for (let i = 0; i < lines.length; i++) {
          if (/^(question|title|instruction)\s*:/i.test(lines[i].trim()) && lines[i].toLowerCase().includes(label.toLowerCase())) {
            lineNum = i + 1;
            break;
          }
        }
      }
    }
    // Check for field-specific issues
    const fieldMatch = msg.match(/has no (\w+)/i);
    if (fieldMatch && lineNum === 1) {
      const fieldName = fieldMatch[1].toLowerCase();
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().toLowerCase().startsWith(fieldName + ':')) {
          lineNum = i + 1;
          break;
        }
      }
    }

    const severity = msg.includes('error') || msg.includes('Error') ? monaco.MarkerSeverity.Error
      : msg.includes('Unknown') || msg.includes('Ignored') ? monaco.MarkerSeverity.Warning
      : monaco.MarkerSeverity.Info;

    return {
      severity,
      message: msg,
      startLineNumber: lineNum,
      startColumn: 1,
      endLineNumber: lineNum,
      endColumn: (lines[lineNum - 1] || '').length + 1,
    };
  });
}

export default function DslMonacoEditor({ value, onChange }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const timerRef = useRef(null);
  const [warnings, setWarnings] = useState([]);
  const [copied, setCopied] = useState(null);
  const [showPasteFix, setShowPasteFix] = useState(false);
  const [fixDsl, setFixDsl] = useState('');

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const validate = useCallback((text) => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor) return;

    try {
      const result = parseLesson(text);
      const lines = text.split('\n');
      const markers = mapWarningsToMarkers(result.warnings || [], lines, monaco);
      monaco.editor.setModelMarkers(editor.getModel(), 'dsl-validator', markers);
      setWarnings(result.warnings || []);
    } catch {
      setWarnings(['Parse error — check DSL syntax']);
    }
  }, []);

  const scheduleValidation = useCallback((text) => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => validate(text), 400);
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

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const goToLine = (lineNum) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.revealLineInCenter(lineNum);
    editor.setPosition({ lineNumber: lineNum, column: 1 });
    editor.focus();
  };

  return (
    <div className="flex h-full min-h-[60vh] flex-col xl:min-h-0">
      {/* DSL toolbar */}
      <div className="flex items-center gap-1.5 border border-b-0 border-zinc-200 bg-zinc-950 px-3 py-1.5">
        <button type="button" onClick={() => copyToClipboard(value || '', 'dsl')} className="border border-zinc-700 px-2 py-1 text-[10px] font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200">
          {copied === 'dsl' ? '✓ Copied' : 'Copy DSL'}
        </button>
        <button type="button" onClick={() => {
          const prompt = `Fix the following Lesson DSL. Return ONLY the corrected DSL, no explanations:\n\n${value || ''}${warnings.length ? `\n\nCurrent issues:\n${warnings.map((w) => `- ${w}`).join('\n')}` : ''}`;
          copyToClipboard(prompt, 'fix');
        }} className="border border-zinc-700 px-2 py-1 text-[10px] font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200">
          {copied === 'fix' ? '✓ Copied' : 'Copy DSL + Issues'}
        </button>
        <button type="button" onClick={() => setShowPasteFix((v) => !v)} className={`border px-2 py-1 text-[10px] font-medium transition ${showPasteFix ? 'border-emerald-600 bg-emerald-600/20 text-emerald-400' : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'}`}>
          {showPasteFix ? 'Cancel Paste' : 'Paste Fix'}
        </button>
        {warnings.length > 0 && <span className="ml-auto text-[10px] text-zinc-600">{warnings.length} issue{warnings.length !== 1 ? 's' : ''}</span>}
      </div>
      {showPasteFix && (
        <div className="border border-b-0 border-t-0 border-zinc-200 bg-zinc-950 px-3 py-2">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">Paste corrected DSL from AI</div>
          <textarea
            value={fixDsl}
            onChange={(e) => setFixDsl(e.target.value)}
            rows={6}
            placeholder="Paste the corrected DSL here…"
            className="w-full resize-y border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button type="button" disabled={!fixDsl.trim()} onClick={() => { onChange(fixDsl.trim()); setFixDsl(''); setShowPasteFix(false); }} className="border border-emerald-600 bg-emerald-600 px-3 py-1 text-[10px] font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40">
              Apply Fix
            </button>
            <button type="button" onClick={() => { setFixDsl(''); setShowPasteFix(false); }} className="border border-zinc-700 px-3 py-1 text-[10px] font-medium text-zinc-400 transition hover:text-zinc-200">
              Cancel
            </button>
            {fixDsl.trim() && (() => {
              const result = parseLesson(fixDsl.trim());
              const issueCount = (result.warnings || []).length;
              return issueCount === 0
                ? <span className="text-[10px] text-emerald-400">✓ No issues in pasted DSL</span>
                : <span className="text-[10px] text-amber-400">{issueCount} issue{issueCount > 1 ? 's' : ''} in pasted DSL</span>;
            })()}
          </div>
        </div>
      )}
      <div className="flex-1 overflow-hidden border border-zinc-200 bg-[#1e1e1e]">
        <MonacoEditor
          height="100%"
          defaultLanguage={DSL_LANGUAGE_ID}
          language={DSL_LANGUAGE_ID}
          theme="dsl-dark"
          value={value}
          onChange={handleChange}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            tabSize: 2,
            lineNumbersMinChars: 3,
            automaticLayout: true,
            glyphMargin: true,
          }}
        />
      </div>
      {warnings.length > 0 && (() => {
        const lines = (value || '').split('\n');
        const classified = warnings.map((msg) => {
          const sev = msg.includes('error') || msg.includes('Error') ? 'error'
            : msg.includes('Unknown') || msg.includes('Ignored') ? 'warning' : 'info';
          const labelMatch = msg.match(/(?:Task|Slide)\s+"([^"]+)"/);
          let lineNum = 1;
          if (labelMatch) {
            for (let j = 0; j < lines.length; j++) {
              if (lines[j].toLowerCase().includes(labelMatch[1].toLowerCase())) { lineNum = j + 1; break; }
            }
          }
          return { msg, sev, lineNum };
        });
        const errors = classified.filter((c) => c.sev === 'error');
        const warns = classified.filter((c) => c.sev === 'warning');
        const infos = classified.filter((c) => c.sev === 'info');
        const sevIcon = { error: '✕', warning: '⚠', info: 'ℹ' };
        const sevColor = { error: 'text-red-400', warning: 'text-amber-400', info: 'text-blue-400' };
        const sevBg = { error: 'bg-red-500/20 text-red-400', warning: 'bg-amber-500/20 text-amber-400', info: 'bg-blue-500/20 text-blue-400' };
        const renderItem = (item, i) => (
          <button key={`${item.sev}-${i}`} type="button" onClick={() => goToLine(item.lineNum)} className="flex w-full items-start gap-2 px-3 py-1 text-left text-xs hover:bg-zinc-800">
            <span className={`mt-0.5 ${sevColor[item.sev]}`}>{sevIcon[item.sev]}</span>
            <span className="text-zinc-300">{item.msg}</span>
            {item.lineNum > 1 && <span className="ml-auto shrink-0 text-zinc-600">Ln {item.lineNum}</span>}
          </button>
        );
        return (
          <div className="max-h-44 overflow-auto border border-t-0 border-zinc-200 bg-zinc-900">
            <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">Problems</span>
              {errors.length > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sevBg.error}`}>{errors.length} error{errors.length > 1 ? 's' : ''}</span>}
              {warns.length > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sevBg.warning}`}>{warns.length}</span>}
              {infos.length > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${sevBg.info}`}>{infos.length}</span>}
            </div>
            {errors.map(renderItem)}
            {warns.map(renderItem)}
            {infos.map(renderItem)}
          </div>
        );
      })()}
    </div>
  );
}
