import { useMemo, useState, useEffect, useRef } from 'react';
import { Md } from '../FormattedText';
import { SPEAKER_COLORS, STRICT_MATCH_THRESHOLD } from '../../config/constants';
import { BLANK_WITH_ANSWER_RE } from '../../utils/patterns';

const BLANK_RE = BLANK_WITH_ANSWER_RE;

function parseDialogueLines(text) {
  if (!text) return [];
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line, i) => {
    const match = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.+)$/);
    if (match) return { speaker: match[1], content: match[2], index: i };
    return { speaker: '', content: line, index: i };
  });
}

/** Extract embedded answers from {answer} tokens in dialogue text */
function extractEmbeddedAnswers(lines) {
  const answers = [];
  for (const line of lines) {
    const parts = line.content.split(BLANK_RE);
    for (const part of parts) {
      const m = part.match(/^\{(.+)\}$/);
      if (m) answers.push(m[1].trim());
      else if (BLANK_RE.test(part) && !part.match(/^\{.+\}$/)) answers.push('');
    }
  }
  return answers;
}

function getSpeakerIndex(speaker, speakerMap) {
  if (!speaker) return 0;
  if (speakerMap.has(speaker)) return speakerMap.get(speaker);
  const idx = speakerMap.size;
  speakerMap.set(speaker, idx);
  return idx;
}

function splitBlanks(text) {
  return text.split(BLANK_RE).filter((t) => t !== '');
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <span className="h-2 w-2 animate-bounce rounded-full dot-round bg-zinc-400" style={{ animationDelay: '0ms' }} />
      <span className="h-2 w-2 animate-bounce rounded-full dot-round bg-zinc-400" style={{ animationDelay: '150ms' }} />
      <span className="h-2 w-2 animate-bounce rounded-full dot-round bg-zinc-400" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

export default function DialogueTask({ block, onComplete }) {
  const lines = useMemo(() => parseDialogueLines(block.text), [block.text]);
  const speakerMap = useMemo(() => {
    const map = new Map();
    lines.forEach((l) => { if (l.speaker) getSpeakerIndex(l.speaker, map); });
    return map;
  }, [lines]);

  const blanksPerLine = useMemo(() => lines.map((l) => {
    const parts = splitBlanks(l.content);
    return parts.filter((p) => BLANK_RE.test(p)).length;
  }), [lines]);

  const totalBlanks = blanksPerLine.reduce((s, c) => s + c, 0);

  const answers = useMemo(() => {
    // Prefer embedded {answer} tokens in the dialogue text
    const embedded = extractEmbeddedAnswers(lines);
    if (embedded.some(Boolean)) return embedded;
    // Fallback to explicit answer field
    const raw = block.answer || block.correct || '';
    if (Array.isArray(raw)) return raw.map((a) => a.toString().trim());
    return raw.toString().split('|').map((a) => a.trim()).filter(Boolean);
  }, [block.answer, block.correct, lines]);

  const [values, setValues] = useState(() => Array(Math.max(totalBlanks, 1)).fill(''));
  const [submitted, setSubmitted] = useState(false);
  const [revealedCount, setRevealedCount] = useState(() => {
    // Reveal all lines with no blanks from the start, stop at first blank
    let count = 0;
    for (const n of blanksPerLine) {
      if (n === 0) count++;
      else { count++; break; }
    }
    return count;
  });
  const [showTyping, setShowTyping] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [revealedCount, showTyping]);

  const revealNext = () => {
    if (revealedCount >= lines.length) return;
    setShowTyping(true);
    setTimeout(() => {
      setShowTyping(false);
      setRevealedCount((c) => {
        let next = c + 1;
        // Auto-reveal lines without blanks
        while (next < lines.length && blanksPerLine[next] === 0) next++;
        if (next < lines.length && blanksPerLine[next] > 0) next++;
        return Math.min(next, lines.length);
      });
    }, 600);
  };

  const getBlankGlobalIndex = (lineIdx, localBlankIdx) => {
    let global = 0;
    for (let i = 0; i < lineIdx; i++) global += blanksPerLine[i];
    return global + localBlankIdx;
  };

  const checkLineComplete = (lineIdx) => {
    const startIdx = getBlankGlobalIndex(lineIdx, 0);
    const count = blanksPerLine[lineIdx];
    for (let i = 0; i < count; i++) {
      if (!values[startIdx + i]?.trim()) return false;
    }
    return true;
  };

  const allRevealedBlanksComplete = () => {
    for (let i = 0; i < revealedCount; i++) {
      if (blanksPerLine[i] > 0 && !checkLineComplete(i)) return false;
    }
    return true;
  };

  const submit = () => {
    let score;
    if (block.flexibleOrder && totalBlanks > 1) {
      // Group consecutive blanks per line and check if values match as a set
      let correct = 0;
      let total = 0;
      let globalIdx = 0;
      for (let li = 0; li < blanksPerLine.length; li++) {
        const count = blanksPerLine[li];
        if (count <= 1) {
          if (count === 1) {
            total++;
            const expected = (answers[globalIdx] || '').trim().toLowerCase();
            if (expected && values[globalIdx]?.trim().toLowerCase() === expected) correct++;
          }
          globalIdx += count;
          continue;
        }
        // Multiple blanks on same line — accept any order
        const expectedSet = [];
        const givenSet = [];
        for (let k = 0; k < count; k++) {
          expectedSet.push((answers[globalIdx + k] || '').trim().toLowerCase());
          givenSet.push((values[globalIdx + k] || '').trim().toLowerCase());
        }
        total += count;
        const remaining = [...expectedSet];
        for (const g of givenSet) {
          const idx = remaining.indexOf(g);
          if (idx >= 0) { correct++; remaining.splice(idx, 1); }
        }
        globalIdx += count;
      }
      score = correct / Math.max(total, 1);
    } else {
      const scores = values.map((v, i) => {
        const expected = (answers[i] || '').trim().toLowerCase();
        if (!expected) return 1;
        return v.trim().toLowerCase() === expected ? 1 : 0;
      });
      score = scores.reduce((s, c) => s + c, 0) / Math.max(scores.length, 1);
    }
    setSubmitted(true);
    onComplete?.({
      submitted: true,
      correct: score >= STRICT_MATCH_THRESHOLD,
      score,
      response: values,
      correctAnswer: answers,
      feedback: score >= STRICT_MATCH_THRESHOLD ? 'Correct!' : 'Check the expected answers.',
    });
  };

  const canContinue = revealedCount < lines.length && allRevealedBlanksComplete();
  const canSubmit = revealedCount >= lines.length && allRevealedBlanksComplete() && totalBlanks > 0;

  return (
    <div className="border border-zinc-200 bg-white">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-4">
        <div className="text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction || 'Complete the dialogue'} /></div>
        {block.hint && !submitted && <div className="mt-1 text-sm text-zinc-500">{block.hint}</div>}
      </div>

      {/* Chat area */}
      <div className="flex flex-col gap-3 px-4 py-5 sm:px-6" style={{ minHeight: '200px' }}>
        {lines.slice(0, revealedCount).map((line, lineIdx) => {
          const sIdx = getSpeakerIndex(line.speaker, speakerMap);
          const colors = SPEAKER_COLORS[sIdx % SPEAKER_COLORS.length];
          const isLeft = sIdx % 2 === 0;
          const parts = splitBlanks(line.content);
          const hasBlanks = blanksPerLine[lineIdx] > 0;
          let localBlank = 0;

          return (
            <div
              key={lineIdx}
              className={`flex items-end gap-2.5 ${isLeft ? '' : 'flex-row-reverse'}`}
              style={{ animation: 'fadeSlideUp 0.3s ease-out' }}
            >
              {/* Avatar */}
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center text-xs font-bold text-white ${colors.avatar}`}>
                {line.speaker ? line.speaker[0].toUpperCase() : '?'}
              </div>

              {/* Bubble */}
              <div className={`max-w-[75%] border px-4 py-2.5 ${colors.bg} ${colors.border} ${colors.text} ${isLeft ? 'bubble-left' : 'bubble-right'}`}>
                {line.speaker && <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-60">{line.speaker}</div>}
                <div className="text-sm leading-relaxed">
                  {hasBlanks ? (
                    parts.map((part, pIdx) => {
                      if (!BLANK_RE.test(part)) return <span key={pIdx}>{part}</span>;
                      const globalIdx = getBlankGlobalIndex(lineIdx, localBlank);
                      const val = values[globalIdx] || '';
                      const expected = (answers[globalIdx] || '').trim().toLowerCase();
                      const correct = submitted && expected && val.trim().toLowerCase() === expected;
                      const wrong = submitted && expected && val.trim().toLowerCase() !== expected;
                      localBlank++;
                      return (
                        <input
                          key={pIdx}
                          value={val}
                          onChange={(e) => {
                            const idx = globalIdx;
                            setValues((c) => c.map((v, i) => i === idx ? e.target.value : v));
                          }}
                          disabled={submitted}
                          placeholder="…"
                          className={[
                            'mx-0.5 inline-flex w-24 border-b-2 bg-transparent px-1 py-0.5 text-center text-sm outline-none transition',
                            correct ? 'border-emerald-500 text-emerald-800' : '',
                            wrong ? 'border-red-500 text-red-800' : '',
                            !submitted ? 'border-zinc-400 focus:border-zinc-900' : '',
                          ].join(' ')}
                        />
                      );
                    })
                  ) : (
                    <Md text={line.content} />
                  )}
                </div>
                {submitted && hasBlanks && (() => {
                  const start = getBlankGlobalIndex(lineIdx, 0);
                  const count = blanksPerLine[lineIdx];
                  const wrongs = [];
                  for (let i = 0; i < count; i++) {
                    const expected = (answers[start + i] || '').trim();
                    const val = (values[start + i] || '').trim();
                    if (expected && val.toLowerCase() !== expected.toLowerCase()) {
                      wrongs.push({ idx: i + 1, expected });
                    }
                  }
                  if (wrongs.length === 0) return null;
                  return (
                    <div className="mt-1.5 text-xs text-red-700 opacity-80">
                      {wrongs.map((w) => <div key={w.idx}>Blank {w.idx}: <strong>{w.expected}</strong></div>)}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {showTyping && (
          <div className="flex items-end gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center bg-zinc-400 text-xs font-bold text-white">…</div>
            <div className="bubble-left border border-zinc-200 bg-zinc-50 px-4 py-2.5">
              <TypingIndicator />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 sm:px-6">
        <div className="text-xs text-zinc-500">
          {submitted
            ? `${values.filter((v, i) => v.trim().toLowerCase() === (answers[i] || '').trim().toLowerCase()).length}/${totalBlanks} correct`
            : `${revealedCount}/${lines.length} messages`}
        </div>
        <div className="flex gap-2">
          {canContinue && !submitted && (
            <button type="button" onClick={revealNext} className="border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:border-zinc-900">Continue ↓</button>
          )}
          {canSubmit && !submitted && (
            <button type="button" onClick={submit} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">Check</button>
          )}
        </div>
      </div>

      {submitted && block.explanation && (
        <div className="border-t border-zinc-200 bg-blue-50 px-6 py-3 text-sm text-blue-900"><Md text={block.explanation} /></div>
      )}

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}


