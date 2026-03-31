import { useCallback, useEffect, useRef, useState } from 'react';
import { Md } from '../FormattedText';

let refCounter = 0;
function nextRefId() {
  return `ref-${++refCounter}-${Date.now().toString(36)}`;
}

function splitTextIntoTokens(text) {
  return text.split(/(\s+)/);
}

function buildLinkedTokens(tokens, links) {
  return tokens.map((token, i) => {
    if (/^\s+$/.test(token)) return { token, index: i, type: 'space' };
    const link = links.find((l) => {
      if (l.indices) return l.indices.includes(i);
      return false;
    });
    return { token, index: i, type: link ? 'linked' : 'word', linkId: link?.id };
  });
}

function normalizeLinksResponse(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: entry.id || nextRefId(),
      text: String(entry.text || ''),
      indices: Array.isArray(entry.indices) ? entry.indices.filter((index) => Number.isInteger(index)) : [],
      note: typeof entry.note === 'string' ? entry.note : '',
    }))
    .filter((entry) => entry.text && entry.indices.length > 0);
}

export default function TextLinkingTask({ block, onComplete, existingResult }) {
  const [links, setLinks] = useState(() => normalizeLinksResponse(existingResult?.response));
  const [submitted, setSubmitted] = useState(!!existingResult?.submitted);
  const [flashId, setFlashId] = useState(null);
  const [selectionStart, setSelectionStart] = useState(null);
  const [selectionEnd, setSelectionEnd] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const textRef = useRef(null);
  const glossaryRefs = useRef(new Map());
  const wordRefs = useRef(new Map());
  const targets = block.targets || [];

  const text = block.text || '';
  const tokens = splitTextIntoTokens(text);
  const linkedTokens = buildLinkedTokens(tokens, links);

  const isPointerDown = useRef(false);

  const wordIndices = tokens.reduce((acc, t, i) => {
    if (!/^\s+$/.test(t)) acc.push(i);
    return acc;
  }, []);

  const handlePointerDown = useCallback((index) => {
    if (submitted) return;
    isPointerDown.current = true;
    setSelectionStart(index);
    setSelectionEnd(index);
  }, [submitted]);

  const handlePointerEnter = useCallback((index) => {
    if (!isPointerDown.current || submitted) return;
    setSelectionEnd(index);
  }, [submitted]);

  const getSelectedRange = () => {
    if (selectionStart === null || selectionEnd === null) return null;
    const lo = Math.min(selectionStart, selectionEnd);
    const hi = Math.max(selectionStart, selectionEnd);
    return wordIndices.filter((i) => i >= lo && i <= hi);
  };

  const handlePointerUp = useCallback(() => {
    isPointerDown.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('pointerup', handlePointerUp);
    return () => window.removeEventListener('pointerup', handlePointerUp);
  }, [handlePointerUp]);

  const confirmSelection = () => {
    const range = getSelectedRange();
    if (!range || range.length === 0) return;
    const overlaps = links.some((l) => l.indices?.some((i) => range.includes(i)));
    if (overlaps) return;

    const phrase = range.map((i) => tokens[i]).join(' ');
    const newLink = { id: nextRefId(), text: phrase, indices: range, note: '' };
    setLinks((prev) => [...prev, newLink]);
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  const cancelSelection = () => {
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  const removeLink = (id) => {
    if (submitted) return;
    setLinks((prev) => prev.filter((l) => l.id !== id));
    setEditingId(null);
  };

  const updateNote = (id, note) => {
    setLinks((prev) => prev.map((l) => l.id === id ? { ...l, note } : l));
  };

  const scrollToWord = (link) => {
    const firstIdx = link.indices?.[0];
    if (firstIdx == null) return;
    const el = wordRefs.current.get(firstIdx);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashId(link.id);
      setTimeout(() => setFlashId(null), 800);
    }
  };

  const scrollToGlossary = (link) => {
    const el = glossaryRefs.current.get(link.id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashId(link.id);
      setTimeout(() => setFlashId(null), 800);
    }
  };

  const submit = () => {
    const found = links.map((l) => l.text.toLowerCase());
    const correctMatches = targets.filter((t) => found.includes(t.toLowerCase())).length;
    const score = targets.length > 0 ? correctMatches / targets.length : (links.length > 0 ? 1 : 0);
    setSubmitted(true);
    onComplete?.({
      submitted: true,
      correct: targets.length > 0 ? score === 1 : true,
      score,
      response: links,
      correctAnswer: targets.length > 0 ? targets : undefined,
    });
  };

  const selectedRange = getSelectedRange();
  const hasSelection = selectedRange && selectedRange.length > 0;

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-xl font-semibold text-zinc-950">
        <Md text={block.question || block.instruction || 'Select words to annotate'} />
      </div>
      <div className="mb-4 text-sm text-zinc-500">
        {submitted
          ? `You annotated ${links.length} ${links.length === 1 ? 'term' : 'terms'}.`
          : 'Click or drag to select words, then link them. Click a glossary item to jump back.'}
      </div>

      <div
        ref={textRef}
        className="mb-6 select-none border border-zinc-200 bg-zinc-50/60 p-4 text-base leading-8 text-zinc-800"
      >
        {linkedTokens.map((t) => {
          if (t.type === 'space') return <span key={t.index}>&nbsp;</span>;

          const isLinked = t.type === 'linked';
          const isFlashing = isLinked && flashId && t.linkId === flashId;
          const inDraftRange = !isLinked && hasSelection && selectedRange.includes(t.index);
          const isTarget = targets.length > 0 && submitted && isLinked;
          const link = isLinked ? links.find((l) => l.id === t.linkId) : null;
          const isCorrectTarget = isTarget && link && targets.some((tgt) => tgt.toLowerCase() === link.text.toLowerCase());

          return (
            <span
              key={t.index}
              ref={(el) => { if (el) wordRefs.current.set(t.index, el); }}
              onPointerDown={(e) => { e.preventDefault(); handlePointerDown(t.index); }}
              onPointerEnter={() => handlePointerEnter(t.index)}
              onClick={() => { if (isLinked && link) scrollToGlossary(link); }}
              className={[
                'inline cursor-pointer px-0.5 py-0.5 transition-all duration-200',
                isFlashing ? 'bg-amber-300 text-zinc-900' : '',
                !isFlashing && isLinked && !isTarget ? 'bg-yellow-100 text-zinc-900 hover:bg-yellow-200' : '',
                isTarget && isCorrectTarget ? 'bg-emerald-100 text-emerald-900' : '',
                isTarget && !isCorrectTarget ? 'bg-yellow-100 text-zinc-900' : '',
                inDraftRange ? 'bg-blue-100 text-blue-900' : '',
                !isLinked && !inDraftRange && !submitted ? 'hover:bg-zinc-100' : '',
              ].join(' ')}
            >
              {t.token}
            </span>
          );
        })}
      </div>

      {hasSelection && !submitted && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-zinc-600">
            Selected: <strong>{selectedRange.map((i) => tokens[i]).join(' ')}</strong>
          </span>
          <button
            type="button"
            onClick={confirmSelection}
            className="border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-800"
          >
            Link word
          </button>
          <button
            type="button"
            onClick={cancelSelection}
            className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 transition hover:border-zinc-400"
          >
            Cancel
          </button>
        </div>
      )}

      {links.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">
            Glossary / Annotations — {links.length}
          </div>
          {links.map((link) => {
            const isFlashing = flashId === link.id;
            const isEditing = editingId === link.id;
            return (
              <div
                key={link.id}
                ref={(el) => { if (el) glossaryRefs.current.set(link.id, el); }}
                className={[
                  'border bg-white p-3 transition-all duration-300',
                  isFlashing ? 'border-amber-400 bg-amber-50' : 'border-zinc-200',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => scrollToWord(link)}
                    className="text-sm font-semibold text-zinc-900 underline decoration-yellow-400 decoration-2 underline-offset-2 transition hover:text-zinc-700"
                  >
                    {link.text}
                  </button>
                  <div className="flex shrink-0 gap-1">
                    {!submitted && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditingId(isEditing ? null : link.id)}
                          className="border border-zinc-200 px-2 py-1 text-[10px] text-zinc-500 transition hover:border-zinc-400"
                        >
                          {isEditing ? 'Done' : 'Note'}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeLink(link.id)}
                          className="border border-zinc-200 px-2 py-1 text-[10px] text-red-500 transition hover:border-red-300"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {link.note && !isEditing && (
                  <div className="mt-1 text-xs text-zinc-500">{link.note}</div>
                )}
                {isEditing && !submitted && (
                  <textarea
                    value={link.note}
                    onChange={(e) => updateNote(link.id, e.target.value)}
                    rows={2}
                    placeholder="Add a note, definition, or translation…"
                    className="mt-2 w-full resize-none border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {submitted && targets.length > 0 && (
        <div className="mt-4 border border-zinc-200 bg-zinc-50 p-3">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400 mb-1">Expected annotations</div>
          <div className="flex flex-wrap gap-1">
            {targets.map((t, i) => {
              const found = links.some((l) => l.text.toLowerCase() === t.toLowerCase());
              return (
                <span key={i} className={found ? 'border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700' : 'border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600'}>
                  {t} {found ? '✓' : '✗'}
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
          disabled={links.length === 0}
          className="mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40"
        >
          Submit annotations
        </button>
      )}

      {submitted && (
        <div className="mt-4 border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          Annotations saved ✓
        </div>
      )}
    </div>
  );
}
