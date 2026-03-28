import { useMemo, useState } from 'react';
import { exportSession, printSessionReport, saveSession } from '../storage';
import { summarizeResults } from '../utils/grading';

function statusTone(entry) {
  if (entry.correct === true) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (entry.correct === false) return entry.score > 0 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-800';
  return 'border-zinc-200 bg-zinc-50 text-zinc-700';
}

function getScoreBand(score) {
  if (score >= 90) return { label: 'Excellent', tone: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', message: 'Outstanding performance! You clearly understand this material.' };
  if (score >= 70) return { label: 'Good', tone: 'text-sky-700', bg: 'bg-sky-50 border-sky-200', message: 'Solid work — just a few areas to review for full mastery.' };
  if (score >= 50) return { label: 'Needs Practice', tone: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', message: 'You\'re getting there. Focus on the areas below to improve.' };
  return { label: 'Keep Trying', tone: 'text-red-700', bg: 'bg-red-50 border-red-200', message: 'Don\'t give up — review the mistakes below and try again.' };
}

function computeTakeaways(breakdown) {
  const strengths = [];
  const weaknesses = [];
  const mistakes = [];
  const categoryScores = new Map();

  for (const entry of breakdown) {
    if (entry.correct === null) continue;
    const cat = entry.taskType || 'other';
    if (!categoryScores.has(cat)) categoryScores.set(cat, { total: 0, earned: 0 });
    const bucket = categoryScores.get(cat);
    bucket.total += 1;
    bucket.earned += entry.score || 0;

    if (entry.correct === false) {
      mistakes.push({ label: entry.label, taskType: entry.taskType, feedback: entry.result?.feedback || null });
    }
  }

  for (const [cat, data] of categoryScores) {
    const avg = data.total > 0 ? data.earned / data.total : 0;
    if (avg >= 0.8) strengths.push(cat);
    else if (avg < 0.5) weaknesses.push(cat);
  }

  return { strengths, weaknesses, mistakes };
}

export default function GradingScreen({ lesson, blocks, results, studentName, onStudentNameChange, onRestart, onExit }) {
  const [saved, setSaved] = useState(false);
  const safeBlocks = Array.isArray(blocks) ? blocks.filter(Boolean) : [];
  const summary = useMemo(() => summarizeResults(safeBlocks, results), [safeBlocks, results]);
  const takeaways = useMemo(() => computeTakeaways(summary.breakdown), [summary.breakdown]);
  const scoreBand = useMemo(() => getScoreBand(summary.score), [summary.score]);
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (summary.score / 100) * circumference;

  const sessionPayload = {
    lessonId: lesson?.id || 'unknown-lesson',
    lessonTitle: lesson?.title || 'Untitled Lesson',
    studentName,
    score: summary.score,
    earned: summary.earned,
    total: summary.total,
    completedCount: summary.breakdown.filter((entry) => entry.result).length,
    correctCount: summary.breakdown.filter((entry) => entry.correct === true).length,
    incorrectCount: summary.breakdown.filter((entry) => entry.correct === false).length,
    breakdown: summary.breakdown,
    lessonPreview: lesson?.dsl || lesson?.blocks?.map((block) => block.title || block.question || block.instruction || '').find(Boolean) || '',
    timestamp: Date.now(),
  };

  return (
    <div className="min-h-screen bg-[#f7f7f5] px-4 py-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <section className="rounded-[28px] border border-zinc-200 bg-white p-4 md:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">Final report</div>
          <h1 className="mt-3 text-3xl font-semibold text-zinc-950">{lesson?.title || 'Lesson complete'}</h1>
          <div className="mt-6 flex justify-center">
            <div className="relative flex h-36 w-36 items-center justify-center">
              <svg width="136" height="136" className="-rotate-90" role="img" aria-label={`Score: ${summary.score}%`}>
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
            <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Correct</div>
              <div className="mt-1 text-xl font-semibold text-zinc-950">{sessionPayload.correctCount}</div>
            </div>
            <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Reviewed</div>
              <div className="mt-1 text-xl font-semibold text-zinc-950">{sessionPayload.completedCount}</div>
            </div>
            <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Graded</div>
              <div className="mt-1 text-xl font-semibold text-zinc-950">{summary.total}</div>
            </div>
          </div>
          <div className="mt-6 border border-zinc-200 bg-zinc-50 p-4">
            <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Session</div>
            {lesson?.settings?.allowSessionSave === false ? (
              <div className="mt-3 text-xs text-zinc-400">Session saving is disabled for this lesson.</div>
            ) : (
              <>
                <label className="mt-3 block space-y-2">
                  <span className="text-sm text-zinc-700">Student name</span>
                  <input value={studentName} onChange={(event) => onStudentNameChange(event.target.value)} placeholder="Enter student name" className="w-full border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900" />
                </label>
                <div className="mt-4 grid gap-3">
                  <button type="button" disabled={saved} onClick={() => { saveSession(sessionPayload); setSaved(true); }} className={`border px-4 py-3 text-sm font-medium transition ${saved ? 'border-emerald-300 bg-emerald-50 text-emerald-700 cursor-default' : 'border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800'}`}>{saved ? 'Saved ✓' : 'Save session'}</button>
                  <button type="button" onClick={() => exportSession(sessionPayload)} className="border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">Export JSON</button>
                  <button type="button" onClick={() => printSessionReport(sessionPayload)} className="border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">Print / PDF</button>
                </div>
                {saved && <div className="mt-3 text-sm text-emerald-700">Session saved locally.</div>}
              </>
            )}
          </div>
          <div className="mt-6 grid gap-3">
            <button type="button" onClick={onRestart} className="border border-zinc-200 px-4 py-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">Try again</button>
            <button type="button" onClick={onExit} className="border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-800">Back to lessons</button>
          </div>
        </section>
        <section className="rounded-[28px] border border-zinc-200 bg-white p-4 md:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          {/* Key Takeaways */}
          <div className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">Key Takeaways</div>
          <div className={`mt-3 border p-4 ${scoreBand.bg}`}>
            <div className="flex items-center justify-between gap-3">
              <div className={`text-lg font-semibold ${scoreBand.tone}`}>{scoreBand.label}</div>
              <div className={`border border-current px-3 py-1 text-xs font-medium ${scoreBand.tone}`}>{summary.score}%</div>
            </div>
            <div className={`mt-2 text-sm ${scoreBand.tone}`}>{scoreBand.message}</div>
          </div>

          {takeaways.strengths.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-emerald-600">Strengths</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {takeaways.strengths.map((cat) => (
                  <span key={cat} className="border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">{cat}</span>
                ))}
              </div>
            </div>
          )}

          {takeaways.weaknesses.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-amber-600">Areas for Improvement</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {takeaways.weaknesses.map((cat) => (
                  <span key={cat} className="border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">{cat}</span>
                ))}
              </div>
            </div>
          )}

          {takeaways.mistakes.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-red-600">Mistakes to Review</div>
              <div className="mt-2 space-y-2">
                {takeaways.mistakes.slice(0, 5).map((m, i) => (
                  <div key={i} className="border border-red-200 bg-red-50 px-3 py-2">
                    <div className="text-xs font-medium text-red-800">{m.label}</div>
                    {m.feedback && <div className="mt-1 text-[11px] text-red-600">{m.feedback}</div>}
                  </div>
                ))}
                {takeaways.mistakes.length > 5 && (
                  <div className="text-[11px] text-zinc-500">+{takeaways.mistakes.length - 5} more — see breakdown below</div>
                )}
              </div>
            </div>
          )}

          {takeaways.strengths.length === 0 && takeaways.weaknesses.length === 0 && takeaways.mistakes.length === 0 && (
            <div className="mt-4 border border-zinc-200 bg-zinc-50 px-3 py-3 text-xs text-zinc-500">Complete more tasks to see detailed takeaways.</div>
          )}
        </section>

        <section className="rounded-[28px] border border-zinc-200 bg-white p-4 md:p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.22em] text-zinc-500">Breakdown</div>
              <h2 className="mt-1 text-2xl font-semibold text-zinc-950">Per-task results</h2>
            </div>
            <div className="rounded-full border border-zinc-200 px-3 py-2 text-xs text-zinc-500">{summary.earned} / {summary.total} graded correct</div>
          </div>
          <div className="mt-5 space-y-3">
            {summary.breakdown.length === 0 && <div className="border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-500">No gradable tasks were completed. This lesson ended safely and the session can still be saved or restarted.</div>}
            {summary.breakdown.map((entry) => (
              <div key={entry.id} className={`border px-4 py-4 ${statusTone(entry)}`}>
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
