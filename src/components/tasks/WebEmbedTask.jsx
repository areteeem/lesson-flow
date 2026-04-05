import { useMemo, useState } from 'react';
import { Md } from '../FormattedText';
import { resolveMediaSource } from '../../utils/media';

const BLOCKED_PROTOCOLS = /^(javascript|data|vbscript|blob):/i;

function sanitizeEmbedUrl(raw) {
  if (!raw) return '';
  const url = String(raw).trim();
  if (BLOCKED_PROTOCOLS.test(url)) return '';
  if (!/^https?:\/\//i.test(url)) return '';
  return url;
}

function extractEmbedSrc(htmlCode) {
  if (!htmlCode) return '';
  const match = String(htmlCode).match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (!match) return '';
  return sanitizeEmbedUrl(match[1]);
}

export default function WebEmbedTask({ block, onComplete }) {
  const rawUrl = resolveMediaSource(block);
  const embedCode = block.embedCode || '';
  const safeUrl = useMemo(() => sanitizeEmbedUrl(rawUrl) || extractEmbedSrc(embedCode), [rawUrl, embedCode]);
  const height = Math.max(200, Math.min(900, Number(block.height) || 480));
  const allowFs = block.allowFullscreen !== false;
  const [loaded, setLoaded] = useState(false);
  const [response, setResponse] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const hasQuestion = Boolean(block.question || block.instruction);

  const submit = () => {
    setSubmitted(true);
    onComplete?.({
      submitted: true,
      correct: response.trim().length > 0,
      score: response.trim() ? 1 : 0,
      response,
      feedback: 'Response saved.',
    });
  };

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      {(block.question || block.instruction) && (
        <div className="mb-4 text-xl font-semibold text-zinc-950">
          <Md text={block.question || block.instruction || 'Embedded Content'} />
        </div>
      )}

      {safeUrl ? (
        <div className="relative mb-4 w-full overflow-hidden border border-zinc-200 bg-zinc-50">
          {!loaded && (
            <div className="flex items-center justify-center py-12 text-sm text-zinc-400 animate-pulse">Loading embed…</div>
          )}
          <iframe
            src={safeUrl}
            title={block.title || block.question || 'Embedded content'}
            className="w-full border-0"
            style={{ height: `${height}px`, display: loaded ? 'block' : 'none' }}
            onLoad={() => setLoaded(true)}
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen={allowFs}
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="mb-4 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No valid embed URL found. Add a URL in the Media field or paste an HTML embed code in the EmbedCode field.
          <div className="mt-2 text-xs text-amber-600">Supported: any HTTPS URL or an {'<iframe>'} HTML embed code.</div>
        </div>
      )}

      {block.text && (
        <div className="mb-4 text-sm leading-relaxed text-zinc-700">
          <Md text={block.text} />
        </div>
      )}

      {hasQuestion && !submitted && (
        <div className="space-y-3">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Type your response here…"
            rows={3}
            className="w-full border border-zinc-200 px-4 py-3 text-sm outline-none transition focus:border-zinc-900"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!response.trim()}
            className="border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Submit
          </button>
        </div>
      )}

      {submitted && (
        <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Response submitted.
        </div>
      )}
    </div>
  );
}
