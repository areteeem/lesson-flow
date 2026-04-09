import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Md } from '../FormattedText';

const CLOUD_COLORS = ['#18181b', '#2563eb', '#059669', '#d97706', '#7c3aed', '#e11d48', '#0891b2', '#ea580c', '#4f46e5', '#65a30d'];

function buildWordLayout(words, containerWidth) {
  if (words.length === 0) return [];
  const maxCount = Math.max(...words.map((w) => w.count));
  const minSize = Math.max(12, containerWidth * 0.03);
  const maxSize = Math.min(48, containerWidth * 0.1);

  return words.map((word, i) => {
    const ratio = maxCount > 1 ? word.count / maxCount : 1;
    const fontSize = minSize + ratio * (maxSize - minSize);
    const angle = i % 5 === 0 ? (i % 2 === 0 ? -15 : 15) : 0;
    // Distribute in a cloud-like pattern using golden angle
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const r = Math.sqrt(i / words.length) * 0.35;
    const theta = i * goldenAngle;
    const x = 0.5 + r * Math.cos(theta);
    const y = 0.5 + r * Math.sin(theta);

    return {
      text: word.text,
      count: word.count,
      fontSize,
      x: Math.max(0.1, Math.min(0.9, x)),
      y: Math.max(0.1, Math.min(0.9, y)),
      color: CLOUD_COLORS[i % CLOUD_COLORS.length],
      rotation: angle,
    };
  });
}

export default function WordCloudTask({ block, onComplete, onProgress }) {
  const containerRef = useRef(null);
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [userWords, setUserWords] = useState([]);
  const [containerSize, setContainerSize] = useState({ width: 400, height: 300 });

  // Pre-seeded words from block items
  const seedWords = useMemo(() => {
    if (!block.items?.length) return [];
    return block.items.map((item) => {
      const text = typeof item === 'string' ? item : String(item || '');
      if (text.includes(':')) {
        const [word, count] = text.split(':').map((s) => s.trim());
        return { text: word, count: Number(count) || 1 };
      }
      return { text, count: 1 };
    });
  }, [block.items]);

  const allWords = useMemo(() => {
    const map = new Map();
    for (const w of seedWords) {
      const key = w.text.toLowerCase();
      map.set(key, { text: w.text, count: (map.get(key)?.count || 0) + w.count });
    }
    for (const w of userWords) {
      const key = w.toLowerCase();
      map.set(key, { text: map.get(key)?.text || w, count: (map.get(key)?.count || 0) + 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [seedWords, userWords]);

  const layout = useMemo(() => buildWordLayout(allWords, containerSize.width, containerSize.height), [allWords, containerSize]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const addWord = useCallback(() => {
    const word = input.trim();
    if (!word) return;
    setUserWords((prev) => {
      const next = [...prev, word];
      onProgress?.({ submitted: false, response: next });
      return next;
    });
    setInput('');
  }, [input]);

  const submit = () => {
    setSubmitted(true);
    onComplete?.({
      submitted: true,
      correct: true,
      score: 1,
      response: userWords,
      feedback: `${userWords.length} word${userWords.length !== 1 ? 's' : ''} added.`,
    });
  };

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-4 text-xl font-semibold text-zinc-950">
        <Md text={block.question || block.instruction || 'Word Cloud'} />
      </div>

      {/* Cloud display */}
      <div ref={containerRef} className="relative mb-5 min-h-[280px] w-full overflow-hidden border border-zinc-100 bg-zinc-50 sm:min-h-[360px]">
        {layout.map((word, i) => (
          <span
            key={`${word.text}-${i}`}
            className="absolute whitespace-nowrap font-bold transition-all duration-500"
            style={{
              left: `${word.x * 100}%`,
              top: `${word.y * 100}%`,
              transform: `translate(-50%, -50%) rotate(${word.rotation}deg)`,
              fontSize: `${word.fontSize}px`,
              color: word.color,
              opacity: 0.9,
            }}
          >
            {word.text}
          </span>
        ))}
        {allWords.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">Add words to build the cloud</div>
        )}
      </div>

      {/* Word input */}
      {!submitted && (
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addWord()}
            placeholder="Type a word…"
            className="min-w-0 flex-1 border border-zinc-200 px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900"
          />
          <button type="button" onClick={addWord} disabled={!input.trim()} className="border border-zinc-200 px-4 py-2 text-sm text-zinc-700 transition hover:border-zinc-900 disabled:opacity-30">Add</button>
          <button type="button" onClick={submit} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">Done</button>
        </div>
      )}

      {/* Summary */}
      {userWords.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {userWords.map((w, i) => (
            <span key={i} className="border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600">{w}</span>
          ))}
        </div>
      )}
    </div>
  );
}
