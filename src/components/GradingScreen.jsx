import { useMemo, useState } from 'react';
import { exportSession, printSessionReport, saveSession } from '../storage';
import { summarizeResults } from '../utils/grading';

function statusTone(entry) {
  if (entry.correct === true) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (entry.correct === false) return entry.score > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800';
  return 'border-zinc-200 bg-zinc-50 text-zinc-700';
}

export default function GradingScreen({ lesson, blocks, results, studentName, onStudentNameChange, onRestart, onExit }) {
  const [saved, setSaved] = useState(false);
  const summary = useMemo(() => summarizeResults(blocks, results), [blocks, results]);
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (summary.score / 100) * circumference;

  const sessionPayload = {
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    studentName,
    score: summary.score,
    earned: summary.earned,
    total: summary.total,
    completedCount: summary.breakdown.filter((entry) => entry.result).length,
    correctCount: summary.breakdown.filter((entry) => entry.correct === true).length,
    incorrectCount: summary.breakdown.filter((entry) => entry.correct === false).length,
    breakdown: summary.breakdown,
    lessonPreview: lesson.dsl || lesson.blocks?.map((block) => block.title || block.question || block.instruction || '').find(Boolean) || '',
    timestamp: Date.now(),
  };

  return (
    <div className="min-h-screen bg-[#f7f7f5] px-4 py-8">
      <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">Final report</div>
          <h1 className="mt-3 text-3xl font-semibold text-zinc-950">{lesson.title}</h1>
          <div className="mt-6 flex justify-center">
            <div className="relative flex h-36 w-36 items-center justify-center">
              <svg width="136" height="136" className="-rotate-90">
                <circle cx="68" cy="68" r={radius} fill="none" stroke="#e4e4e7" strokeWidth="10" />
                <circle cx="68" cy="68" r={radius} fill="none" stroke="#111111" strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} style={{ transition: 'stroke-dashoffset 400ms ease' }} />
              </svg>
              <div className="absolute text-center">
                <div className="text-3xl font-semibold text-zinc-950">{summary.score}%</div>
                <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">Score</div>
              </div>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Correct</div>
              <div className="mt-1 text-xl font-semibold text-zinc-950">{sessionPayload.correctCount}</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Reviewed</div>
              <div className="mt-1 text-xl font-semibold text-zinc-950">{sessionPayload.completedCount}</div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Graded</div>
              <div className="mt-1 text-xl font-semibold text-zinc-950">{summary.total}</div>
            </div>
          </div>
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Session</div>
            <label className="mt-3 block space-y-2">
              <span className="text-sm text-zinc-700">Student name</span>
              <input value={studentName} onChange={(event) => onStudentNameChange(event.target.value)} placeholder="Enter student name" className="w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
            </label>
            <div className="mt-4 grid gap-3">
              <button type="button" onClick={() => { saveSession(sessionPayload); setSaved(true); }} className="rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800">Save session</button>
              <button type="button" onClick={() => exportSession(sessionPayload)} className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">Export JSON</button>
              <button type="button" onClick={() => printSessionReport(sessionPayload)} className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">Print / PDF</button>
            </div>
            {saved && <div className="mt-3 text-sm text-emerald-700">Session saved locally.</div>}
          </div>
          <div className="mt-6 grid gap-3">
            <button type="button" onClick={onRestart} className="rounded-2xl border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">Try again</button>
            <button type="button" onClick={onExit} className="rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800">Back to lessons</button>
          </div>
        </section>
        <section className="rounded-[28px] border border-zinc-200 bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">Breakdown</div>
              <h2 className="mt-1 text-2xl font-semibold text-zinc-950">Per-task results</h2>
            </div>
            <div className="rounded-full border border-zinc-200 px-3 py-2 text-xs text-zinc-500">{summary.earned} / {summary.total} graded correct</div>
          </div>
          <div className="mt-5 space-y-3">
            {summary.breakdown.map((entry) => (
              <div key={entry.id} className={`rounded-2xl border px-4 py-4 ${statusTone(entry)}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] opacity-70">{entry.taskType}</div>
                    <div className="mt-1 text-sm font-medium">{entry.label}</div>
                    {entry.result?.feedback && <div className="mt-2 text-xs opacity-75">{entry.result.feedback}</div>}
                  </div>
                  <div className="rounded-full border border-current px-3 py-1 text-xs">{Math.round((entry.score || 0) * 100)}%</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
