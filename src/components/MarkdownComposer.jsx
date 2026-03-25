import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FormattedTextBlock } from './FormattedText';

const ACTIONS = [
  { label: 'H2', type: 'prefix', value: '## ', shortcut: null },
  { label: 'B', type: 'wrap', before: '**', after: '**', shortcut: 'b' },
  { label: 'I', type: 'wrap', before: '*', after: '*', shortcut: 'i' },
  { label: 'List', type: 'line-prefix', value: '- ', shortcut: null },
  { label: 'Quote', type: 'line-prefix', value: '> ', shortcut: null },
  { label: 'Code', type: 'wrap', before: '`', after: '`', shortcut: null },
  { label: 'Link', type: 'wrap', before: '[', after: '](url)', shortcut: 'k' },
];

function buildMarkdownTable(rows, cols) {
  const header = '| ' + Array.from({ length: cols }, (_, i) => `Header ${i + 1}`).join(' | ') + ' |';
  const divider = '| ' + Array.from({ length: cols }, () => '---').join(' | ') + ' |';
  const body = Array.from({ length: rows - 1 }, () =>
    '| ' + Array.from({ length: cols }, () => '   ').join(' | ') + ' |'
  ).join('\n');
  return `${header}\n${divider}\n${body}`;
}

function TablePicker({ onInsert }) {
  const [hoverR, setHoverR] = useState(0);
  const [hoverC, setHoverC] = useState(0);
  const maxR = 6;
  const maxC = 6;
  return (
    <div className="absolute left-0 top-full z-20 mt-1 border border-zinc-200 bg-white p-2 shadow-lg">
      <div className="mb-1 text-[10px] text-zinc-500">{hoverR + 1} × {hoverC + 1} table</div>
      <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${maxC}, 18px)` }}>
        {Array.from({ length: maxR * maxC }, (_, i) => {
          const r = Math.floor(i / maxC);
          const c = i % maxC;
          const active = r <= hoverR && c <= hoverC;
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => { setHoverR(r); setHoverC(c); }}
              onClick={() => onInsert(r + 1, c + 1)}
              className={`h-[18px] w-[18px] border ${active ? 'border-zinc-900 bg-zinc-900' : 'border-zinc-200 bg-white'}`}
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * Apply a toolbar transform directly on the DOM textarea, then sync to React.
 * This avoids the cursor-race bug: we mutate the textarea value directly,
 * set the selection, THEN call onChange with the new value.
 */
function applyTransform(textarea, action, onChange) {
  const val = textarea.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = val.slice(start, end);
  let nextValue = val;
  let nextStart = start;
  let nextEnd = end;

  if (action.type === 'wrap') {
    nextValue = `${val.slice(0, start)}${action.before}${selected || 'text'}${action.after}${val.slice(end)}`;
    nextStart = start + action.before.length;
    nextEnd = nextStart + (selected || 'text').length;
  }

  if (action.type === 'prefix') {
    nextValue = `${val.slice(0, start)}${action.value}${val.slice(start)}`;
    nextStart = start + action.value.length;
    nextEnd = end + action.value.length;
  }

  if (action.type === 'line-prefix') {
    const segment = val.slice(start, end) || 'List item';
    const transformed = segment.split('\n').map((line) => `${action.value}${line}`).join('\n');
    nextValue = `${val.slice(0, start)}${transformed}${val.slice(end)}`;
    nextStart = start;
    nextEnd = start + transformed.length;
  }

  // Write directly to DOM first — avoids React controlled re-render race
  textarea.value = nextValue;
  textarea.setSelectionRange(nextStart, nextEnd);
  textarea.focus();
  onChange(nextValue);
}

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function MarkdownComposer({ value, onChange, rows = 10 }) {
  const [mode, setMode] = useState('write');
  const [showTablePicker, setShowTablePicker] = useState(false);
  const textareaRef = useRef(null);
  const syncTimerRef = useRef(null);
  const previewValue = useMemo(() => value || 'Start typing markdown to preview rich slide formatting.', [value]);
  const words = useMemo(() => countWords(value), [value]);

  // Sync external value changes into the textarea (e.g. undo from parent)
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta || document.activeElement === ta) return;
    if (ta.value !== (value || '')) ta.value = value || '';
  }, [value]);

  const handleInput = useCallback((e) => {
    const next = e.target.value;
    // Debounce parent sync to avoid cursor-race during fast typing
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => onChange(next), 16);
  }, [onChange]);

  // Auto-list continuation: Enter after "- item" or "> item" auto-adds prefix
  const handleKeyDown = useCallback((e) => {
    const ta = textareaRef.current;
    if (!ta) return;

    // Keyboard shortcuts: Ctrl+B, Ctrl+I, Ctrl+K
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const action = ACTIONS.find((a) => a.shortcut === e.key.toLowerCase());
      if (action) {
        e.preventDefault();
        applyTransform(ta, action, onChange);
        return;
      }
    }

    // Auto-list continuation on Enter
    if (e.key === 'Enter') {
      const pos = ta.selectionStart;
      const before = ta.value.slice(0, pos);
      const lineStart = before.lastIndexOf('\n') + 1;
      const currentLine = before.slice(lineStart);

      // Match list prefixes: "- ", "* ", "> ", "1. ", "2. ", etc.
      const listMatch = currentLine.match(/^(\s*(?:[-*>]\s|(\d+)\.\s))/);
      if (listMatch) {
        const prefix = listMatch[1];
        const content = currentLine.slice(prefix.length);
        // If the line is empty (just prefix), remove it and exit list
        if (!content.trim()) {
          e.preventDefault();
          const nextValue = ta.value.slice(0, lineStart) + '\n' + ta.value.slice(pos);
          ta.value = nextValue;
          ta.setSelectionRange(lineStart + 1, lineStart + 1);
          onChange(nextValue);
          return;
        }
        // Continue the list
        e.preventDefault();
        let nextPrefix = prefix;
        // Increment numbered lists
        if (listMatch[2]) {
          nextPrefix = prefix.replace(/\d+/, String(Number(listMatch[2]) + 1));
        }
        const insert = '\n' + nextPrefix;
        const nextValue = ta.value.slice(0, pos) + insert + ta.value.slice(pos);
        ta.value = nextValue;
        ta.setSelectionRange(pos + insert.length, pos + insert.length);
        onChange(nextValue);
      }
    }

    // Tab indent: insert 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const pos = ta.selectionStart;
      const nextValue = ta.value.slice(0, pos) + '  ' + ta.value.slice(ta.selectionEnd);
      ta.value = nextValue;
      ta.setSelectionRange(pos + 2, pos + 2);
      onChange(nextValue);
    }
  }, [onChange]);

  const insertTable = (tableRows, tableCols) => {
    const table = buildMarkdownTable(tableRows, tableCols);
    const ta = textareaRef.current;
    if (!ta) { onChange((value || '') + '\n' + table + '\n'); setShowTablePicker(false); return; }
    const pos = ta.selectionStart;
    const before = ta.value.slice(0, pos);
    const after = ta.value.slice(pos);
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const nextValue = `${before}${prefix}${table}\n${after}`;
    ta.value = nextValue;
    ta.setSelectionRange(pos + prefix.length + table.length + 1, pos + prefix.length + table.length + 1);
    ta.focus();
    onChange(nextValue);
    setShowTablePicker(false);
  };

  useEffect(() => () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
  }, []);

  return (
    <div className="border border-zinc-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
        <div className="flex flex-wrap gap-1.5">
          {ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => textareaRef.current && applyTransform(textareaRef.current, action, onChange)}
              title={action.shortcut ? `${action.label} (Ctrl+${action.shortcut.toUpperCase()})` : action.label}
              className="border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400"
            >
              {action.label}
            </button>
          ))}
          <div className="relative">
            <button type="button" onClick={() => setShowTablePicker((v) => !v)} className={`border bg-white px-2 py-1 text-xs font-medium ${showTablePicker ? 'border-zinc-900 text-zinc-900' : 'border-zinc-200 text-zinc-700'}`}>Table</button>
            {showTablePicker && <TablePicker onInsert={insertTable} />}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-zinc-400">{words}w</span>
          <div className="flex gap-1.5">
            {['write', 'split', 'preview'].map((entry) => (
              <button key={entry} type="button" onClick={() => setMode(entry)} className={mode === entry ? 'border border-zinc-900 bg-zinc-900 px-2 py-1 text-xs font-medium text-white' : 'border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700'}>
                {entry}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={mode === 'split' ? 'grid gap-px bg-zinc-200 md:grid-cols-2' : ''}>
        {mode !== 'preview' && (
          <textarea
            ref={textareaRef}
            rows={rows}
            defaultValue={value || ''}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            className="w-full border-0 bg-white px-4 py-3 font-mono text-sm leading-6 text-zinc-800 outline-none"
          />
        )}
        {mode !== 'write' && (
          <div className="min-h-full bg-white px-4 py-3">
            <FormattedTextBlock text={previewValue} className="prose-sm" />
          </div>
        )}
      </div>
    </div>
  );
}
