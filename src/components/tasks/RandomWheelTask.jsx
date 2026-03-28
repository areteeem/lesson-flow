import { useCallback, useEffect, useRef, useState } from 'react';
import { Md } from '../FormattedText';

const COLORS = ['#18181b', '#2563eb', '#059669', '#d97706', '#7c3aed', '#e11d48', '#0891b2', '#ea580c', '#4f46e5', '#65a30d'];

export default function RandomWheelTask({ block, onComplete }) {
  const items = block.items || [];
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [timer, setTimer] = useState(null);
  const [wheelSize, setWheelSize] = useState(320);
  const [history, setHistory] = useState([]);

  const draw = useCallback((rotationValue) => {
    const canvas = canvasRef.current;
    if (!canvas || items.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const displaySize = wheelSize;
    canvas.width = displaySize * dpr;
    canvas.height = displaySize * dpr;
    canvas.style.width = `${displaySize}px`;
    canvas.style.height = `${displaySize}px`;
    const context = canvas.getContext('2d');
    context.scale(dpr, dpr);
    const center = displaySize / 2;
    const radius = center - 10;
    const angleSize = (Math.PI * 2) / items.length;
    context.clearRect(0, 0, displaySize, displaySize);
    items.forEach((item, index) => {
      const startAngle = -Math.PI / 2 + index * angleSize + rotationValue;
      const endAngle = startAngle + angleSize;
      const isUsed = history.includes(item);
      context.beginPath();
      context.moveTo(center, center);
      context.arc(center, center, radius, startAngle, endAngle);
      context.closePath();
      context.fillStyle = COLORS[index % COLORS.length];
      context.globalAlpha = isUsed ? 0.35 : 1;
      context.fill();
      context.globalAlpha = 1;
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.stroke();
      context.save();
      context.translate(center, center);
      context.rotate(startAngle + angleSize / 2);
      context.textAlign = 'right';
      context.fillStyle = '#ffffff';
      context.globalAlpha = isUsed ? 0.4 : 1;
      const maxLen = Math.max(8, Math.floor(radius / 10));
      const label = item.length > maxLen ? `${item.slice(0, maxLen - 1)}…` : item;
      context.font = `600 ${Math.max(11, Math.round(displaySize * 0.043))}px Arial`;
      context.fillText(label, radius - 16, 4);
      context.globalAlpha = 1;
      context.restore();
    });
  }, [items, wheelSize, history]);

  useEffect(() => {
    draw(rotation);
  }, [draw, rotation]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const resize = () => {
      const nextSize = Math.max(240, Math.min(container.clientWidth, 420));
      setWheelSize(nextSize);
    };
    resize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', resize);
      return () => window.removeEventListener('resize', resize);
    }
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const spin = () => {
    if (spinning || items.length === 0) return;
    setSpinning(true);
    setSelectedIndex(null);
    if (timerRef.current) clearInterval(timerRef.current);
    setTimer(null);

    // Pick from unused items first, fall back to all
    const unused = items.map((item, i) => ({ item, i })).filter(({ item }) => !history.includes(item));
    const pool = unused.length > 0 ? unused : items.map((item, i) => ({ item, i }));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const winner = pick.i;

    const fullTurns = 5 + Math.floor(Math.random() * 3);
    const segment = (Math.PI * 2) / items.length;
    const target = fullTurns * Math.PI * 2 + (Math.PI * 2 - winner * segment - segment / 2);
    const duration = 3000 + Math.random() * 1000;
    const start = performance.now();
    const initialRotation = rotation % (Math.PI * 2);

    const animate = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      // Quintic ease-out for smoother deceleration
      const eased = 1 - Math.pow(1 - progress, 5);
      const next = initialRotation + target * eased;
      setRotation(next);
      if (progress < 1) {
        requestAnimationFrame(animate);
        return;
      }
      setSpinning(false);
      setSelectedIndex(winner);
      setHistory((prev) => [...prev, items[winner]]);
      onComplete?.({ submitted: true, correct: true, score: 1, response: items[winner], feedback: 'Speaking prompt selected.' });
      if (block.timeLimit) {
        const limit = Number(block.timeLimit) || 60;
        setTimer(limit);
        timerRef.current = setInterval(() => {
          setTimer((current) => {
            if (current <= 1) {
              clearInterval(timerRef.current);
              return 0;
            }
            return current - 1;
          });
        }, 1000);
      }
    };

    requestAnimationFrame(animate);
  };

  const allUsed = history.length >= items.length;

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-center text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      <div className="mb-5 text-center text-sm text-zinc-500">Spin for a speaking prompt.</div>
      <div ref={containerRef} className="relative mx-auto mb-6 flex w-full max-w-[26rem] items-center justify-center">
        {/* Arrow pointer — triangle pointing down from top */}
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2" style={{ width: 0, height: 0, borderLeft: '12px solid transparent', borderRight: '12px solid transparent', borderTop: '20px solid #18181b', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }} />
        <canvas ref={canvasRef} width={wheelSize} height={wheelSize} style={{ width: wheelSize, height: wheelSize, borderRadius: '50%', border: '3px solid #18181b' }} />
        <button type="button" onClick={spin} disabled={spinning} className={`absolute min-h-20 min-w-20 rounded-full border-2 border-zinc-900 bg-white px-5 py-5 text-sm font-bold tracking-[0.2em] text-zinc-950 transition hover:scale-105 disabled:opacity-40 md:min-h-24 md:min-w-24 ${!spinning && selectedIndex === null ? 'animate-pulse' : ''}`}>SPIN</button>
      </div>
      {selectedIndex !== null && (
        <div className="border border-zinc-200 bg-zinc-50 px-4 py-4 text-center">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Selected Topic</div>
          <div className="mt-2 text-2xl font-semibold text-zinc-950">{items[selectedIndex]}</div>
          {timer !== null && (
            <div className="mt-3 text-sm text-zinc-500">
              Time left: <span className={`font-semibold ${timer <= 5 ? 'text-red-600' : 'text-zinc-950'}`}>{timer}s</span>
            </div>
          )}
          {block.repeat && !spinning && (
            <button type="button" onClick={spin} className="mt-4 border border-zinc-200 px-4 py-2 text-sm text-zinc-700 transition hover:bg-white">
              {allUsed ? 'Spin again (all used)' : 'Spin again'}
            </button>
          )}
        </div>
      )}
      {/* Spin history */}
      {history.length > 1 && (
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">History ({history.length}/{items.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {history.map((item, i) => (
              <span key={i} className="border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600">{item}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


