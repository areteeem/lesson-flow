import { useMemo, useState } from 'react';
import { Md } from '../FormattedText';

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => item.toString().trim().toLowerCase());
  if (!value) return [];
  return value.toString().split('|').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function splitBlankTokens(text = '') {
  return text.split(/(\{\}|_{3,}|\[blank\]|\[\d+\])/i).filter((token) => token !== '');
}

export default function TextEntryTask({ block, onComplete, existingResult }) {
  const tokens = useMemo(() => splitBlankTokens(block.text || ''), [block.text]);
  const inlineBlankCount = tokens.filter((token) => /(\{\}|_{3,}|\[blank\]|\[\d+\])/i.test(token)).length;
  const inlineMode = ['fill_typing', 'dialogue_completion', 'type_in_blank'].includes(block.taskType) && inlineBlankCount > 0;

  // For error_correction with multi-line answers, split into per-line correction
  const isMultiLineCorrection = block.taskType === 'error_correction' && !inlineMode;
  const errorLines = useMemo(() => {
    if (!isMultiLineCorrection) return [];
    return (block.text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  }, [block.text, isMultiLineCorrection]);

  const blankCount = inlineMode ? inlineBlankCount : isMultiLineCorrection ? Math.max(errorLines.length, 1) : block.taskType === 'enter' ? Math.max(block.blanks?.length || 0, 1) : 1;
  const [values, setValues] = useState(() => {
    if (existingResult?.response) {
      const resp = existingResult.response;
      return Array.isArray(resp) ? resp : [resp];
    }
    return isMultiLineCorrection ? errorLines.map((l) => l) : Array(blankCount).fill('');
  });
  const [submitted, setSubmitted] = useState(() => Boolean(existingResult?.submitted));
  const answerSets = useMemo(() => {
    if (isMultiLineCorrection) {
      // Parse multi-answer: "corrected1 | corrected2 | ..."
      const answers = Array.isArray(block.answer) ? block.answer : (block.answer || '').split('|').map((s) => s.trim()).filter(Boolean);
      return answers.map((a) => [a.toLowerCase()]);
    }
    if (Array.isArray(block.answer)) return block.answer.map((value) => normalizeList(value));
    if (blankCount > 1) {
      return (block.blanks || []).map((value) => normalizeList(value));
    }
    return [normalizeList(block.answer || block.correct || '')];
  }, [block.answer, block.correct, block.blanks, blankCount, isMultiLineCorrection]);

  const fuzzyMatch = (input, targets) => {
    const a = input.trim().toLowerCase();
    if (!a || !targets?.length) return 0;
    if (targets.includes(a)) return 1;
    // check if answer is close (off by 1-2 chars)
    for (const t of targets) {
      if (Math.abs(a.length - t.length) <= 2 && a.length >= 3) {
        let diff = 0;
        const longer = a.length >= t.length ? a : t;
        const shorter = a.length < t.length ? a : t;
        for (let i = 0; i < longer.length; i++) {
          if (shorter[i] !== longer[i]) diff++;
        }
        if (diff <= 2) return 0.8;
      }
    }
    return 0;
  };

  const submit = () => {
    let score;
    if (block.flexibleOrder && values.length > 1) {
      // Accept answers in any order across all blanks
      const expectedFlat = answerSets.flat();
      const remaining = [...expectedFlat];
      let correct = 0;
      for (const v of values) {
        const norm = v.trim().toLowerCase();
        const idx = remaining.indexOf(norm);
        if (idx >= 0) { correct++; remaining.splice(idx, 1); }
      }
      score = correct / Math.max(answerSets.length, 1);
    } else {
      const scoreParts = values.map((value, index) => {
        const exact = answerSets[index]?.includes(value.trim().toLowerCase()) ? 1 : 0;
        return exact || fuzzyMatch(value, answerSets[index]);
      });
      score = scoreParts.reduce((sum, current) => sum + current, 0) / Math.max(values.length, 1);
    }
    setSubmitted(true);
    onComplete?.({
      submitted: true,
      correct: score >= 0.95,
      score,
      response: values,
      correctAnswer: block.answer || block.correct || block.blanks,
      feedback: score >= 0.95 ? 'Correct' : score >= 0.6 ? 'Close — check your spelling.' : 'Check the expected answer.',
    });
  };

  return (
    <div className="border border-zinc-200 bg-white p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {inlineMode ? (
        <div className="mb-5 rounded-3xl border border-zinc-200 bg-zinc-50 p-5 text-base leading-9 text-zinc-800">
          {tokens.map((token, index) => {
            if (!/(\{\}|_{3,}|\[blank\]|\[\d+\])/i.test(token)) {
              return <span key={index} className="whitespace-pre-wrap">{token}</span>;
            }
            const blankIndex = tokens.slice(0, index + 1).filter((entry) => /(\{\}|_{3,}|\[blank\]|\[\d+\])/i.test(entry)).length - 1;
            const value = values[blankIndex] || '';
            const correct = submitted && answerSets[blankIndex]?.includes(value.trim().toLowerCase());
            const wrong = submitted && value && !correct;
            return (
              <input
                key={index}
                value={value}
                onChange={(event) => setValues((current) => current.map((entry, currentIndex) => currentIndex === blankIndex ? event.target.value : entry))}
                disabled={submitted}
                placeholder={block.placeholder || `Blank ${blankIndex + 1}`}
                className={[
                  'mx-1 inline-flex min-w-32 border-b-2 bg-transparent px-2 py-1 text-center text-base outline-none transition',
                  correct ? 'border-emerald-500 text-emerald-700' : '',
                  wrong ? 'border-red-500 text-red-700' : '',
                  !submitted ? 'border-zinc-400 focus:border-zinc-900' : 'border-zinc-300',
                ].join(' ')}
              />
            );
          })}
        </div>
      ) : isMultiLineCorrection ? (
        <div className="space-y-3">
          {errorLines.map((line, index) => {
            const correct = submitted && answerSets[index]?.includes(values[index]?.trim().toLowerCase());
            const wrong = submitted && values[index] && !correct;
            const expected = answerSets[index]?.[0];
            return (
              <div key={index}>
                <div className="mb-1 text-xs text-zinc-500">Sentence {index + 1}:</div>
                <textarea
                  rows={2}
                  value={values[index] || ''}
                  onChange={(event) => setValues((current) => current.map((entry, currentIndex) => currentIndex === index ? event.target.value : entry))}
                  disabled={submitted}
                  placeholder="Correct this sentence..."
                  className={[
                    'w-full resize-y rounded-2xl border px-4 py-3 text-sm outline-none transition',
                    correct ? 'border-emerald-400 bg-emerald-50' : '',
                    wrong ? 'border-red-400 bg-red-50' : '',
                    !submitted ? 'border-zinc-200 focus:border-blue-400' : 'border-zinc-200',
                  ].join(' ')}
                />
                {wrong && expected && (
                  <div className="mt-1 text-xs text-red-600">Expected: {expected}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          {block.text && <div className="mb-4 whitespace-pre-wrap text-sm leading-7 text-zinc-700">{block.text}</div>}
          <div className="space-y-3">
            {values.map((value, index) => {
              const correct = submitted && answerSets[index]?.includes(value.trim().toLowerCase());
              const wrong = submitted && value && !correct;
              return (
                <textarea
                  key={index}
                  rows={block.taskType === 'open' ? 5 : 2}
                  value={value}
                  onChange={(event) => setValues((current) => current.map((entry, currentIndex) => currentIndex === index ? event.target.value : entry))}
                  disabled={submitted && block.taskType !== 'open'}
                  placeholder={block.placeholder || `Answer ${index + 1}`}
                  className={[
                    'w-full resize-y rounded-2xl border px-4 py-3 text-sm outline-none transition',
                    correct ? 'border-emerald-400 bg-emerald-50' : '',
                    wrong ? 'border-red-400 bg-red-50' : '',
                    !submitted ? 'border-zinc-200 focus:border-blue-400' : 'border-zinc-200',
                  ].join(' ')}
                />
              );
            })}
          </div>
        </>
      )}
      {submitted && block.explanation && (
        <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900"><Md text={block.explanation} /></div>
      )}
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="text-xs text-zinc-500">{block.examples?.length ? `Example: ${block.examples[0]}` : block.hint || 'Type your answer and check it.'}</div>
        {!submitted && (
          <button type="button" onClick={submit} disabled={values.every((value) => !value.trim())} className="rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">
            {block.taskType === 'open' ? 'Save response' : 'Check'}
          </button>
        )}
      </div>
    </div>
  );
}
