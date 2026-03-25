import { useMemo, useState } from 'react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';

function normalizeRows(block) {
  const sourceRows = block.rows?.length ? block.rows : [['Cell 1', 'Cell 2'], ['Cell 3', 'Cell 4']];
  return sourceRows.map((row) => Array.isArray(row) ? row : row.toString().split('|').map((cell) => cell.trim()));
}

function getCellKey(rowIndex, columnIndex) {
  return `${rowIndex}:${columnIndex}`;
}

export default function MatrixTask({ block, onComplete, existingResult }) {
  const rows = useMemo(() => normalizeRows(block), [block]);
  const columns = block.columns || [];
  const [values, setValues] = useState(rows.map((row) => row.map(() => '')));
  const [shuffleSeed] = useState(() => crypto.randomUUID());
  const hiddenCells = useMemo(() => new Set(block.hiddenCells || []), [block.hiddenCells]);
  const hiddenRows = useMemo(() => new Set((block.hiddenRows || []).map((value) => Number(value))), [block.hiddenRows]);
  const [revealedCells, setRevealedCells] = useState({});

  const isRevealTask = block.taskType === 'table_reveal';

  const randomHiddenCells = useMemo(() => {
    if (!isRevealTask || block.revealMode !== 'random') return new Set();
    const cells = rows.flatMap((row, rowIndex) => row.map((_, columnIndex) => getCellKey(rowIndex, columnIndex)));
    const count = Math.max(0, Math.min(block.randomHiddenCount || Math.ceil(cells.length / 3), cells.length));
    return new Set(stableShuffle(cells, `${block.id || block.question}-${shuffleSeed}-hidden-cells`).slice(0, count));
  }, [block.id, block.question, block.randomHiddenCount, block.revealMode, isRevealTask, rows, shuffleSeed]);

  const isHidden = (rowIndex, columnIndex) => {
    if (!isRevealTask) return false;
    if (hiddenRows.has(rowIndex)) return true;
    if (hiddenCells.has(getCellKey(rowIndex, columnIndex))) return true;
    if (randomHiddenCells.has(getCellKey(rowIndex, columnIndex))) return true;
    return false;
  };

  return (
    <div className="border border-zinc-200 bg-white p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {isRevealTask && <div className="mb-4 text-sm text-zinc-600">Hidden cells can be revealed one by one for guided practice and staged checking.</div>}
      <div className="overflow-auto border border-zinc-200">
        <table className="min-w-full border-collapse text-sm">
          {columns.length > 0 && (
            <thead className="bg-zinc-50">
              <tr>
                {columns.map((column, index) => <th key={index} className="border border-zinc-200 px-3 py-3 text-left font-medium text-zinc-700">{column}</th>)}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, colIndex) => (
                  <td key={colIndex} className="border border-zinc-200 p-0">
                    {isHidden(rowIndex, colIndex) && !revealedCells[getCellKey(rowIndex, colIndex)] ? (
                      <button type="button" onClick={() => setRevealedCells((current) => ({ ...current, [getCellKey(rowIndex, colIndex)]: true }))} className="flex min-h-14 w-full min-w-28 items-center justify-center bg-zinc-900 px-3 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-zinc-800">
                        Reveal
                      </button>
                    ) : (
                      <input
                        value={isRevealTask ? cell : values[rowIndex][colIndex]}
                        onChange={(event) => setValues((current) => current.map((currentRow, currentRowIndex) => currentRowIndex === rowIndex ? currentRow.map((currentCell, currentColIndex) => currentColIndex === colIndex ? event.target.value : currentCell) : currentRow))}
                        placeholder={cell}
                        readOnly={isRevealTask}
                        className={isRevealTask ? 'w-full min-w-28 border-0 bg-zinc-50 px-3 py-3 text-sm font-medium text-zinc-900 outline-none' : 'w-full min-w-28 border-0 px-3 py-3 text-sm outline-none'}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-zinc-500">{isRevealTask ? 'Reveal tables work well for prediction, gap review, and progressive disclosure.' : 'Structured response surface for matrices, compare tables, and grid-style tasks.'}</div>
        <button type="button" onClick={() => onComplete?.({ submitted: true, correct: true, score: 1, response: isRevealTask ? { revealedCells: Object.keys(revealedCells) } : values, feedback: block.explanation || block.hint || (isRevealTask ? 'Reveal table saved.' : 'Matrix saved.') })} className="rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">{isRevealTask ? 'Save progress' : 'Save matrix'}</button>
      </div>
    </div>
  );
}
