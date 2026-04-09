import { useMemo, useState } from 'react';
import { getTaskDefinition } from '../../config/taskRegistry';
import { FormattedText, Md } from '../FormattedText';
import { FUZZY_MATCH_THRESHOLD } from '../../config/constants';
import { resolveMediaSource } from '../../utils/media';

function similarity(left, right) {
  const a = (left || '').trim().toLowerCase();
  const b = (right || '').trim().toLowerCase();
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const matrix = Array.from({ length: a.length + 1 }, (_, row) => Array.from({ length: b.length + 1 }, (_, col) => (row === 0 ? col : col === 0 ? row : 0)));
  for (let row = 1; row <= a.length; row += 1) {
    for (let col = 1; col <= b.length; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }
  return 1 - matrix[a.length][b.length] / Math.max(a.length, b.length, 1);
}

function OptionRenderer({ block, onComplete, showCheckButton = true }) {
  const [selected, setSelected] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const correct = useMemo(() => (Array.isArray(block.correct || block.answer) ? (block.correct || block.answer) : `${block.correct || block.answer || ''}`.split(/[|,]/)).map((item) => item.toString().trim().toLowerCase()).filter(Boolean), [block.correct, block.answer]);
  const multi = block.multiple || ['multi_select', 'opinion_survey'].includes(block.taskType);
  const submit = () => {
    const normalized = selected.map((item) => item.toLowerCase());
    const matches = normalized.filter((item) => correct.includes(item)).length;
    const exact = normalized.length === correct.length && correct.every((item) => normalized.includes(item));
    const score = multi ? matches / Math.max(correct.length, 1) : exact ? 1 : 0;
    setSubmitted(true);
    onComplete?.({ submitted: true, correct: exact, score, response: selected, correctAnswer: block.correct || block.answer, feedback: block.explanation || block.hint || '' });
  };
  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-3 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {(block.hint || block.explanation) && <div className="mb-4 text-sm text-zinc-500"><Md text={block.hint || block.explanation} /></div>}
      <div className="space-y-2">
        {(block.options || []).map((option, index) => {
          const active = selected.includes(option);
          return (
            <button key={index} type="button" onClick={() => { if (submitted) return; setSelected((current) => multi ? current.includes(option) ? current.filter((item) => item !== option) : [...current, option] : [option]); }} className={active ? 'w-full border border-zinc-900 bg-zinc-900 px-4 py-3 text-left text-sm text-white' : 'w-full border border-zinc-200 px-4 py-3 text-left text-sm text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50'}>{option}</button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">{multi ? 'Multi-answer' : 'Single answer'}</div>
        <button type="button" onClick={submit} disabled={selected.length === 0} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">{showCheckButton ? 'Check' : 'Save answer'}</button>
      </div>
    </div>
  );
}

function TextRenderer({ block, onComplete, showCheckButton = true }) {
  const [values, setValues] = useState(Array(Math.max(block.blanks?.length || 0, 1)).fill(''));
  const [submitted, setSubmitted] = useState(false);
  const answers = useMemo(() => {
    if (Array.isArray(block.answer)) return block.answer;
    if (block.blanks?.length > 0) return block.blanks;
    return [block.answer || block.correct || ''];
  }, [block.answer, block.correct, block.blanks]);
  const submit = () => {
    const score = values.reduce((total, value, index) => total + similarity(value, answers[index] || ''), 0) / Math.max(values.length, 1);
    setSubmitted(true);
    onComplete?.({ submitted: true, correct: score >= FUZZY_MATCH_THRESHOLD, score, response: values, correctAnswer: answers, feedback: block.explanation || block.hint || '' });
  };
  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-3 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.text && <FormattedText text={block.text} className="mb-4 text-sm leading-7 text-zinc-700" />}
      <div className="space-y-3">
        {values.map((value, index) => (
          <textarea key={index} rows={block.taskType === 'open' ? 5 : 2} value={value} onChange={(event) => setValues((current) => current.map((entry, currentIndex) => currentIndex === index ? event.target.value : entry))} className="w-full resize-y border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-xs text-zinc-500">{block.hint || 'Type your answer.'}</div>
        <button type="button" onClick={submit} disabled={values.every((value) => !value.trim())} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">{block.taskType === 'open' ? 'Save' : (showCheckButton ? 'Check' : 'Save answer')}</button>
      </div>
      {submitted && showCheckButton && (() => {
        const pct = Math.round(values.reduce((total, value, index) => total + similarity(value, answers[index] || ''), 0) / Math.max(values.length, 1) * 100);
        return <div className={['mt-4 border px-4 py-3 text-sm', pct >= 85 ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : pct >= 50 ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-red-300 bg-red-50 text-red-800'].join(' ')}>{pct >= 85 ? 'Great match!' : pct >= 50 ? 'Close — check your answer.' : 'Review the expected answer.'} Score: {pct}%{pct < 85 && answers[0] && <span className="ml-2">Expected: <strong>{answers.join(', ')}</strong></span>}</div>;
      })()}
    </div>
  );
}

function GridRenderer({ block, onComplete }) {
  const rows = block.rows?.length ? block.rows : [['A1', 'A2'], ['B1', 'B2']];
  const [values, setValues] = useState(rows.map((row) => row.map(() => '')));
  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-3 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      <div className="overflow-x-auto border border-zinc-200">
        <table className="min-w-full border-collapse text-sm">
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, colIndex) => (
                  <td key={colIndex} className="border border-zinc-200 p-0">
                    <input value={values[rowIndex][colIndex]} onChange={(event) => setValues((current) => current.map((currentRow, currentRowIndex) => currentRowIndex === rowIndex ? currentRow.map((currentCell, currentColIndex) => currentColIndex === colIndex ? event.target.value : currentCell) : currentRow))} placeholder={cell} className="w-full min-w-24 border-0 px-3 py-3 text-sm outline-none" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => onComplete?.({ submitted: true, correct: true, score: 1, response: values, feedback: 'Grid saved.' })} className="mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">Save grid</button>
    </div>
  );
}

function MediaRenderer({ block, onComplete }) {
  const media = resolveMediaSource(block);
  const [textValue, setTextValue] = useState('');
  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-3 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="border border-zinc-200 bg-zinc-50 p-4">
          {block.taskType === 'video_questions' && media ? <video controls className="w-full" src={media} /> : null}
          {block.taskType === 'audio_transcription' && media ? <audio controls className="w-full" src={media} /> : null}
          {['image_labeling', 'map_geography_label', 'hotspot_selection'].includes(block.taskType) && media ? <img src={media} alt={block.title || block.taskType} loading="lazy" decoding="async" className="w-full object-contain" /> : null}
          {!media && <div className="flex min-h-48 items-center justify-center text-sm text-zinc-500">Attach `Media`, `Image`, `Video`, or `Audio` in DSL.</div>}
        </div>
        <div className="space-y-3">
          <textarea rows={8} value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder="Add notes, labels, answers, or observations" className="w-full resize-y border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
          <button type="button" onClick={() => onComplete?.({ submitted: true, correct: true, score: 1, response: textValue || 'saved', feedback: 'Media response saved.' })} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">Save response</button>
        </div>
      </div>
    </div>
  );
}

function GenericCollectionRenderer({ block, onComplete }) {
  const definition = getTaskDefinition(block.taskType);
  const hasContent = (block.items?.length > 0 || block.pairs?.length > 0 || block.categories?.length > 0 || block.text || block.options?.length > 0);
  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction || definition.label} /></div>
      {block.text && <FormattedText text={block.text} className="mb-4 text-sm leading-7 text-zinc-700" />}
      {hasContent ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {block.items?.length > 0 && <div className="border border-zinc-200 p-4 text-sm text-zinc-700"><div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Items</div>{block.items.map((item, index) => <div key={index} className="py-1">{item}</div>)}</div>}
          {block.pairs?.length > 0 && <div className="border border-zinc-200 p-4 text-sm text-zinc-700"><div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Pairs</div>{block.pairs.map((pair, index) => <div key={index} className="py-1">{pair.left} &rarr; {pair.right}</div>)}</div>}
          {block.categories?.length > 0 && <div className="border border-zinc-200 p-4 text-sm text-zinc-700"><div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Categories</div>{block.categories.map((category, index) => <div key={index} className="py-1">{category}</div>)}</div>}
          {block.options?.length > 0 && !block.items?.length && <div className="border border-zinc-200 p-4 text-sm text-zinc-700"><div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Options</div>{block.options.map((option, index) => <div key={index} className="py-1">{option}</div>)}</div>}
        </div>
      ) : (
        <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">This task has no content to display. Check Items, Options, or Pairs in the DSL.</div>
      )}
      <button type="button" onClick={() => onComplete?.({ submitted: true, correct: true, score: 1, response: 'completed', feedback: block.explanation || block.hint || '' })} className="mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">Mark complete</button>
    </div>
  );
}

export default function GenericTask({ block, onComplete, showCheckButton = true }) {
  const definition = getTaskDefinition(block.taskType);
  if (['choice'].includes(definition.kind)) return <OptionRenderer block={block} onComplete={onComplete} showCheckButton={showCheckButton} />;
  if (['text', 'branch'].includes(definition.kind)) return <TextRenderer block={block} onComplete={onComplete} showCheckButton={showCheckButton} />;
  if (['media'].includes(definition.kind)) return <MediaRenderer block={block} onComplete={onComplete} />;
  if (['grid'].includes(definition.kind)) return <GridRenderer block={block} onComplete={onComplete} />;
  return <GenericCollectionRenderer block={block} onComplete={onComplete} />;
}

