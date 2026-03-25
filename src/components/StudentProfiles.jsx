import { useMemo, useState } from 'react';

export default function StudentProfiles({ sessions = [], onBack }) {
  const [selectedStudent, setSelectedStudent] = useState(null);

  const profiles = useMemo(() => {
    const map = new Map();
    sessions.forEach((session) => {
      const name = (session.studentName || 'Anonymous').trim();
      if (!map.has(name)) map.set(name, { name, sessions: [] });
      map.get(name).sessions.push(session);
    });
    return [...map.values()].map((profile) => {
      const sorted = [...profile.sessions].sort((a, b) => b.timestamp - a.timestamp);
      const scores = sorted.map((s) => s.score ?? 0);
      const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      const latestScore = scores[0] ?? 0;
      const totalTasks = sorted.reduce((sum, s) => sum + (s.total || 0), 0);
      const totalCorrect = sorted.reduce((sum, s) => sum + (s.correctCount || 0), 0);

      // Identify weak areas from breakdown
      const taskTypeScores = new Map();
      sorted.forEach((s) => {
        (s.breakdown || []).forEach((item) => {
          const label = item.label || 'unknown';
          if (!taskTypeScores.has(label)) taskTypeScores.set(label, { correct: 0, total: 0 });
          const entry = taskTypeScores.get(label);
          entry.total += 1;
          if (item.correct) entry.correct += 1;
          else if (item.score > 0) entry.correct += item.score;
        });
      });

      const weakAreas = [...taskTypeScores.entries()]
        .map(([label, { correct, total }]) => ({ label, accuracy: total > 0 ? Math.round((correct / total) * 100) : 0, total }))
        .filter((a) => a.total >= 2)
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 5);

      const strongAreas = [...taskTypeScores.entries()]
        .map(([label, { correct, total }]) => ({ label, accuracy: total > 0 ? Math.round((correct / total) * 100) : 0, total }))
        .filter((a) => a.total >= 2)
        .sort((a, b) => b.accuracy - a.accuracy)
        .slice(0, 5);

      // Score trend (last 5 sessions)
      const trend = sorted.slice(0, 5).reverse().map((s) => ({ score: s.score ?? 0, date: new Date(s.timestamp).toLocaleDateString() }));

      return { ...profile, sessions: sorted, avgScore, latestScore, totalTasks, totalCorrect, weakAreas, strongAreas, trend };
    }).sort((a, b) => b.sessions[0].timestamp - a.sessions[0].timestamp);
  }, [sessions]);

  const detail = selectedStudent ? profiles.find((p) => p.name === selectedStudent) : null;

  return (
    <div className="min-h-screen bg-[#f7f7f5]">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            {detail && (
              <button type="button" onClick={() => setSelectedStudent(null)} className="border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-600 hover:border-zinc-900">← Back</button>
            )}
            <div>
              <div className="text-sm font-semibold text-zinc-900">{detail ? detail.name : 'Student Profiles'}</div>
              <div className="text-[10px] text-zinc-400">{detail ? `${detail.sessions.length} sessions` : `${profiles.length} students`}</div>
            </div>
          </div>
          <button type="button" onClick={onBack} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-zinc-900">Close</button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl p-4">
        {!detail ? (
          /* Student list */
          profiles.length === 0 ? (
            <div className="py-20 text-center text-sm text-zinc-400">No student sessions yet. Play a lesson and enter a student name to start tracking.</div>
          ) : (
            <div className="space-y-2">
              {profiles.map((p) => (
                <button key={p.name} type="button" onClick={() => setSelectedStudent(p.name)} className="flex w-full items-center justify-between border border-zinc-200 bg-white px-4 py-3 text-left transition hover:border-zinc-900">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-zinc-900">{p.name}</div>
                    <div className="mt-0.5 flex gap-3 text-[11px] text-zinc-500">
                      <span>{p.sessions.length} session{p.sessions.length !== 1 ? 's' : ''}</span>
                      <span>{p.totalTasks} tasks</span>
                      <span>Last: {new Date(p.sessions[0].timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-lg font-bold text-zinc-900">{p.avgScore}%</div>
                      <div className="text-[10px] text-zinc-400">avg score</div>
                    </div>
                    {p.weakAreas.length > 0 && (
                      <div className="hidden text-right sm:block">
                        <div className="text-[10px] font-medium text-rose-600">Needs work</div>
                        <div className="text-[10px] text-zinc-500">{p.weakAreas[0].label}</div>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )
        ) : (
          /* Student detail */
          <div className="space-y-5">
            {/* Score overview cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Avg Score" value={`${detail.avgScore}%`} />
              <StatCard label="Latest" value={`${detail.latestScore}%`} />
              <StatCard label="Tasks Done" value={detail.totalTasks} />
              <StatCard label="Correct" value={detail.totalCorrect} />
            </div>

            {/* Score trend */}
            {detail.trend.length > 1 && (
              <div className="border border-zinc-200 bg-white p-4">
                <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Score Trend (recent)</div>
                <div className="flex h-24 items-end gap-2">
                  {detail.trend.map((t, i) => (
                    <div key={i} className="flex flex-1 flex-col items-center gap-1">
                      <div className="text-[10px] font-medium text-zinc-700">{t.score}%</div>
                      <div className="w-full bg-zinc-900 transition-all" style={{ height: `${Math.max(4, (t.score / 100) * 80)}px` }} />
                      <div className="text-[9px] text-zinc-400">{t.date}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weak & Strong areas */}
            <div className="grid gap-3 sm:grid-cols-2">
              {detail.weakAreas.length > 0 && (
                <div className="border border-zinc-200 bg-white p-4">
                  <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-rose-500">Needs Improvement</div>
                  <div className="space-y-2">
                    {detail.weakAreas.map((a) => (
                      <div key={a.label} className="flex items-center justify-between">
                        <span className="text-xs text-zinc-700">{a.label}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 bg-zinc-100"><div className="h-full bg-rose-400" style={{ width: `${a.accuracy}%` }} /></div>
                          <span className="w-8 text-right text-[10px] font-medium text-zinc-500">{a.accuracy}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {detail.strongAreas.length > 0 && (
                <div className="border border-zinc-200 bg-white p-4">
                  <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-600">Strong Areas</div>
                  <div className="space-y-2">
                    {detail.strongAreas.map((a) => (
                      <div key={a.label} className="flex items-center justify-between">
                        <span className="text-xs text-zinc-700">{a.label}</span>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 bg-zinc-100"><div className="h-full bg-emerald-400" style={{ width: `${a.accuracy}%` }} /></div>
                          <span className="w-8 text-right text-[10px] font-medium text-zinc-500">{a.accuracy}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Session history */}
            <div className="border border-zinc-200 bg-white p-4">
              <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Session History</div>
              <div className="space-y-1.5">
                {detail.sessions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between border-b border-zinc-100 py-2 last:border-0">
                    <div>
                      <div className="text-xs font-medium text-zinc-800">{s.lessonTitle || 'Untitled'}</div>
                      <div className="text-[10px] text-zinc-400">{new Date(s.timestamp).toLocaleString()}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-zinc-500">{s.correctCount}/{s.total} correct</span>
                      <span className={`text-sm font-bold ${s.score >= 70 ? 'text-emerald-600' : s.score >= 40 ? 'text-amber-600' : 'text-rose-600'}`}>{s.score ?? 0}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="border border-zinc-200 bg-white p-3 text-center">
      <div className="text-lg font-bold text-zinc-900">{value}</div>
      <div className="text-[10px] text-zinc-400">{label}</div>
    </div>
  );
}
