import { useMemo, useState } from 'react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';

function normalizeRows(block) {
  const sourceRows = block.rows?.length ? block.rows : [['A', 'B'], ['C', 'D']];
  return sourceRows.map((row) => Array.isArray(row) ? row : row.toString().split('|').map((cell) => cell.trim()));
}

const JIGSAW_COLORS = [
  'bg-blue-50 border-blue-300 text-blue-900',
  'bg-emerald-50 border-emerald-300 text-emerald-900',
  'bg-amber-50 border-amber-300 text-amber-900',
  'bg-violet-50 border-violet-300 text-violet-900',
  'bg-rose-50 border-rose-300 text-rose-900',
  'bg-cyan-50 border-cyan-300 text-cyan-900',
  'bg-zinc-50 border-zinc-300 text-zinc-900',
  'bg-orange-50 border-orange-300 text-orange-900',
];

/**
 * SVG jigsaw tab — generates a puzzle-edge path for one side of a piece.
 * dir: 'out' tab sticks out, 'in' tab is a notch, 'flat' no tab.
 */
function edgeType(row, col, side, rows, cols) {
  if (side === 'top' && row === 0) return 'flat';
  if (side === 'left' && col === 0) return 'flat';
  if (side === 'bottom' && row === rows - 1) return 'flat';
  if (side === 'right' && col === cols - 1) return 'flat';
  // Deterministic: use position to decide out/in
  const seed = (row * 7 + col * 13 + (side === 'top' || side === 'bottom' ? 1 : 0)) % 2;
  if (side === 'top') return seed ? 'in' : 'out';
  if (side === 'left') return seed ? 'out' : 'in';
  if (side === 'bottom') return seed ? 'out' : 'in';
  return seed ? 'in' : 'out';
}

function JigsawClipPath({ id, row, col, rows, cols, size }) {
  const s = size;
  const tab = s * 0.2;
  const top = edgeType(row, col, 'top', rows, cols);
  const right = edgeType(row, col, 'right', rows, cols);
  const bottom = edgeType(row, col, 'bottom', rows, cols);
  const left = edgeType(row, col, 'left', rows, cols);

  function topEdge() {
    if (top === 'flat') return `L ${s} 0`;
    const d = top === 'out' ? -1 : 1;
    return `L ${s * 0.35} 0 C ${s * 0.35} ${d * tab}, ${s * 0.65} ${d * tab}, ${s * 0.65} 0 L ${s} 0`;
  }
  function rightEdge() {
    if (right === 'flat') return `L ${s} ${s}`;
    const d = right === 'out' ? 1 : -1;
    return `L ${s} ${s * 0.35} C ${s + d * tab} ${s * 0.35}, ${s + d * tab} ${s * 0.65}, ${s} ${s * 0.65} L ${s} ${s}`;
  }
  function bottomEdge() {
    if (bottom === 'flat') return `L 0 ${s}`;
    const d = bottom === 'out' ? 1 : -1;
    return `L ${s * 0.65} ${s} C ${s * 0.65} ${s + d * tab}, ${s * 0.35} ${s + d * tab}, ${s * 0.35} ${s} L 0 ${s}`;
  }
  function leftEdge() {
    if (left === 'flat') return `L 0 0`;
    const d = left === 'out' ? -1 : 1;
    return `L 0 ${s * 0.65} C ${d * tab} ${s * 0.65}, ${d * tab} ${s * 0.35}, 0 ${s * 0.35} L 0 0`;
  }

  const path = `M 0 0 ${topEdge()} ${rightEdge()} ${bottomEdge()} ${leftEdge()} Z`;

  return (
    <defs>
      <clipPath id={id}>
        <path d={path} />
      </clipPath>
    </defs>
  );
}

export default function PuzzleJigsawTask({ block, onComplete }) {
  const rows = useMemo(() => normalizeRows(block), [block]);
  const numRows = rows.length;
  const numCols = rows[0]?.length || 2;

  // Flatten pieces with their correct position
  const pieces = useMemo(() => {
    const flat = [];
    rows.forEach((row, ri) => {
      row.forEach((cell, ci) => {
        flat.push({ id: `${ri}-${ci}`, text: cell, correctRow: ri, correctCol: ci });
      });
    });
    return flat;
  }, [rows]);

  const [shuffleSeed] = useState(() => crypto.randomUUID());
  const shuffledPieces = useMemo(
    () => stableShuffle(pieces, `${block.id || block.question}-jigsaw-${shuffleSeed}`),
    [block.id, block.question, pieces, shuffleSeed]
  );

  // Board: null means empty cell, otherwise the piece id
  const [board, setBoard] = useState(() =>
    Array.from({ length: numRows }, () => Array.from({ length: numCols }, () => null))
  );
  // Available pieces (not yet placed)
  const [available, setAvailable] = useState(() => shuffledPieces.map((p) => p.id));
  const [draggingPiece, setDraggingPiece] = useState(null);
  const [checked, setChecked] = useState(false);

  const pieceMap = useMemo(() => Object.fromEntries(pieces.map((p) => [p.id, p])), [pieces]);
  const cellSize = 90;

  const handleDragStart = (pieceId) => {
    setDraggingPiece(pieceId);
  };

  const handleDropOnBoard = (row, col) => {
    if (!draggingPiece) return;
    setBoard((prev) => {
      const next = prev.map((r) => [...r]);
      // If the piece was already on the board, clear old position
      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
          if (next[r][c] === draggingPiece) next[r][c] = null;
        }
      }
      // If there's already a piece in the target cell, return it to available
      const displaced = next[row][col];
      if (displaced) {
        setAvailable((prev2) => [...prev2, displaced]);
      }
      next[row][col] = draggingPiece;
      return next;
    });
    setAvailable((prev) => prev.filter((id) => id !== draggingPiece));
    setDraggingPiece(null);
    setChecked(false);
  };

  const handleDropOnBank = () => {
    if (!draggingPiece) return;
    // Remove from board if present
    setBoard((prev) => {
      const next = prev.map((r) => [...r]);
      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
          if (next[r][c] === draggingPiece) next[r][c] = null;
        }
      }
      return next;
    });
    setAvailable((prev) => prev.includes(draggingPiece) ? prev : [...prev, draggingPiece]);
    setDraggingPiece(null);
    setChecked(false);
  };

  const handleTapPlace = (pieceId) => {
    // Find first empty cell and place there
    for (let r = 0; r < numRows; r++) {
      for (let c = 0; c < numCols; c++) {
        if (board[r][c] === null) {
          setBoard((prev) => {
            const next = prev.map((row) => [...row]);
            next[r][c] = pieceId;
            return next;
          });
          setAvailable((prev) => prev.filter((id) => id !== pieceId));
          setChecked(false);
          return;
        }
      }
    }
  };

  const handleTapRemove = (row, col) => {
    const pieceId = board[row][col];
    if (!pieceId) return;
    setBoard((prev) => {
      const next = prev.map((r) => [...r]);
      next[row][col] = null;
      return next;
    });
    setAvailable((prev) => [...prev, pieceId]);
    setChecked(false);
  };

  const checkResult = () => {
    setChecked(true);
    const allPlaced = board.every((row) => row.every((cell) => cell !== null));
    if (!allPlaced) return;
    const allCorrect = board.every((row, ri) =>
      row.every((cell, ci) => {
        if (!cell) return false;
        const piece = pieceMap[cell];
        return piece.correctRow === ri && piece.correctCol === ci;
      })
    );
    const correctCount = board.flat().filter((cell) => {
      if (!cell) return false;
      const piece = pieceMap[cell];
      const ri = board.findIndex((r) => r.includes(cell));
      const ci = board[ri].indexOf(cell);
      return piece.correctRow === ri && piece.correctCol === ci;
    }).length;
    const total = numRows * numCols;
    onComplete?.({
      submitted: true,
      correct: allCorrect,
      score: correctCount / total,
      response: board,
      feedback: allCorrect
        ? (block.explanation || 'All pieces placed correctly!')
        : `${correctCount}/${total} pieces in the right position.`,
    });
  };

  const getCellStatus = (row, col) => {
    if (!checked) return 'neutral';
    const pieceId = board[row][col];
    if (!pieceId) return 'empty';
    const piece = pieceMap[pieceId];
    return piece.correctRow === row && piece.correctCol === col ? 'correct' : 'wrong';
  };

  return (
    <div className="border border-zinc-200 bg-white p-6">
      <div className="mb-2 text-xl font-semibold text-zinc-950">
        <Md text={block.question || block.instruction || 'Assemble the puzzle'} />
      </div>
      {block.hint && <div className="mb-4 text-sm text-zinc-500"><Md text={block.hint} /></div>}

      {/* Board grid */}
      <div className="mb-6 inline-block border border-zinc-300 bg-zinc-100 p-2">
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${numCols}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${numRows}, ${cellSize}px)`,
          }}
        >
          {board.map((row, ri) =>
            row.map((cellPieceId, ci) => {
              const status = getCellStatus(ri, ci);
              const piece = cellPieceId ? pieceMap[cellPieceId] : null;
              const colorIdx = piece ? (piece.correctRow * numCols + piece.correctCol) % JIGSAW_COLORS.length : 0;
              return (
                <div
                  key={`${ri}-${ci}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDropOnBoard(ri, ci)}
                  onClick={() => cellPieceId && handleTapRemove(ri, ci)}
                  className={[
                    'relative flex cursor-pointer items-center justify-center overflow-hidden border-2 transition-all',
                    cellPieceId ? JIGSAW_COLORS[colorIdx] : 'border-dashed border-zinc-300 bg-white',
                    status === 'correct' ? 'ring-2 ring-emerald-500' : '',
                    status === 'wrong' ? 'ring-2 ring-red-400' : '',
                  ].join(' ')}
                  style={{ width: cellSize, height: cellSize }}
                  title={cellPieceId ? 'Click to remove' : `Row ${ri + 1}, Col ${ci + 1}`}
                >
                  {/* Jigsaw edge clip */}
                  <svg width={0} height={0} className="absolute">
                    <JigsawClipPath id={`clip-${ri}-${ci}`} row={ri} col={ci} rows={numRows} cols={numCols} size={cellSize} />
                  </svg>
                  {piece ? (
                    <div
                      draggable
                      onDragStart={() => handleDragStart(cellPieceId)}
                      className="flex h-full w-full items-center justify-center p-1 text-center text-xs font-medium leading-tight"
                    >
                      <Md text={piece.text} />
                    </div>
                  ) : (
                    <span className="text-[10px] font-medium text-zinc-300">{ri + 1},{ci + 1}</span>
                  )}
                  {status === 'correct' && <div className="absolute right-0.5 top-0.5 text-xs text-emerald-600">✓</div>}
                  {status === 'wrong' && <div className="absolute right-0.5 top-0.5 text-xs text-red-500">✗</div>}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Piece bank */}
      {available.length > 0 && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropOnBank}
          className="mb-4 border border-dashed border-zinc-300 bg-zinc-50 p-3"
        >
          <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-400">
            Available pieces ({available.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {available.map((pieceId) => {
              const piece = pieceMap[pieceId];
              const colorIdx = (piece.correctRow * numCols + piece.correctCol) % JIGSAW_COLORS.length;
              return (
                <button
                  key={pieceId}
                  type="button"
                  draggable
                  onDragStart={() => handleDragStart(pieceId)}
                  onClick={() => handleTapPlace(pieceId)}
                  className={`flex items-center justify-center border-2 px-3 py-2 text-xs font-medium transition hover:scale-105 ${JIGSAW_COLORS[colorIdx]}`}
                  style={{ minWidth: 60, minHeight: 40 }}
                  title="Drag or click to place"
                >
                  <Md text={piece.text} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-zinc-500">
          {available.length === 0 ? 'All pieces placed — check your answer!' : `${pieces.length - available.length}/${pieces.length} pieces placed`}
        </div>
        <button
          type="button"
          onClick={checkResult}
          disabled={available.length > 0}
          className="border border-zinc-900 bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40"
        >
          Check
        </button>
      </div>
    </div>
  );
}
