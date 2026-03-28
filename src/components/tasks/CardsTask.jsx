import { useMemo, useState } from 'react';
import { stableShuffle } from '../../utils/shuffle';
import { FormattedText, Md } from '../FormattedText';
import { getTranslateUrl, getAvailableLanguages } from '../../utils/translate';
import { useShuffleSeed } from '../../hooks/useShuffleSeed';
import { PASS_SCORE } from '../../config/constants';

function TranslateButton({ text }) {
  const [open, setOpen] = useState(false);
  const langs = getAvailableLanguages();
  return (
    <span className="relative inline-block">
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} className="ml-2 inline-flex items-center rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-500 transition hover:border-zinc-400 hover:text-zinc-700" title="Translate">
        <svg className="mr-1 h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 5h12M9 3v2m1.048 3.5A18.5 18.5 0 003 16m5.8-4.2a18.3 18.3 0 004.4 2.9M21 12l-4.35 8m0 0l-1.65-3m1.65 3l1.65-3" /></svg>
        Translate
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-36 overflow-y-auto border border-zinc-200 bg-white shadow-[0_8px_24px_rgba(0,0,0,0.1)]">
          {langs.map((lang) => (
            <a key={lang.code} href={getTranslateUrl(text, lang.code)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="block px-3 py-1.5 text-xs text-zinc-700 transition hover:bg-zinc-50">{lang.label}</a>
          ))}
        </div>
      )}
    </span>
  );
}

export default function CardsTask({ block, onComplete }) {
  const shuffleSeed = useShuffleSeed();
  const cards = useMemo(() => {
    const source = block.cards?.length ? block.cards : block.pairs?.length ? block.pairs.map((pair) => ({ front: pair.left, back: pair.right })) : block.items?.length ? block.items.map((item) => ({ front: item, back: '' })) : [];
    if (block.shuffle === false) return source;
    return stableShuffle(source, `${block.id || block.question}-${shuffleSeed}-cards`);
  }, [block.cards, block.id, block.items, block.pairs, block.question, block.shuffle, shuffleSeed]);

  const [mode, setMode] = useState('cards'); // cards | grid | quiz
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [seen, setSeen] = useState({});
  const [quizInput, setQuizInput] = useState('');
  const [quizResults, setQuizResults] = useState({}); // index -> 'correct' | 'wrong'
  const [quizRevealed, setQuizRevealed] = useState({});

  const current = cards[index];
  const hasBack = cards.some((c) => c.back);
  const seenCount = Object.keys(seen).length;
  const allSeen = seenCount === cards.length;

  const flip = () => {
    setFlipped((v) => !v);
    setSeen((v) => ({ ...v, [index]: true }));
  };

  const goTo = (i) => { setIndex(i); setFlipped(false); setQuizInput(''); };
  const prev = () => goTo(Math.max(0, index - 1));
  const next = () => goTo(Math.min(cards.length - 1, index + 1));

  const checkQuiz = () => {
    if (!quizInput.trim()) return;
    const correct = current.back && quizInput.trim().toLowerCase() === current.back.trim().toLowerCase();
    setQuizResults((v) => ({ ...v, [index]: correct ? 'correct' : 'wrong' }));
    setSeen((v) => ({ ...v, [index]: true }));
  };

  const revealQuiz = () => setQuizRevealed((v) => ({ ...v, [index]: true }));

  // Report progress
  const reportProgress = () => {
    const quizCorrect = Object.values(quizResults).filter((v) => v === 'correct').length;
    const score = mode === 'quiz' ? quizCorrect / Math.max(cards.length, 1) : seenCount / Math.max(cards.length, 1);
    onComplete?.({ submitted: true, correct: score >= PASS_SCORE, score, response: { mode, seen: seenCount, quizResults }, feedback: 'Cards reviewed.' });
  };

  if (cards.length === 0) {
    return <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">No cards defined. Add Cards, Pairs, or Items in DSL.</div>;
  }

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction || 'Flashcards'} /></div>
          <div className="mt-1 text-sm text-zinc-500">{cards.length} card{cards.length !== 1 ? 's' : ''} · {seenCount} reviewed</div>
        </div>
        <div className="flex gap-1 border border-zinc-200 p-0.5">
          {['cards', 'grid', ...(hasBack ? ['quiz'] : [])].map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={mode === m ? 'rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white' : 'rounded-lg px-3 py-1.5 text-xs text-zinc-600 transition hover:bg-zinc-50'}>{m === 'cards' ? 'Flip' : m === 'grid' ? 'Overview' : 'Quiz'}</button>
          ))}
        </div>
      </div>

      {/* FLIP MODE */}
      {mode === 'cards' && current && (
        <>
          <div style={{ perspective: '1200px' }} className="w-full">
            <button
              type="button"
              onClick={flip}
              className="relative w-full min-h-64"
              style={{ transformStyle: 'preserve-3d', transition: 'transform 0.5s ease', transform: flipped && hasBack ? 'rotateY(180deg)' : 'rotateY(0)' }}
            >
              {/* Front face */}
              <div className="absolute inset-0 flex items-center justify-center border border-zinc-200 bg-zinc-50 p-8 text-center" style={{ backfaceVisibility: 'hidden' }}>
                <div className="absolute left-4 top-4 border border-zinc-200 bg-white px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Term</div>
                <div className="absolute right-4 top-4 text-xs text-zinc-400">{index + 1}/{cards.length}</div>
                <div className="max-w-lg text-2xl font-medium leading-relaxed text-zinc-900"><Md text={current.front} /></div>
              </div>
              {/* Back face */}
              <div className="absolute inset-0 flex items-center justify-center border border-zinc-200 bg-white p-5 md:p-6 xl:p-8 text-center" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                <div className="absolute left-4 top-4 border border-zinc-200 bg-white px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Definition</div>
                <div className="absolute right-4 top-4 text-xs text-zinc-400">{index + 1}/{cards.length}</div>
                <div className="relative max-w-lg">
                  <div className="text-2xl font-medium leading-relaxed text-zinc-900"><Md text={current.back || current.front} /></div>
                  <div className="mt-3"><TranslateButton text={current.front + ' — ' + current.back} /></div>
                </div>
              </div>
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <button type="button" onClick={prev} disabled={index === 0} className="border border-zinc-200 px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40">← Prev</button>
            <div className="flex gap-1.5">
              {cards.map((_, i) => <button key={i} type="button" onClick={() => goTo(i)} className={i === index ? 'h-2 w-6 rounded-full bg-zinc-900 transition-all' : seen[i] ? 'h-2 w-2 rounded-full bg-zinc-400' : 'h-2 w-2 rounded-full bg-zinc-200'} />)}
            </div>
            <button type="button" onClick={next} disabled={index === cards.length - 1} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm text-white transition hover:bg-zinc-800 disabled:opacity-40">Next →</button>
          </div>
        </>
      )}

      {/* GRID / OVERVIEW MODE */}
      {mode === 'grid' && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card, i) => (
            <button key={i} type="button" onClick={() => { setMode('cards'); goTo(i); }} className="group border border-zinc-200 bg-zinc-50 p-3 sm:p-4 text-left transition hover:border-zinc-400 hover:bg-white">
              <div className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-1">{i + 1}</div>
              <div className="text-sm font-semibold text-zinc-900 leading-snug"><Md text={card.front} /></div>
              {card.back && <div className="mt-1.5 text-xs text-zinc-500 leading-snug"><Md text={card.back} /></div>}
              <TranslateButton text={card.front + (card.back ? ' — ' + card.back : '')} />
            </button>
          ))}
        </div>
      )}

      {/* QUIZ MODE */}
      {mode === 'quiz' && current && (
        <>
          <div className="mb-4 flex items-center gap-2">
            <div className="text-xs text-zinc-500">{Object.values(quizResults).filter((v) => v === 'correct').length} / {cards.length} correct</div>
            <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(Object.values(quizResults).filter((v) => v === 'correct').length / cards.length) * 100}%` }} />
            </div>
          </div>
          <div className="border border-zinc-200 bg-zinc-50 p-6 text-center">
            <div className="text-xs text-zinc-400 mb-2">{index + 1}/{cards.length}</div>
            <div className="text-xl font-semibold text-zinc-900 mb-4"><Md text={current.front} /></div>
            {quizResults[index] ? (
              <div className={quizResults[index] === 'correct' ? 'border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800' : 'border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800'}>
                {quizResults[index] === 'correct' ? 'Correct!' : <>Wrong. {quizRevealed[index] ? <span>Answer: <strong>{current.back}</strong></span> : <button type="button" onClick={revealQuiz} className="underline">Show answer</button>}</>}
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={quizInput} onChange={(e) => setQuizInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && checkQuiz()} placeholder="Type the definition…" className="flex-1 border border-zinc-200 px-4 py-2.5 text-sm outline-none transition focus:border-zinc-900" />
                <button type="button" onClick={checkQuiz} disabled={!quizInput.trim()} className="border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40">Check</button>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <button type="button" onClick={prev} disabled={index === 0} className="border border-zinc-200 px-4 py-2 text-sm text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-40">← Prev</button>
            <button type="button" onClick={next} disabled={index === cards.length - 1} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm text-white transition hover:bg-zinc-800 disabled:opacity-40">Next →</button>
          </div>
        </>
      )}

      {/* Footer: Complete */}
      {(allSeen || Object.keys(quizResults).length === cards.length) && (
        <div className="mt-4 flex items-center justify-between border border-zinc-200 bg-zinc-50 px-4 py-3">
          <div className="text-sm text-zinc-600">{mode === 'quiz' ? `${Object.values(quizResults).filter((v) => v === 'correct').length}/${cards.length} correct` : 'All cards reviewed'}</div>
          <button type="button" onClick={reportProgress} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">Done</button>
        </div>
      )}
    </div>
  );
}

