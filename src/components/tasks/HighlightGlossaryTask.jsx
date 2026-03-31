import { useMemo, useState } from 'react';
import { Md } from '../FormattedText';

function splitTextIntoTokens(text) {
  return text.split(/(\s+)/);
}

function normalizeWord(word) {
  return word.replace(/^[^\p{L}\p{N}'-]+|[^\p{L}\p{N}'-]+$/gu, '').toLowerCase();
}

function displayWord(word) {
  return word.replace(/^[^\p{L}\p{N}'-]+|[^\p{L}\p{N}'-]+$/gu, '');
}

function buildTranslationMap(pairs) {
  const map = new Map();
  (pairs || []).forEach((pair) => {
    const key = normalizeWord(pair?.left || '');
    const value = (pair?.right || '').trim();
    if (key && value && !map.has(key)) map.set(key, value);
  });
  return map;
}

export default function HighlightGlossaryTask({ block, onComplete, existingResult, showCheckButton = true }) {
  const tokens = useMemo(() => splitTextIntoTokens(block.text || ''), [block.text]);
  const [selectedIndices, setSelectedIndices] = useState(() => new Set(existingResult?.responseIndices || []));
  const [submitted, setSubmitted] = useState(Boolean(existingResult?.submitted));
  const showVerdict = submitted && showCheckButton;
  const translations = useMemo(() => buildTranslationMap(block.pairs), [block.pairs]);
  const targets = useMemo(() => (block.targets || []).map((item) => normalizeWord(item)).filter(Boolean), [block.targets]);

  const selectedWords = useMemo(() => {
    const seen = new Set();
    return [...selectedIndices]
      .sort((a, b) => a - b)
      .map((index) => {
        const raw = tokens[index] || '';
        const normalized = normalizeWord(raw);
        const text = displayWord(raw);
        return { index, normalized, text, translation: translations.get(normalized) || '' };
      })
      .filter((item) => item.normalized && item.text)
      .filter((item) => {
        if (seen.has(item.normalized)) return false;
        seen.add(item.normalized);
        return true;
      });
  }, [selectedIndices, tokens, translations]);

  const toggleWord = (index) => {
    if (submitted) return;
    const key = normalizeWord(tokens[index] || '');
    if (!key) return;
    setSelectedIndices((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const submit = () => {
    const selected = selectedWords.map((item) => item.normalized);
    const correctMatches = targets.filter((target) => selected.includes(target)).length;
    const score = targets.length > 0 ? correctMatches / targets.length : (selectedWords.length > 0 ? 1 : 0);
    const exact = targets.length > 0 ? score === 1 && selected.every((value) => targets.includes(value)) : selectedWords.length > 0;
    setSubmitted(true);
    onComplete?.({
      submitted: true,
      correct: exact,
      score,
      response: selectedWords.map((item) => item.text),
      responseIndices: [...selectedIndices],
      correctAnswer: targets.length > 0 ? block.targets : undefined,
    });
  };

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950">
        <Md text={block.question || block.instruction || 'Highlight the key words'} />
      </div>
      <div className="mb-5 text-sm text-zinc-500">
        {submitted
          ? `You highlighted ${selectedWords.length} ${selectedWords.length === 1 ? 'word' : 'words'}.`
          : 'Tap words in the passage. They will be collected in the list below.'}
      </div>

      <div className="mb-5 border border-zinc-200 bg-zinc-50/70 p-4 text-base leading-8 text-zinc-800 whitespace-pre-wrap">
        {tokens.map((token, index) => {
          if (/^\s+$/.test(token)) return <span key={index}>{token}</span>;

          const normalized = normalizeWord(token);
          const isSelected = selectedIndices.has(index);
          const isTarget = targets.includes(normalized);

          return (
            <button
              key={index}
              type="button"
              onClick={() => toggleWord(index)}
              className={[
                'inline rounded-sm px-0.5 py-0 align-baseline transition',
                showVerdict && isTarget && isSelected ? 'bg-emerald-100 text-emerald-900' : '',
                showVerdict && !isTarget && isSelected ? 'bg-amber-100 text-zinc-900' : '',
                showVerdict && isTarget && !isSelected ? 'bg-red-100 text-red-700' : '',
                !submitted && isSelected ? 'bg-yellow-200 text-zinc-900' : 'hover:bg-zinc-100',
              ].join(' ')}
            >
              {token}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
          Highlighted words {selectedWords.length > 0 ? `- ${selectedWords.length}` : ''}
        </div>

        {selectedWords.length === 0 && (
          <div className="border border-dashed border-zinc-200 px-4 py-4 text-sm text-zinc-400">
            No words highlighted yet.
          </div>
        )}

        {selectedWords.length > 0 && (
          <div className="space-y-2">
            {selectedWords.map((item) => (
              <div key={item.normalized} className="flex items-center justify-between gap-3 border border-zinc-200 bg-white px-3 py-2">
                <span className="text-sm font-medium text-zinc-900">{item.text}</span>
                {item.translation && (
                  <span className="text-xs text-zinc-500">{item.translation}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showVerdict && targets.length > 0 && (
        <div className="mt-4 border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">Expected words</div>
          <div className="flex flex-wrap gap-1">
            {(block.targets || []).map((target, index) => {
              const found = selectedWords.some((item) => item.normalized === normalizeWord(target));
              return (
                <span key={`${target}-${index}`} className={found ? 'border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700' : 'border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600'}>
                  {target} {found ? '✓' : '✗'}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {!submitted && (
        <button
          type="button"
          onClick={submit}
          disabled={selectedWords.length === 0}
          className="mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40"
        >
          Save highlights
        </button>
      )}
    </div>
  );
}