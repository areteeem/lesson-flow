export default function TableSlide({ block }) {
  const columns = block.columns || [];
  const rows = (block.rows || []).map((row) => Array.isArray(row) ? row : row.split('|').map((cell) => cell.trim()));

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      {block.title && <h2 className="mb-4 text-2xl font-semibold text-zinc-950">{block.title}</h2>}
      <div className="overflow-x-auto border border-zinc-200">
        <table className="min-w-full border-collapse text-left text-sm">
          {columns.length > 0 && (
            <thead className="bg-zinc-50">
              <tr>
                {columns.map((column, index) => (
                  <th key={index} className="border-b border-zinc-200 px-4 py-3 font-medium text-zinc-700">{column}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="odd:bg-white even:bg-zinc-50/60">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="border-b border-zinc-200 px-4 py-3 text-zinc-700">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
