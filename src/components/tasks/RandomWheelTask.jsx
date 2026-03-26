import { useCallback, useEffect, useRef, useState } from 'react';
import { Md } from '../FormattedText';

const COLORS = ['#18181b', '#2563eb', '#059669', '#d97706', '#7c3aed', '#e11d48', '#0891b2', '#ea580c', '#4f46e5', '#65a30d'];

export default function RandomWheelTask({ block, onComplete, existingResult }) {
  const items = block.items || [];
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [timer, setTimer] = useState(null);
  const [wheelSize, setWheelSize] = useState(320);

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
      context.beginPath();
      context.moveTo(center, center);
      context.arc(center, center, radius, startAngle, endAngle);
      context.closePath();
      context.fillStyle = COLORS[index % COLORS.length];
      context.fill();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 2;
      context.stroke();
      context.save();
      context.translate(center, center);
      context.rotate(startAngle + angleSize / 2);
      context.textAlign = 'right';
      context.fillStyle = '#ffffff';
      const maxLen = Math.max(8, Math.floor(radius / 10));
      const label = item.length > maxLen ? `${item.slice(0, maxLen - 1)}…` : item;
      context.font = `600 ${Math.max(11, Math.round(displaySize * 0.043))}px Arial`;
      context.fillText(label, radius - 16, 4);
      context.restore();
    });
  }, [items, wheelSize]);

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
    const winner = Math.floor(Math.random() * items.length);
    const fullTurns = 5 + Math.floor(Math.random() * 3);
    const segment = (Math.PI * 2) / items.length;
    const target = fullTurns * Math.PI * 2 + (Math.PI * 2 - winner * segment - segment / 2);
    const duration = 2400 + Math.random() * 1200;
    const start = performance.now();
    const initialRotation = rotation % (Math.PI * 2);

    const animate = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const next = initialRotation + target * eased;
      setRotation(next);
      if (progress < 1) {
        requestAnimationFrame(animate);
        return;
      }
      setSpinning(false);
      setSelectedIndex(winner);
      onComplete?.({ submitted: true, correct: true, score: 1, response: items[winner], feedback: 'Speaking prompt selected.' });
      if (block.timeLimit) {
        setTimer(block.timeLimit);
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

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-2 text-center text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction} /></div>
      <div className="mb-5 text-center text-sm text-zinc-500">Spin for a speaking prompt.</div>
      <div ref={containerRef} className="relative mx-auto mb-6 flex w-full max-w-[26rem] items-center justify-center">
        <div className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 -translate-y-1" style={{ borderLeft: '14px solid transparent', borderRight: '14px solid transparent', borderBottom: '22px solid #18181b', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }} />
        <canvas ref={canvasRef} width={wheelSize} height={wheelSize} style={{ width: wheelSize, height: wheelSize, borderRadius: '50%', border: '3px solid #18181b' }} />
        <button type="button" onClick={spin} disabled={spinning} className={`absolute min-h-20 min-w-20 rounded-full border-2 border-zinc-900 bg-white px-5 py-5 text-sm font-bold tracking-[0.2em] text-zinc-950 transition hover:scale-105 disabled:opacity-40 md:min-h-24 md:min-w-24 ${!spinning && selectedIndex === null ? 'animate-pulse' : ''}`}>SPIN</button>
      </div>
      {selectedIndex !== null && (
        <div className="border border-zinc-200 bg-zinc-50 px-4 py-4 text-center">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">Selected Topic</div>
          <div className="mt-2 text-2xl font-semibold text-zinc-950">{items[selectedIndex]}</div>
          {timer !== null && <div className="mt-3 text-sm text-zinc-500">Time left: <span className="font-semibold text-zinc-950">{timer}s</span></div>}
          {block.repeat && !spinning && <button type="button" onClick={spin} className="mt-4 border border-zinc-200 px-4 py-2 text-sm text-zinc-700 transition hover:bg-white">Spin again</button>}
        </div>
      )}
    </div>
  );
}
