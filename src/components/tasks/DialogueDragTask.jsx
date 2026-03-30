import { useEffect, useMemo, useState, useRef } from 'react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';
import { SPEAKER_COLORS, STRICT_MATCH_THRESHOLD } from '../../config/constants';
import { BLANK_WITH_ANSWER_RE } from '../../utils/patterns';
import { useShuffleSeed } from '../../hooks/useShuffleSeed';

const BLANK_RE = BLANK_WITH_ANSWER_RE;

function parseDialogueLines(text) {
  if (!text) return [];
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line, i) => {
    const m = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.+)$/);
    return m ? { speaker: m[1], content: m[2], index: i } : { speaker: '', content: line, index: i };
  });
}

function extractAnswersFromText(lines) {
  const answers = [];
  for (const line of lines) {
    for (const part of line.content.split(BLANK_RE)) {
      const m = part.match(/^\{(.+)\}$/);
      if (m) answers.push(m[1].trim());
      else if (BLANK_RE.test(part)) answers.push('');
    }
  }
  return answers;
}

export default function DialogueDragTask({ block, onComplete, onProgress }) {
  const lines = useMemo(() => parseDialogueLines(block.text), [block.text]);
  const speakerMap = useMemo(() => {
    const map = new Map();
    lines.forEach((l) => { if (l.speaker && !map.has(l.speaker)) map.set(l.speaker, map.size); });
    return map;
  }, [lines]);

  const blanksPerLine = useMemo(() => lines.map((l) => l.content.split(BLANK_RE).filter((p) => BLANK_RE.test(p)).length), [lines]);
  const totalBlanks = blanksPerLine.reduce((s, c) => s + c, 0);

  const answers = useMemo(() => {
    const embedded = extractAnswersFromText(lines);
    if (embedded.some(Boolean)) return embedded;
    const raw = block.answer || block.correct || block.blanks || '';
    if (Array.isArray(raw)) return raw.map((a) => a.toString().trim());
    return raw.toString().split('|').map((a) => a.trim()).filter(Boolean);
  }, [block.answer, block.correct, block.blanks, lines]);

  const shuffleSeed = useShuffleSeed();
  const indexedPool = useMemo(() => {
    const source = block.options?.length ? [...answers, ...block.options.filter((o) => !answers.includes(o))] : [...answers];
    const indexed = source.map((word, i) => ({ id: i, word }));
    return stableShuffle(indexed, `${block.id}-${shuffleSeed}-dial-drag`);
  }, [answers, block.id, block.options, shuffleSeed]);

  const [pool, setPool] = useState(indexedPool);
  const [values, setValues] = useState(Array(Math.max(totalBlanks, 1)).fill(''));
  const [placedIds, setPlacedIds] = useState(Array(Math.max(totalBlanks, 1)).fill(null));
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [preferTap, setPreferTap] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const q = window.matchMedia('(pointer: coarse)');
    const u = () => setPreferTap(q.matches);
    u(); q.addEventListener?.('change', u);
    return () => q.removeEventListener?.('change', u);
  }, []);

  const selectedItem = useMemo(() => pool.find((i) => i.id === selectedItemId) || null, [pool, selectedItemId]);

  const fillBlank = (idx, item) => {
    if (!item || submitted) return;
    setValues((c) => {
      const next = [...c];
      if (next[idx]) {
        const oldId = placedIds[idx];
        if (oldId !== null) setPool((p) => [...p, { id: oldId, word: next[idx] }]);
      }
      next[idx] = item.word;
      onProgress?.({ submitted: false, response: next });
      return next;
    });
    setPlacedIds((c) => { const n = [...c]; n[idx] = item.id; return n; });
    setPool((p) => p.filter((e) => e.id !== item.id));
    setSelectedItemId(null);
  };

  const releaseBlank = (idx) => {
    if (submitted || !values[idx]) return;
    setPool((p) => [...p, { id: placedIds[idx], word: values[idx] }]);
    setValues((c) => {
      const next = c.map((v, i) => i === idx ? '' : v);
      onProgress?.({ submitted: false, response: next });
      return next;
    });
    setPlacedIds((c) => c.map((v, i) => i === idx ? null : v));
  };

  const getGlobalIdx = (lineIdx, localIdx) => {
    let g = 0;
    for (let i = 0; i < lineIdx; i++) g += blanksPerLine[i];
    return g + localIdx;
  };

  const submit = () => {
    const score = values.reduce((t, v, i) => t + (v.trim().toLowerCase() === (answers[i] || '').trim().toLowerCase() ? 1 : 0), 0) / Math.max(answers.length, 1);
    setSubmitted(true);
    onComplete?.({ submitted: true, correct: score >= STRICT_MATCH_THRESHOLD, score, response: values, correctAnswer: answers });
  };

  return (
    <div className="border border-zinc-200 bg-white">
      <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-4">
        <div className="text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction || 'Complete the dialogue'} /></div>
        {block.hint && !submitted && <div className="mt-1 text-sm text-zinc-500">{block.hint}</div>}
      </div>

      {/* Word bank */}
      <div className="border-b border-zinc-200 px-4 py-3 sm:px-6">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">Word bank — {preferTap ? 'tap to select, then tap blank' : 'drag or tap'}</div>
        <div className="flex flex-wrap gap-2">
          {pool.length === 0 && !submitted && <span className="text-sm text-zinc-400">All placed</span>}
          {pool.map((item) => (
            <button
              key={item.id}
              type="button"
              draggable
              onDragStart={(e) => { setSelectedItemId(item.id); e.dataTransfer.setData('application/json', JSON.stringify(item)); }}
              onClick={() => {
                if (submitted) return;
                if (preferTap) { setSelectedItemId((c) => c === item.id ? null : item.id); return; }
                const first = values.findIndex((v) => !v);
                if (first >= 0) fillBlank(first, item);
                else setSelectedItemId((c) => c === item.id ? null : item.id);
              }}
              className={[
                'border px-3 py-2.5 text-sm font-medium transition min-h-11',
                selectedItemId === item.id ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-900',
              ].join(' ')}
            >
              {item.word}
            </button>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="flex flex-col gap-3 px-4 py-5 sm:px-6" style={{ minHeight: '180px' }}>
        {lines.map((line, lineIdx) => {
          const sIdx = speakerMap.get(line.speaker) ?? 0;
          const colors = SPEAKER_COLORS[sIdx % SPEAKER_COLORS.length];
          const isLeft = sIdx % 2 === 0;
          const parts = line.content.split(BLANK_RE);
          const hasBlanks = blanksPerLine[lineIdx] > 0;
          let localBlank = 0;

          return (
            <div key={lineIdx} className={`flex items-end gap-2.5 ${isLeft ? '' : 'flex-row-reverse'}`} style={{ animation: 'fadeSlideUp 0.3s ease-out' }}>
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center text-xs font-bold text-white ${colors.avatar}`}>
                {line.speaker?.[0]?.toUpperCase() || '?'}
              </div>
              <div className={`max-w-[75%] border px-4 py-2.5 ${colors.bg} ${colors.border} ${colors.text} ${isLeft ? 'bubble-left' : 'bubble-right'}`}>
                {line.speaker && <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-60">{line.speaker}</div>}
                <div className="text-sm leading-relaxed">
                  {hasBlanks ? parts.map((part, pIdx) => {
                    if (!BLANK_RE.test(part)) return <span key={pIdx}>{part}</span>;
                    const gIdx = getGlobalIdx(lineIdx, localBlank);
                    const val = values[gIdx];
                    const correct = submitted && val?.trim().toLowerCase() === (answers[gIdx] || '').trim().toLowerCase();
                    const wrong = submitted && val && !correct;
                    localBlank++;
                    return (
                      <button
                        key={pIdx}
                        type="button"
                        onDrop={(e) => {
                          e.preventDefault();
                          try {
                            fillBlank(gIdx, JSON.parse(e.dataTransfer.getData('application/json')));
                          } catch {
                            // Ignore malformed drag payloads.
                          }
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onClick={() => { if (selectedItem) fillBlank(gIdx, selectedItem); else releaseBlank(gIdx); }}
                        className={[
                          'mx-0.5 inline-flex min-w-16 min-h-9 items-center justify-center border border-dashed px-2 py-1.5 text-sm font-medium transition',
                          correct ? 'border-emerald-400 bg-emerald-50/50 text-emerald-800' : '',
                          wrong ? 'border-red-400 bg-red-50/50 text-red-800' : '',
                          !submitted && val ? 'border-zinc-600 bg-white/50 text-zinc-900' : '',
                          !submitted && !val ? 'border-zinc-300 bg-white/30 text-zinc-400' : '',
                        ].join(' ')}
                      >
                        {val || '…'}
                      </button>
                    );
                  }) : <Md text={line.content} />}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 sm:px-6">
        <div className="text-xs text-zinc-500">
          {submitted
            ? `${values.filter((v, i) => v.trim().toLowerCase() === (answers[i] || '').trim().toLowerCase()).length}/${totalBlanks} correct`
            : `${values.filter(Boolean).length}/${totalBlanks} placed`}
        </div>
        {!submitted && (
          <button type="button" onClick={submit} disabled={values.some((v) => !v)} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">Check</button>
        )}
      </div>

      {submitted && block.explanation && (
        <div className="border-t border-zinc-200 bg-blue-50 px-6 py-3 text-sm text-blue-900"><Md text={block.explanation} /></div>
      )}

      <style>{`@keyframes fadeSlideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
