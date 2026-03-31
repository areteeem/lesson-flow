import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchResultShare } from '../utils/resultSharing';

function cellTone(correct) {
  if (correct === true) return 'bg-emerald-50 text-emerald-700';
  if (correct === false) return 'bg-red-50 text-red-700';
  return 'bg-zinc-50 text-zinc-500';
}

export default function SharedResultPage() {
  const { shareId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const result = await fetchResultShare(shareId);
      if (!active) return;
      if (!result.ok) {
        setError(result.reason || 'Failed to load result');
        setPayload(null);
        setLoading(false);
        return;
      }
      setPayload(result.payload || null);
      setError('');
      setLoading(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, [shareId]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] text-sm text-zinc-500">Loading shared result...</div>;
  }

  if (error || !payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-6">
        <div className="w-full max-w-lg border border-zinc-200 bg-white p-8 text-center">
          <div className="text-lg font-semibold text-zinc-950">Shared result unavailable</div>
          <div className="mt-2 text-sm text-zinc-500">{error || 'This link is invalid or expired.'}</div>
          <button type="button" onClick={() => navigate('/')} className="mt-4 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm text-white">Close</button>
        </div>
      </div>
    );
  }

  if (payload.shareType === 'published_board') {
    const columns = Array.isArray(payload.columns) ? payload.columns : [];
    const rows = Array.isArray(payload.rows) ? payload.rows : [];

    return (
      <div className="min-h-screen bg-[#f7f7f5] px-4 py-8">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="border border-zinc-200 bg-white p-6">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Published Results Board</div>
            <div className="mt-2 text-2xl font-semibold text-zinc-950">{payload.lessonTitle || 'Lesson board'}</div>
            <div className="mt-1 text-sm text-zinc-500">Rows: {rows.length} • Columns: {columns.length}</div>
          </div>

          <div className="overflow-auto border border-zinc-200 bg-white">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-zinc-50 text-left text-[11px] uppercase tracking-[0.12em] text-zinc-500">
                  <th className="sticky left-0 z-10 border-b border-r border-zinc-200 bg-zinc-50 px-3 py-2">Student</th>
                  <th className="border-b border-r border-zinc-200 px-3 py-2">Origin</th>
                  <th className="border-b border-r border-zinc-200 px-3 py-2">Overall</th>
                  {columns.map((column) => (
                    <th key={column.id} className="min-w-[120px] border-b border-r border-zinc-200 px-3 py-2">
                      <div className="text-zinc-700">{column.label}</div>
                      <div className="mt-0.5 text-[10px] font-normal uppercase tracking-[0.08em] text-zinc-400">{column.taskType}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const cellMap = new Map((Array.isArray(row.cells) ? row.cells : []).map((cell) => [cell.columnId, cell]));
                  return (
                    <tr key={row.sessionId || `${row.studentName}-${row.timestamp}`} className="border-t border-zinc-200 align-top">
                      <td className="sticky left-0 z-10 border-r border-zinc-200 bg-white px-3 py-2 font-medium text-zinc-900">{row.studentName || 'Student'}</td>
                      <td className="border-r border-zinc-200 px-3 py-2 text-xs text-zinc-600">{row.origin || 'local'}</td>
                      <td className="border-r border-zinc-200 px-3 py-2 text-zinc-700">{Number(row.overallScore || 0)}%</td>
                      {columns.map((column) => {
                        const cell = cellMap.get(column.id);
                        return (
                          <td key={`${row.sessionId}-${column.id}`} className={`border-r border-zinc-200 px-3 py-2 text-center text-xs ${cellTone(cell?.correct)}`}>
                            {cell && typeof cell.score === 'number' ? `${Math.round(cell.score)}%` : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={Math.max(3, columns.length + 3)} className="px-4 py-5 text-sm text-zinc-500">No board rows found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div>
            <button type="button" onClick={() => navigate('/')} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm text-white">Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] px-4 py-8">
      <div className="mx-auto max-w-2xl border border-zinc-200 bg-white p-6">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Shared Result</div>
        <div className="mt-2 text-2xl font-semibold text-zinc-950">{payload.lessonTitle || 'Lesson result'}</div>
        <div className="mt-1 text-sm text-zinc-500">{payload.studentName || 'Student'} • Score {payload.score ?? 0}%</div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Score</div>
            <div className="mt-1 text-lg font-semibold text-zinc-950">{payload.score ?? 0}%</div>
          </div>
          <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Correct</div>
            <div className="mt-1 text-lg font-semibold text-zinc-950">{payload.correctCount ?? '-'}</div>
          </div>
          <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Reviewed</div>
            <div className="mt-1 text-lg font-semibold text-zinc-950">{payload.completedCount ?? '-'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
