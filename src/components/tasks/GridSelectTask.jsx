import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Md } from '../FormattedText';

export default function GridSelectTask({ block, onComplete, onProgress, existingResult, showCheckButton = true }) {
  const columns = useMemo(() => {
    if (Array.isArray(block.columns) && block.columns.length) return block.columns;
    if (Array.isArray(block.options) && block.options.length) return block.options;
    return ['1', '2', '3', '4'];
  }, [block.columns, block.options]);

  const rows = useMemo(() => {
    if (Array.isArray(block.rows) && block.rows.length) {
      return block.rows.map((row) => {
        if (Array.isArray(row)) return row[0] || '';
        return String(row).split('|')[0]?.trim() || '';
      });
    }
    if (Array.isArray(block.items) && block.items.length) return block.items;
    return ['A', 'B', 'C', 'D'];
  }, [block.rows, block.items]);

  const allowMultiple = Boolean(block.multiple);

  // Correct answers: maps row label → expected column(s)
  const correctMap = useMemo(() => {
    const map = {};
    if (Array.isArray(block.pairs) && block.pairs.length) {
      block.pairs.forEach((pair) => {
        const key = String(pair.left || '').trim();
        const vals = String(pair.right || '').split(',').map((v) => v.trim()).filter(Boolean);
        if (key) map[key] = vals;
      });
    } else if (Array.isArray(block.rows) && block.rows.length) {
      block.rows.forEach((row) => {
        if (Array.isArray(row) && row.length > 1) {
          const key = String(row[0] || '').trim();
          const vals = row.slice(1).map((v) => String(v).trim()).filter(Boolean);
          if (key) map[key] = vals;
        } else if (typeof row === 'string' && row.includes('|')) {
          const parts = row.split('|').map((s) => s.trim());
          const key = parts[0];
          if (key && parts.length > 1) map[key] = parts.slice(1);
        }
      });
    }
    return map;
  }, [block.pairs, block.rows]);

  const [selections, setSelections] = useState(() => {
    if (existingResult?.response && typeof existingResult.response === 'object') return existingResult.response;
    return Object.fromEntries(rows.map((r) => [r, []]));
  });
  const [submitted, setSubmitted] = useState(!!existingResult?.submitted);
  const showVerdict = submitted && showCheckButton;
  const requireAll = block.requireAll !== false;

  const toggleCell = (row, col) => {
    if (submitted) return;
    setSelections((prev) => {
      const current = prev[row] || [];
      let next;
      if (allowMultiple) {
        next = current.includes(col) ? current.filter((c) => c !== col) : [...current, col];
      } else {
        next = current.includes(col) ? [] : [col];
      }
      const updated = { ...prev, [row]: next };
      onProgress?.({ submitted: false, response: updated });
      return updated;
    });
  };

  const submit = () => {
    setSubmitted(true);
    const hasCorrectAnswers = Object.keys(correctMap).length > 0;
    let score = 1;
    let correct = true;
    if (hasCorrectAnswers) {
      let totalCorrect = 0;
      rows.forEach((row) => {
        const expected = (correctMap[row] || []).map((v) => v.toLowerCase());
        const selected = (selections[row] || []).map((v) => v.toLowerCase());
        if (expected.length === 0) { totalCorrect++; return; }
        const match = expected.length === selected.length && expected.every((e) => selected.includes(e));
        if (match) totalCorrect++;
      });
      score = totalCorrect / Math.max(rows.length, 1);
      correct = score === 1;
    }
    onComplete?.({
      submitted: true,
      correct,
      score,
      response: selections,
      correctAnswer: correctMap,
    });
  };

  const canSubmit = requireAll ? rows.every((row) => (selections[row] || []).length > 0) : rows.some((row) => (selections[row] || []).length > 0);

  const getCellVerdict = (row, col) => {
    if (!showVerdict) return null;
    const expected = (correctMap[row] || []).map((v) => v.toLowerCase());
    const isSelected = (selections[row] || []).map((v) => v.toLowerCase()).includes(col.toLowerCase());
    if (expected.length === 0) return null;
    if (isSelected && expected.includes(col.toLowerCase())) return 'correct';
    if (isSelected && !expected.includes(col.toLowerCase())) return 'wrong';
    if (!isSelected && expected.includes(col.toLowerCase())) return 'missed';
    return null;
  };

  return (
    <div className="task-shell border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.hint && !submitted && <div className="task-helper-text mb-3 text-xs text-zinc-500">{block.hint}</div>}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="min-w-32 border-b border-zinc-200 pb-3 text-left text-xs font-medium uppercase tracking-[0.15em] text-zinc-500" />
              {columns.map((col) => (
                <th key={col} className="min-w-16 border-b border-zinc-200 px-2 pb-3 text-center text-xs font-medium text-zinc-700">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const rowVerdict = showVerdict && Object.keys(correctMap).length > 0
                ? (() => {
                    const expected = (correctMap[row] || []).map((v) => v.toLowerCase());
                    const selected = (selections[row] || []).map((v) => v.toLowerCase());
                    if (expected.length === 0) return null;
                    return expected.length === selected.length && expected.every((e) => selected.includes(e));
                  })()
                : null;
              return (
                <tr
                  key={row}
                  className={[
                    'transition-colors',
                    rowVerdict === true ? 'bg-emerald-50/60' : '',
                    rowVerdict === false ? 'bg-red-50/60' : '',
                    rowIdx % 2 === 0 && rowVerdict === null ? 'bg-zinc-50/50' : '',
                  ].join(' ')}
                >
                  <td className="border-b border-zinc-100 py-3 pr-4 text-sm font-medium text-zinc-800">
                    <div className="flex items-center gap-2">
                      {rowVerdict === true && <span className="text-emerald-600">✓</span>}
                      {rowVerdict === false && <span className="text-red-500">✗</span>}
                      {row}
                    </div>
                  </td>
                  {columns.map((col) => {
                    const isSelected = (selections[row] || []).includes(col);
                    const verdict = getCellVerdict(row, col);
                    return (
                      <td key={col} className="border-b border-zinc-100 px-2 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => toggleCell(row, col)}
                          disabled={submitted}
                          aria-label={`${row} — ${col}`}
                          className="group relative mx-auto flex h-7 w-7 items-center justify-center"
                        >
                          {allowMultiple ? (
                            <span className={[
                              'flex h-5 w-5 items-center justify-center border transition',
                              isSelected && !showVerdict ? 'border-zinc-900 bg-zinc-900' : '',
                              !isSelected && !showVerdict ? 'border-zinc-300 group-hover:border-zinc-500' : '',
                              verdict === 'correct' ? 'border-emerald-500 bg-emerald-500' : '',
                              verdict === 'wrong' ? 'border-red-400 bg-red-400' : '',
                              verdict === 'missed' ? 'border-emerald-400 border-dashed bg-emerald-50' : '',
                              showVerdict && !verdict && isSelected ? 'border-zinc-400 bg-zinc-400' : '',
                              showVerdict && !verdict && !isSelected ? 'border-zinc-200' : '',
                            ].join(' ')}>
                              {isSelected && <span className="text-[10px] text-white">✓</span>}
                              {verdict === 'missed' && <span className="text-[10px] text-emerald-600">✓</span>}
                            </span>
                          ) : (
                            <span className={[
                              'flex h-5 w-5 items-center justify-center rounded-full border-2 transition',
                              isSelected && !showVerdict ? 'border-zinc-900' : '',
                              !isSelected && !showVerdict ? 'border-zinc-300 group-hover:border-zinc-500' : '',
                              verdict === 'correct' ? 'border-emerald-500' : '',
                              verdict === 'wrong' ? 'border-red-400' : '',
                              verdict === 'missed' ? 'border-emerald-400 border-dashed' : '',
                              showVerdict && !verdict && isSelected ? 'border-zinc-400' : '',
                              showVerdict && !verdict && !isSelected ? 'border-zinc-200' : '',
                            ].join(' ')}>
                              {isSelected && !showVerdict && <span className="h-2.5 w-2.5 rounded-full bg-zinc-900" />}
                              {verdict === 'correct' && <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />}
                              {verdict === 'wrong' && <span className="h-2.5 w-2.5 rounded-full bg-red-400" />}
                              {verdict === 'missed' && <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />}
                              {showVerdict && !verdict && isSelected && <span className="h-2.5 w-2.5 rounded-full bg-zinc-400" />}
                            </span>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {showVerdict && block.explanation && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="task-muted-panel mt-4 border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
            <Md text={block.explanation} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-zinc-400">{allowMultiple ? 'Select one or more per row' : 'Select one per row'}</div>
        {!submitted && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="task-primary-button border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40"
          >
            {showCheckButton ? 'Check' : 'Save'}
          </motion.button>
        )}
      </div>
    </div>
  );
}
