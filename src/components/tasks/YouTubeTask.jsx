import { useMemo, useRef, useState, useCallback } from 'react';
import { Md } from '../FormattedText';
import { resolveMediaSource } from '../../utils/media';

function extractVideoId(url) {
  if (!url) return null;
  const str = String(url).trim();
  // Bare 11-char ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  // youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/shorts/ID
  const match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|.*[&?]v=))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function parseTimestamp(ts) {
  if (typeof ts === 'number') return ts;
  const str = String(ts).trim();
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(str) || 0;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function YouTubeTask({ block, onComplete }) {
  const url = resolveMediaSource(block);
  const videoId = useMemo(() => extractVideoId(url), [url]);
  const iframeRef = useRef(null);
  const [loaded, setLoaded] = useState(false);

  const questions = useMemo(() => {
    if (block.items?.length) {
      return block.items.map((item, i) => {
        const text = typeof item === 'string' ? item : String(item || '');
        if (text.includes('=>')) {
          const [ts, q] = text.split('=>').map((s) => s.trim());
          return { id: i, timestamp: parseTimestamp(ts), question: q };
        }
        return { id: i, timestamp: 0, question: text };
      }).sort((a, b) => a.timestamp - b.timestamp);
    }
    return [];
  }, [block.items]);

  const [answers, setAnswers] = useState(() => questions.map(() => ''));
  const [submitted, setSubmitted] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState(null);

  const seekTo = useCallback((seconds) => {
    if (!iframeRef.current) return;
    iframeRef.current.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: 'seekTo', args: [seconds, true] }),
      '*'
    );
  }, []);

  const activate = useCallback(() => {
    if (!loaded) setLoaded(true);
  }, [loaded]);

  const submit = () => {
    setSubmitted(true);
    const hasAnswers = answers.some((a) => a.trim());
    onComplete?.({
      submitted: true,
      correct: hasAnswers,
      score: hasAnswers ? 1 : 0,
      response: answers,
      feedback: 'Video response saved.',
    });
  };

  if (!videoId) {
    return (
      <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
        <div className="mb-2 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction || 'YouTube Video'} /></div>
        <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No valid YouTube URL found. Add a YouTube link in the Media or Video field.
          <div className="mt-2 text-xs text-amber-600">Supported formats: youtube.com/watch?v=..., youtu.be/..., youtube.com/embed/..., youtube.com/shorts/...</div>
        </div>
      </div>
    );
  }

  const encodedId = encodeURIComponent(videoId);
  const embedUrl = `https://www.youtube-nocookie.com/embed/${encodedId}?enablejsapi=1&rel=0&modestbranding=1&autoplay=1`;
  const thumbUrl = `https://img.youtube.com/vi/${encodedId}/hqdefault.jpg`;

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      <div className="mb-4 text-xl font-semibold text-zinc-950"><Md text={block.question || block.instruction || 'Watch the video'} /></div>

      {/* Thumbnail-first lazy loading */}
      <div className="relative mb-5 w-full overflow-hidden bg-zinc-950" style={{ paddingBottom: '56.25%' }}>
        {loaded ? (
          <iframe
            ref={iframeRef}
            src={embedUrl}
            title="YouTube video"
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            onClick={activate}
            className="group absolute inset-0 flex cursor-pointer items-center justify-center"
            aria-label="Play video"
          >
            <img
              src={thumbUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition group-hover:brightness-75"
              loading="lazy"
            />
            <span className="relative z-10 flex h-16 w-16 items-center justify-center bg-red-600 text-white shadow-lg transition group-hover:scale-110 sm:h-20 sm:w-20">
              <svg viewBox="0 0 24 24" fill="currentColor" className="ml-1 h-8 w-8 sm:h-10 sm:w-10"><path d="M8 5v14l11-7z" /></svg>
            </span>
          </button>
        )}
      </div>

      {/* Timestamp questions */}
      {questions.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">{questions.length} question{questions.length !== 1 ? 's' : ''}</div>
          {questions.map((q, i) => (
            <div key={q.id} className={`border p-4 transition ${activeQuestion === i ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200'}`}>
              <div className="mb-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { activate(); seekTo(q.timestamp); setActiveQuestion(i); }}
                  className="border border-zinc-200 bg-white px-2 py-1 text-[11px] font-mono font-medium text-zinc-600 transition hover:border-zinc-900"
                >
                  ▶ {formatTime(q.timestamp)}
                </button>
                <div className="text-sm font-medium text-zinc-800"><Md text={q.question} /></div>
              </div>
              <textarea
                rows={2}
                value={answers[i]}
                onChange={(e) => setAnswers((prev) => prev.map((a, j) => j === i ? e.target.value : a))}
                disabled={submitted}
                placeholder="Type your answer…"
                className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-900 disabled:bg-zinc-50"
              />
            </div>
          ))}
        </div>
      )}

      {/* Notes area (when no structured questions) */}
      {questions.length === 0 && (
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Notes</div>
          <textarea
            rows={4}
            value={answers[0] || ''}
            onChange={(e) => setAnswers([e.target.value])}
            disabled={submitted}
            placeholder="Write your observations or notes about the video…"
            className="w-full border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900 disabled:bg-zinc-50"
          />
        </div>
      )}

      {!submitted && (
        <button type="button" onClick={submit} className="mt-4 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800">
          Save Response
        </button>
      )}
    </div>
  );
}


