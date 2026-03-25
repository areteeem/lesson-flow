import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

const TAGS = {
  subject: 'text-violet-700 font-semibold',
  verb: 'text-orange-600 font-semibold',
  object: 'text-sky-700 font-semibold',
  blue: 'text-blue-700',
  green: 'text-emerald-700',
  red: 'text-red-700',
  note: 'text-zinc-500 italic',
  highlight: 'rounded bg-yellow-100 px-1 text-zinc-900',
};

function preprocess(text) {
  let output = text || '';
  Object.entries(TAGS).forEach(([tag, className]) => {
    const regex = new RegExp(`\\[${tag}\\](.*?)\\[\\/${tag}\\]`, 'gis');
    output = output.replace(regex, `<span class="${className}">$1</span>`);
  });
  return output;
}

const COMPONENTS = {
  h1: ({ children }) => <h1 className="mb-4 text-3xl font-semibold text-zinc-950">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-3 text-2xl font-semibold text-zinc-950">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-2 text-xl font-semibold text-zinc-900">{children}</h3>,
  p: ({ children }) => <p className="mb-3 leading-7 text-zinc-700 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-zinc-700">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-zinc-700">{children}</ol>,
  blockquote: ({ children }) => <blockquote className="mb-3 border-l-4 border-zinc-300 pl-4 italic text-zinc-600">{children}</blockquote>,
  code: ({ children, className }) => className ? <code className={className}>{children}</code> : <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.95em] text-zinc-900">{children}</code>,
  pre: ({ children }) => <pre className="mb-3 overflow-auto border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800">{children}</pre>,
  table: ({ children }) => <div className="mb-3 overflow-auto"><table className="min-w-full border-collapse border border-zinc-200 text-sm">{children}</table></div>,
  th: ({ children }) => <th className="border border-zinc-200 bg-zinc-50 px-3 py-2 text-left font-semibold text-zinc-900">{children}</th>,
  td: ({ children }) => <td className="border border-zinc-200 px-3 py-2 text-zinc-700">{children}</td>,
  a: ({ children, href }) => <a href={href} className="text-zinc-900 underline underline-offset-2" target="_blank" rel="noreferrer">{children}</a>,
};

export function FormattedText({ text, className = '' }) {
  if (!text) return null;
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={COMPONENTS}>
        {preprocess(text)}
      </ReactMarkdown>
    </div>
  );
}

export function FormattedTextBlock({ text, compact = false, className = '' }) {
  if (!text) return null;
  return (
    <div className={[compact ? 'text-sm' : '', className].join(' ')}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={COMPONENTS}>
        {preprocess(text)}
      </ReactMarkdown>
    </div>
  );
}

const INLINE_COMPONENTS = {
  p: ({ children }) => <span>{children}</span>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em>{children}</em>,
  code: ({ children }) => <code className="rounded bg-zinc-100 px-1 py-0.5 text-[0.9em] text-zinc-900">{children}</code>,
  a: ({ children, href }) => <a href={href} className="underline underline-offset-2" target="_blank" rel="noreferrer">{children}</a>,
};

export function Md({ text, className = '' }) {
  if (!text) return null;
  return (
    <span className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={INLINE_COMPONENTS}>
        {preprocess(text)}
      </ReactMarkdown>
    </span>
  );
}
