import { useMemo, useState } from 'react';
import { FormattedTextBlock } from './FormattedText';
import { resolveMediaSource } from '../utils/media';

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

export default function EmbedSlide({ block }) {
  const rawUrl = resolveMediaSource(block);
  const embedCode = block.embedCode || '';
  const safeUrl = useMemo(() => sanitizeEmbedUrl(rawUrl) || extractEmbedSrc(embedCode), [rawUrl, embedCode]);
  const height = Math.max(200, Math.min(900, Number(block.height) || 480));
  const allowFs = block.allowFullscreen !== false;
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="border border-zinc-200 bg-white p-5 md:p-6 xl:p-8">
      {block.title && <h2 className="mb-3 text-2xl font-semibold text-zinc-950">{block.title}</h2>}
      {block.instruction && <div className="mb-4 text-sm text-zinc-500">{block.instruction}</div>}

      {safeUrl ? (
        <div className="relative w-full overflow-hidden border border-zinc-200 bg-zinc-50">
          {!loaded && (
            <div className="flex items-center justify-center py-12 text-sm text-zinc-400 animate-pulse">Loading embed…</div>
          )}
          <iframe
            src={safeUrl}
            title={block.title || 'Embedded content'}
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
        <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No valid embed URL found. Add a URL in the Media field or paste an HTML embed code in the EmbedCode field.
          <div className="mt-2 text-xs text-amber-600">Supported: any HTTPS URL or an {'<iframe>'} HTML embed code.</div>
        </div>
      )}

      {(block.content || block.text) && (
        <div className="mt-4">
          <FormattedTextBlock text={block.content || block.text} className="text-sm leading-7 text-zinc-700" compact />
        </div>
      )}
    </div>
  );
}
