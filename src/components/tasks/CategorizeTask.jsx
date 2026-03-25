import { useMemo, useState, useEffect } from 'react';
import { stableShuffle } from '../../utils/shuffle';
import { Md } from '../FormattedText';

export default function CategorizeTask({ block, onComplete, existingResult }) {
  const [shuffleSeed] = useState(() => crypto.randomUUID());
  const categories = useMemo(() => block.shuffle === false ? (block.categories || []) : stableShuffle(block.categories || [], `${block.id || block.question}-${shuffleSeed}-categories`), [block.categories, block.id, block.question, block.shuffle, shuffleSeed]);

  const items = useMemo(() => {
    const raw = block.items || [];
    const cleaned = raw.map((item) => item.includes('=>') ? item.split('=>')[0].trim() : item);
    return block.shuffle === false ? cleaned : stableShuffle(cleaned, `${block.id || block.question}-${shuffleSeed}-items`);
  }, [block.items, block.id, block.question, block.shuffle, shuffleSeed]);

  // Item bank: items not yet placed in any category
  const [bank, setBank] = useState(() => items.map((item, i) => ({ id: i, text: item })));
  // Category buckets: { categoryName: [{ id, text }] }
  const [buckets, setBuckets] = useState(() => Object.fromEntries(categories.map((c) => [c, []])));
  const [draggedItem, setDraggedItem] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [preferTap, setPreferTap] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setPreferTap(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  const answerMap = useMemo(() => {
    const fromPairs = Object.fromEntries((block.pairs || []).map((pair) => [pair.left, pair.right]));
    if (Object.keys(fromPairs).length > 0) return fromPairs;
    const fromItems = {};
    (block.items || []).forEach((item) => {
      if (item.includes('=>')) {
        const [left, right] = item.split('=>').map((s) => s.trim());
        if (left && right) fromItems[left] = right;
      }
    });
    return fromItems;
  }, [block.pairs, block.items]);

  const placeItem = (item, category) => {
    if (submitted) return;
    // Remove from bank
    setBank((prev) => prev.filter((b) => b.id !== item.id));
    // Remove from any other bucket
    setBuckets((prev) => {
      const next = {};
      for (const [cat, items] of Object.entries(prev)) {
        next[cat] = items.filter((i) => i.id !== item.id);
      }
      next[category] = [...(next[category] || []), item];
      return next;
    });
    setDraggedItem(null);
    setSelectedItem(null);
  };

  const returnToBank = (item, category) => {
    if (submitted) return;
    setBuckets((prev) => ({
      ...prev,
      [category]: (prev[category] || []).filter((i) => i.id !== item.id),
    }));
    setBank((prev) => [...prev, item]);
  };

  const handleBankPress = (item) => {
    if (submitted) return;
    if (preferTap) {
      setSelectedItem((prev) => (prev?.id === item.id ? null : item));
    } else {
      setSelectedItem((prev) => (prev?.id === item.id ? null : item));
    }
  };

  const handleCategoryClick = (category) => {
    if (submitted || !selectedItem) return;
    placeItem(selectedItem, category);
  };

  const submit = () => {
    const allPlaced = Object.values(buckets).flat();
    const correctCount = allPlaced.filter((item) => {
      const expectedCategory = answerMap[item.text]?.trim().toLowerCase();
      const placedCategory = Object.entries(buckets).find(([, items]) =>
        items.some((i) => i.id === item.id)
      )?.[0]?.trim().toLowerCase();
      return expectedCategory && placedCategory && expectedCategory === placedCategory;
    }).length;
    const score = correctCount / Math.max(items.length, 1);
    setSubmitted(true);
    onComplete?.({ submitted: true, correct: score === 1, score, response: buckets, correctAnswer: answerMap });
  };

  if (items.length === 0) {
    return (
      <div className="border border-zinc-200 bg-white p-8">
        <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">This categorize task has no items to sort.</div>
      </div>
    );
  }

  const CATEGORY_COLORS = ['bg-blue-50 border-blue-200', 'bg-emerald-50 border-emerald-200', 'bg-amber-50 border-amber-200', 'bg-violet-50 border-violet-200', 'bg-rose-50 border-rose-200', 'bg-cyan-50 border-cyan-200', 'bg-orange-50 border-orange-200', 'bg-zinc-100 border-zinc-300'];
  const HEADER_COLORS = ['text-blue-800', 'text-emerald-800', 'text-amber-800', 'text-violet-800', 'text-rose-800', 'text-cyan-800', 'text-orange-800', 'text-zinc-700'];

  return (
    <div className="border border-zinc-200 bg-white p-8">
      <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      {block.hint && !submitted && <div className="mb-3 text-xs text-zinc-500">{block.hint}</div>}
      {!submitted && (
        <div className="mb-4 text-xs text-zinc-500">
          {preferTap ? 'Tap an item, then tap a category to place it.' : 'Drag items from the bank into categories, or tap to select and place.'}
        </div>
      )}

      {/* Item bank */}
      {bank.length > 0 && !submitted && (
        <div className="mb-5">
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Word bank</div>
          <div className="flex flex-wrap gap-2 border border-zinc-200 bg-zinc-50 p-3">
            {bank.map((item) => (
              <button
                key={item.id}
                type="button"
                draggable
                onDragStart={(e) => {
                  setDraggedItem(item);
                  e.dataTransfer.setData('application/json', JSON.stringify(item));
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => setDraggedItem(null)}
                onClick={() => handleBankPress(item)}
                className={[
                  'min-h-10 border px-3 py-2 text-sm font-medium transition',
                  selectedItem?.id === item.id || draggedItem?.id === item.id
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:-translate-y-0.5 hover:border-zinc-900 cursor-grab active:cursor-grabbing',
                ].join(' ')}
              >
                {item.text}
              </button>
            ))}
          </div>
        </div>
      )}
      {selectedItem && !submitted && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-zinc-900 bg-zinc-900 px-4 py-3 text-sm text-white">
          <span>Selected: <strong>{selectedItem.text}</strong> — tap a category below</span>
          <button type="button" onClick={() => setSelectedItem(null)} className="rounded-xl border border-white/30 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.12em] text-white hover:bg-white/10">Clear</button>
        </div>
      )}

      {/* Category columns */}
      <div className={`grid gap-3 ${categories.length <= 2 ? 'grid-cols-2' : categories.length <= 3 ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-4'}`}>
        {categories.map((category, catIdx) => {
          const bucket = buckets[category] || [];
          const colorClass = CATEGORY_COLORS[catIdx % CATEGORY_COLORS.length];
          const headerColor = HEADER_COLORS[catIdx % HEADER_COLORS.length];
          return (
            <div
              key={category}
              onDrop={(e) => {
                e.preventDefault();
                const data = e.dataTransfer.getData('application/json');
                if (data) {
                  try {
                    placeItem(JSON.parse(data), category);
                  } catch { /* ignore */ }
                }
              }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onClick={() => handleCategoryClick(category)}
              className={[
                'min-h-28 border p-3 transition',
                !submitted && selectedItem ? `${colorClass} cursor-pointer border-dashed` : colorClass,
                !submitted && draggedItem ? 'border-dashed' : '',
              ].join(' ')}
            >
              <div className={`mb-2 text-xs font-bold uppercase tracking-[0.18em] ${headerColor}`}>{category}</div>
              <div className="flex flex-wrap gap-1.5">
                {bucket.map((item) => {
                  const expectedCategory = answerMap[item.text]?.trim().toLowerCase();
                  const isCorrect = submitted && expectedCategory === category.trim().toLowerCase();
                  const isWrong = submitted && expectedCategory && expectedCategory !== category.trim().toLowerCase();
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); returnToBank(item, category); }}
                      disabled={submitted}
                      className={[
                        'rounded-xl border px-2.5 py-1.5 text-xs font-medium transition',
                        isCorrect ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : '',
                        isWrong ? 'border-red-300 bg-red-50 text-red-800' : '',
                        !submitted ? 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-red-300 hover:bg-red-50' : '',
                      ].join(' ')}
                    >
                      {item.text}
                      {isWrong && <span className="ml-1 text-[10px] text-red-500">→ {answerMap[item.text]}</span>}
                    </button>
                  );
                })}
                {bucket.length === 0 && !submitted && (
                  <span className="text-xs text-zinc-400 py-1">Drop items here</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {submitted && block.explanation && <div className="mt-4 text-sm text-zinc-600"><Md text={block.explanation} /></div>}
      {!submitted && <button type="button" onClick={submit} disabled={bank.length > 0} className="mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40">Check</button>}
    </div>
  );
}
