import { useEffect, useRef, useState } from 'react';
import { serializeBlockField, updateBlockField } from '../utils/builder';
import { CATEGORY_COLORS, DIALOGUE_COLORS } from '../config/constants';
import MarkdownComposer from './MarkdownComposer';

function Field({ label, help, children }) {
  return (
    <label className="block space-y-1.5">
      <div>
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">{label}</span>
        {help && <span className="ml-2 text-[10px] normal-case tracking-normal text-zinc-400">{help}</span>}
      </div>
      {children}
    </label>
  );
}

function AutoGrowTextarea({ value, onChange, rows = 1, className = '', mono = false }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = '0px';
    ref.current.style.height = `${Math.max(ref.current.scrollHeight, rows * 28)}px`;
  }, [rows, value]);

  return (
    <textarea
      ref={ref}
      rows={rows}
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      className={[
        'w-full resize-none overflow-hidden border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-900',
        mono ? 'font-mono' : '',
        className,
      ].join(' ')}
    />
  );
}

function TextInput({ value, onChange }) {
  return <AutoGrowTextarea value={value} onChange={onChange} rows={1} className="min-h-[42px]" />;
}

function TextArea({ value, onChange, rows = 4 }) {
  return <AutoGrowTextarea value={value} onChange={onChange} rows={rows} />;
}

const MEDIA_LIBRARY_KEY = 'lf_media_library';

function detectMediaType(value = '') {
  if (!value) return 'none';
  if (/\.(gif)(\?|$)/i.test(value) || value.startsWith('data:image/gif')) return 'gif';
  if (/\.(png|jpe?g|webp|svg|bmp|avif)(\?|$)/i.test(value) || value.startsWith('data:image/')) return 'image';
  if (/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(value) || value.startsWith('data:audio/')) return 'audio';
  if (/\.(mp4|webm|mov)(\?|$)/i.test(value) || value.startsWith('data:video/')) return 'video';
  return 'unknown';
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
}

function estimateDataUrlBytes(value = '') {
  const match = String(value || '').match(/^data:([^;,]+)?(;base64)?,(.*)$/i);
  if (!match) return null;
  const isBase64 = Boolean(match[2]);
  const body = match[3] || '';
  if (!body) return 0;
  if (isBase64) {
    const padding = (body.match(/=+$/) || [''])[0].length;
    return Math.max(0, Math.floor((body.length * 3) / 4) - padding);
  }
  try {
    return decodeURIComponent(body).length;
  } catch {
    return body.length;
  }
}

function extractMediaMetadata(value = '') {
  const source = String(value || '').trim();
  if (!source) return null;

  if (source.startsWith('data:')) {
    const mimeMatch = source.match(/^data:([^;,]+)?/i);
    const mimeType = mimeMatch?.[1] || 'application/octet-stream';
    const estimatedBytes = estimateDataUrlBytes(source);
    return {
      sourceType: 'inline',
      mimeType,
      host: 'embedded',
      extension: mimeType.split('/')[1] || 'inline',
      bytes: estimatedBytes,
      sizeLabel: estimatedBytes === null ? '' : formatBytes(estimatedBytes),
    };
  }

  try {
    const parsed = new URL(source);
    const pathname = parsed.pathname || '';
    const fileName = pathname.split('/').filter(Boolean).at(-1) || '';
    const extension = fileName.includes('.') ? fileName.split('.').at(-1).toLowerCase() : '';
    return {
      sourceType: 'url',
      mimeType: '',
      host: parsed.host || '',
      extension,
      bytes: null,
      sizeLabel: '',
    };
  } catch {
    return {
      sourceType: 'text',
      mimeType: '',
      host: '',
      extension: '',
      bytes: null,
      sizeLabel: '',
    };
  }
}

function parseDelimitedRows(raw = '') {
  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];

    if (char === '"') {
      if (inQuotes && raw[index + 1] === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === ',' || char === ';' || char === '\t')) {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && raw[index + 1] === '\n') index += 1;
      currentRow.push(currentCell.trim());
      currentCell = '';
      if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell.trim());
  if (currentRow.some((cell) => cell.length > 0)) rows.push(currentRow);
  return rows;
}

function parseBulkValues(raw = '') {
  return parseDelimitedRows(raw)
    .flatMap((row) => row)
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
}

function parseBulkPairs(raw = '') {
  const rows = parseDelimitedRows(raw);
  const pairs = [];

  rows.forEach((row) => {
    if (row.length >= 2) {
      pairs.push({ left: String(row[0] || '').trim(), right: String(row[1] || '').trim() });
      return;
    }

    const value = String(row[0] || '').trim();
    if (!value) return;
    const split = value.includes('=>')
      ? value.split(/\s*=>\s*/)
      : value.split(/\s*\|\s*/);
    if (split.length >= 2) {
      pairs.push({ left: String(split[0] || '').trim(), right: String(split[1] || '').trim() });
    }
  });

  return pairs.filter((pair) => pair.left || pair.right);
}

function loadMediaLibrary() {
  try {
    const raw = localStorage.getItem(MEDIA_LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMediaLibrary(items) {
  try {
    localStorage.setItem(MEDIA_LIBRARY_KEY, JSON.stringify(items.slice(0, 50)));
  } catch {
    // Ignore storage failures.
  }
}

function resizeImageToDataUrl(file, maxWidth = 1280) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const ratio = Math.min(1, maxWidth / (image.width || maxWidth));
        const width = Math.max(1, Math.round(image.width * ratio));
        const height = Math.max(1, Math.round(image.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas is not available.'));
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      image.onerror = () => reject(new Error('Could not load image.'));
      image.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

function MediaPickerModal({ open, onClose, onSelect, currentValue = '' }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [urlValue, setUrlValue] = useState(currentValue || '');
  const [resizeWidth, setResizeWidth] = useState(1280);
  const [library, setLibrary] = useState(() => loadMediaLibrary());

  useEffect(() => {
    if (open) {
      setUrlValue(currentValue || '');
      setError('');
      setLibrary(loadMediaLibrary());
    }
  }, [open, currentValue]);

  async function handleFile(file) {
    if (!file) return;
    setError('');

    const isGif = file.type === 'image/gif';
    const maxSize = isGif ? 10 * 1024 * 1024 : 7 * 1024 * 1024;
    if (file.size > maxSize) {
      setError(isGif ? 'GIF is too large. Keep GIF uploads under 10MB.' : 'File is too large. Keep uploads under 7MB.');
      return;
    }

    if (file.type.startsWith('image/') && !isGif) {
      try {
        const dataUrl = await resizeImageToDataUrl(file, resizeWidth);
        addToLibrary(dataUrl);
        onSelect(dataUrl);
        onClose();
      } catch {
        setError('Could not process this image. Try another file.');
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      addToLibrary(result);
      onSelect(result);
      onClose();
    };
    reader.onerror = () => setError('Could not read this file.');
    reader.readAsDataURL(file);
  }

  useEffect(() => {
    if (!open) return undefined;
    const onPaste = async (event) => {
      const files = Array.from(event.clipboardData?.files || []);
      if (files.length > 0) {
        event.preventDefault();
        await handleFile(files[0]);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, resizeWidth]);

  if (!open) return null;

  const addToLibrary = (url) => {
    const item = {
      id: crypto.randomUUID(),
      url,
      type: detectMediaType(url),
      createdAt: Date.now(),
    };
    const next = [item, ...library.filter((entry) => entry.url !== url)];
    setLibrary(next);
    saveMediaLibrary(next);
  };

  const onDrop = async (event) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) await handleFile(file);
  };

  const submitUrl = () => {
    const clean = urlValue.trim();
    if (!clean) {
      setError('Paste a media URL first.');
      return;
    }
    addToLibrary(clean);
    onSelect(clean);
    onClose();
  };

  const urlMeta = extractMediaMetadata(urlValue);

  const openSearch = (provider) => {
    const q = encodeURIComponent((searchQuery || urlValue || '').trim() || 'education gif');
    const map = {
      google: `https://www.google.com/search?tbm=isch&q=${q}`,
      bing: `https://www.bing.com/images/search?q=${q}`,
      giphy: `https://giphy.com/search/${encodeURIComponent((searchQuery || 'education').trim())}`,
    };
    window.open(map[provider], '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-4xl border border-zinc-200 bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Media Picker</div>
            <div className="text-[11px] text-zinc-500">Drop, upload, paste (Ctrl+V), or search images/GIFs.</div>
          </div>
          <button type="button" onClick={onClose} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600">Close</button>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-2">
          <div className="space-y-3">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex min-h-[160px] items-center justify-center border-2 border-dashed p-4 text-center ${dragging ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-300'}`}
            >
              <div>
                <div className="text-xs font-medium text-zinc-700">Drag and drop media here</div>
                <div className="mt-1 text-[11px] text-zinc-500">or click Upload, or paste from clipboard</div>
                <button type="button" onClick={() => fileRef.current?.click()} className="mt-3 border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs text-white">Upload</button>
                <input ref={fileRef} type="file" accept="image/*,audio/*,video/*" className="hidden" onChange={async (e) => { await handleFile(e.target.files?.[0]); e.target.value = ''; }} />
              </div>
            </div>

            <div className="border border-zinc-200 p-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Image Resize</div>
              <div className="mt-2 flex items-center gap-3">
                <input type="range" min="480" max="1920" step="80" value={resizeWidth} onChange={(e) => setResizeWidth(Number(e.target.value))} className="w-full" />
                <span className="w-16 text-right text-xs text-zinc-600">{resizeWidth}px</span>
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">Applied to uploaded and pasted non-GIF images for faster loading.</div>
            </div>

            <div className="border border-zinc-200 p-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Paste Media Link</div>
              <div className="mt-2 flex gap-2">
                <input value={urlValue} onChange={(e) => setUrlValue(e.target.value)} placeholder="https://..." className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900" />
                <button type="button" onClick={submitUrl} className="border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs text-white">Use</button>
              </div>
              {urlValue.trim() && urlMeta && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-zinc-500 sm:grid-cols-4">
                  <div className="border border-zinc-200 bg-zinc-50 px-2 py-1">Type: {detectMediaType(urlValue)}</div>
                  <div className="border border-zinc-200 bg-zinc-50 px-2 py-1">Host: {urlMeta.host || 'unknown'}</div>
                  <div className="border border-zinc-200 bg-zinc-50 px-2 py-1">Format: {urlMeta.extension || urlMeta.mimeType || 'unknown'}</div>
                  <div className="border border-zinc-200 bg-zinc-50 px-2 py-1">Size: {urlMeta.sizeLabel || 'n/a'}</div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="border border-zinc-200 p-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Search Web</div>
              <div className="mt-2 flex gap-2">
                <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search images or GIFs" className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900" />
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => openSearch('google')} className="border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-700">Google Images</button>
                <button type="button" onClick={() => openSearch('bing')} className="border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-700">Bing Images</button>
                <button type="button" onClick={() => openSearch('giphy')} className="border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-700">GIPHY</button>
              </div>
              <div className="mt-1 text-[11px] text-zinc-500">Search opens in a new tab. Paste the selected media link here.</div>
            </div>

            <div className="border border-zinc-200 p-3">
              <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Reusable Media Library</div>
              <div className="grid max-h-56 grid-cols-2 gap-2 overflow-auto">
                {library.map((entry) => {
                  const entryType = detectMediaType(entry.url);
                  const entryMeta = extractMediaMetadata(entry.url);
                  return (
                    <button key={entry.id} type="button" onClick={() => { onSelect(entry.url); onClose(); }} className="border border-zinc-200 p-1 text-left hover:border-zinc-900">
                      {entryType === 'image' || entryType === 'gif'
                        ? <img src={entry.url} alt="" loading="lazy" decoding="async" className="h-20 w-full object-cover" />
                        : <div className="flex h-20 items-center justify-center bg-zinc-50 text-[10px] uppercase text-zinc-500">{entryType}</div>}
                      <div className="mt-1 truncate text-[10px] text-zinc-500">{new Date(entry.createdAt).toLocaleDateString()}</div>
                      <div className="mt-1 flex flex-wrap gap-1 text-[9px] uppercase tracking-[0.08em] text-zinc-400">
                        <span>{entryMeta?.extension || entryMeta?.mimeType || 'media'}</span>
                        {entryMeta?.sizeLabel && <span>· {entryMeta.sizeLabel}</span>}
                        {entryMeta?.host && entryMeta.host !== 'embedded' && <span>· {entryMeta.host}</span>}
                      </div>
                    </button>
                  );
                })}
                {library.length === 0 && <div className="col-span-2 border border-dashed border-zinc-200 px-3 py-5 text-center text-[11px] text-zinc-500">No saved assets yet.</div>}
              </div>
            </div>
          </div>
        </div>

        {error && <div className="border-t border-zinc-200 px-4 py-2 text-xs text-red-600">{error}</div>}
      </div>
    </div>
  );
}

function MediaInput({ value, onChange }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const mediaType = detectMediaType(value || '');
  const mediaMeta = extractMediaMetadata(value || '');

  return (
    <div className="space-y-3">
      <div className="border border-zinc-200 bg-zinc-50 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Media</div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPickerOpen(true)} className="border border-zinc-900 bg-zinc-900 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white">{value ? 'Replace' : 'Add media'}</button>
            {value && <button type="button" onClick={() => onChange('')} className="border border-zinc-200 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-600">Delete</button>}
          </div>
        </div>

        {!value && <div className="border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-500">No media selected. Click Add media to upload, drop, paste, or search.</div>}
        {mediaType === 'image' && <img src={value} alt="" loading="lazy" decoding="async" className="max-h-56 w-full object-contain" />}
        {mediaType === 'gif' && <img src={value} alt="" loading="lazy" decoding="async" className="max-h-56 w-full object-contain" />}
        {mediaType === 'audio' && <audio src={value} controls className="w-full" />}
        {mediaType === 'video' && <video src={value} controls autoPlay loop muted className="max-h-56 w-full" />}
        {mediaType === 'unknown' && value && (
          <div className="border border-zinc-200 px-3 py-4 text-center text-xs text-zinc-500">Preview unavailable. You can still use this link.</div>
        )}
        {value && mediaMeta && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-zinc-500 sm:grid-cols-4">
            <div className="border border-zinc-200 bg-white px-2 py-1">Type: {mediaType}</div>
            <div className="border border-zinc-200 bg-white px-2 py-1">Host: {mediaMeta.host || 'unknown'}</div>
            <div className="border border-zinc-200 bg-white px-2 py-1">Format: {mediaMeta.extension || mediaMeta.mimeType || 'unknown'}</div>
            <div className="border border-zinc-200 bg-white px-2 py-1">Size: {mediaMeta.sizeLabel || 'n/a'}</div>
          </div>
        )}
      </div>
      <MediaPickerModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={onChange} currentValue={value || ''} />
    </div>
  );
}

function Toggle({ checked, onChange, label = 'Enabled' }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-2.5 px-1 py-1 text-xs"
    >
      <span className={[
        'toggle-track relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200',
        checked ? 'bg-zinc-900' : 'bg-zinc-200 group-hover:bg-zinc-300',
      ].join(' ')}>
        <span className={[
          'toggle-knob inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]',
        ].join(' ')} />
      </span>
      <span className={checked ? 'font-medium text-zinc-800' : 'text-zinc-500'}>{label}</span>
    </button>
  );
}

function apply(onChange, block, field, value) {
  onChange(updateBlockField(block, field, value));
}

function OptionListEditor({ block, onChange, multiple = false, allowCorrect = true }) {
  const [bulkInput, setBulkInput] = useState('');
  const [bulkError, setBulkError] = useState('');
  const options = (block.options || []).map((option) => String(option));
  const safeOptions = options.length > 0 ? options : [''];
  const currentAnswers = (block.answer || '').split('|').map((a) => a.trim()).filter(Boolean);
  const isSelected = (option) => currentAnswers.includes(option);

  const updateOptions = (next) => {
    const normalized = next.map((entry) => entry.trimEnd());
    onChange({
      ...block,
      options: normalized,
      answer: currentAnswers.filter((answer) => normalized.includes(answer)).join(' | '),
    });
  };

  const updateOption = (index, value) => {
    const next = [...safeOptions];
    next[index] = value;
    updateOptions(next);
  };

  const addOption = () => updateOptions([...safeOptions, '']);

  const importBulkOptions = () => {
    const parsed = parseBulkValues(bulkInput);
    if (parsed.length === 0) {
      setBulkError('No valid options found. Use one option per row or CSV cells.');
      return;
    }
    const merged = [...safeOptions, ...parsed].map((entry) => entry.trim()).filter(Boolean);
    const unique = [...new Set(merged.map((entry) => entry.toLowerCase()))]
      .map((lowered) => merged.find((entry) => entry.toLowerCase() === lowered) || lowered);
    updateOptions(unique);
    setBulkInput('');
    setBulkError('');
  };

  const removeOption = (index) => {
    if (safeOptions.length <= 1) {
      updateOptions(['']);
      return;
    }
    updateOptions(safeOptions.filter((_, idx) => idx !== index));
  };

  const toggle = (option) => {
    if (!allowCorrect) return;
    if (multiple) {
      const next = isSelected(option) ? currentAnswers.filter((a) => a !== option) : [...currentAnswers, option];
      onChange({ ...block, answer: next.join(' | ') });
    } else {
      onChange({ ...block, answer: option });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">Options</div>
        <button type="button" onClick={addOption} className="border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 hover:border-zinc-400">+ Option</button>
      </div>
      <div className="space-y-2">
        {safeOptions.map((option, index) => {
          const active = isSelected(option);
          return (
            <div key={`${index}-${option}`} className="flex items-center gap-2 border border-zinc-200 px-2 py-2">
              <span className="w-5 text-center text-[10px] text-zinc-400">{index + 1}</span>
              <input
                value={option}
                onChange={(event) => updateOption(index, event.target.value)}
                placeholder={`Option ${index + 1}`}
                className="min-w-0 flex-1 border border-zinc-200 px-2 py-1.5 text-sm outline-none focus:border-zinc-900"
              />
              {allowCorrect && (
                <button
                  type="button"
                  onClick={() => toggle(option)}
                  disabled={!option.trim()}
                  className={active ? 'border border-zinc-900 bg-zinc-900 px-2 py-1 text-[10px] text-white' : 'border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 hover:border-zinc-400 disabled:opacity-40'}
                  title={multiple ? 'Toggle as correct answer' : 'Set as correct answer'}
                >
                  {multiple ? (active ? 'Correct' : 'Mark') : (active ? 'Correct' : 'Set')}
                </button>
              )}
              <button type="button" onClick={() => removeOption(index)} className="px-1 text-zinc-300 hover:text-red-500">×</button>
            </div>
          );
        })}
      </div>
      <details className="border border-zinc-200 bg-zinc-50 px-3 py-2">
        <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Bulk import CSV</summary>
        <div className="mt-2 space-y-2">
          <textarea
            value={bulkInput}
            onChange={(event) => setBulkInput(event.target.value)}
            rows={4}
            placeholder={'Option A\nOption B\nOption C\n\nOr CSV: Option A,Option B,Option C'}
            className="w-full border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-zinc-900"
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={importBulkOptions} className="border border-zinc-900 bg-zinc-900 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white">Import</button>
            <button type="button" onClick={() => { setBulkInput(''); setBulkError(''); }} className="border border-zinc-200 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-600">Clear</button>
          </div>
          {bulkError && <div className="text-[10px] text-red-600">{bulkError}</div>}
        </div>
      </details>
      {allowCorrect && currentAnswers.length === 0 && <div className="text-[10px] text-amber-600">No correct answer selected yet.</div>}
    </div>
  );
}

function BankSizeWarning({ block }) {
  if (block.taskType !== 'drag_to_blank') return null;
  const text = block.text || '';
  const blankCount = (text.match(/___|\{[^}]*\}/g) || []).length;
  const blanks = block.blanks || [];
  const bankSize = blanks.length;
  if (blankCount === 0) return null;
  if (bankSize >= blankCount) return null;
  return (
    <div className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      Word bank has {bankSize} item{bankSize !== 1 ? 's' : ''} but text has {blankCount} blank{blankCount !== 1 ? 's' : ''}. Add {blankCount - bankSize} more blank{blankCount - bankSize !== 1 ? 's' : ''} to the bank.
    </div>
  );
}

function normalizeRows(block) {
  const rows = block.rows?.length ? block.rows : [['Cell 1', 'Cell 2'], ['Cell 3', 'Cell 4']];
  return rows.map((row) => Array.isArray(row) ? row : row.toString().split('|').map((cell) => cell.trim()));
}

function StepListEditor({ block, onChange }) {
  const [dragIndex, setDragIndex] = useState(null);
  const steps = block.steps || [];

  const replaceSteps = (nextSteps) => onChange({ ...block, steps: nextSteps });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => replaceSteps([...steps, `Step ${steps.length + 1}`])} className="border border-zinc-200 px-3 py-2 text-xs text-zinc-700">Add step</button>
      </div>
      <div className="space-y-2">
        {steps.map((step, index) => (
          <div
            key={`${index}-${step}`}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex === null || dragIndex === index) return;
              const nextSteps = [...steps];
              const [moved] = nextSteps.splice(dragIndex, 1);
              nextSteps.splice(index, 0, moved);
              replaceSteps(nextSteps);
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
            className="border border-zinc-200 bg-white p-3"
          >
            <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
              <span>Step {index + 1}</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => replaceSteps(steps.filter((_, stepIndex) => stepIndex !== index))} className="border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600">Remove</button>
              </div>
            </div>
            <textarea rows={3} value={step} onChange={(event) => replaceSteps(steps.map((current, stepIndex) => stepIndex === index ? event.target.value : current))} className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900" />
          </div>
        ))}
        {steps.length === 0 && <div className="border border-dashed border-zinc-300 px-3 py-4 text-sm text-zinc-500">No steps yet. Add one to build a carousel or step-by-step slide.</div>}
      </div>
    </div>
  );
}

function TableGridEditor({ block, onChange, revealMode = false }) {
  const rows = normalizeRows(block);
  const width = Math.max(block.columns?.length || 0, ...rows.map((row) => row.length), 2);
  const columns = (block.columns?.length ? block.columns : Array.from({ length: width }).map((_, index) => `Column ${index + 1}`)).slice(0, width);
  const paddedRows = rows.map((row) => Array.from({ length: width }).map((_, index) => row[index] || ''));
  const hiddenCells = new Set(block.hiddenCells || []);
  const hiddenRows = new Set((block.hiddenRows || []).map((value) => String(value)));

  const updateTable = (nextRows, nextColumns = columns) => onChange({ ...block, rows: nextRows, columns: nextColumns });

  const toggleHiddenCell = (rowIndex, columnIndex) => {
    const key = `${rowIndex}:${columnIndex}`;
    const next = hiddenCells.has(key) ? [...hiddenCells].filter((entry) => entry !== key) : [...hiddenCells, key];
    onChange({ ...block, hiddenCells: next });
  };

  const toggleHiddenRow = (rowIndex) => {
    const key = String(rowIndex);
    const next = hiddenRows.has(key) ? [...hiddenRows].filter((entry) => entry !== key) : [...hiddenRows, key];
    onChange({ ...block, hiddenRows: next });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => updateTable([...paddedRows, Array.from({ length: width }).map((_, index) => `Cell ${paddedRows.length + 1}.${index + 1}`)])} className="border border-zinc-200 px-3 py-2 text-xs text-zinc-700">Add row</button>
        <button type="button" onClick={() => updateTable(paddedRows.map((row) => [...row, `Cell ${row.length + 1}`]), [...columns, `Column ${columns.length + 1}`])} className="border border-zinc-200 px-3 py-2 text-xs text-zinc-700">Add column</button>
      </div>
      <div className="overflow-auto border border-zinc-200">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-zinc-50">
            <tr>
              {revealMode && <th className="border border-zinc-200 px-3 py-2 text-left text-[10px] uppercase tracking-[0.18em] text-zinc-500">Hide row</th>}
              {columns.map((column, columnIndex) => (
                <th key={columnIndex} className="border border-zinc-200 p-0">
                  <input value={column} onChange={(event) => onChange({ ...block, columns: columns.map((entry, index) => index === columnIndex ? event.target.value : entry), rows: paddedRows })} className="w-full min-w-28 border-0 bg-zinc-50 px-3 py-3 font-medium outline-none" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paddedRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {revealMode && (
                  <td className="border border-zinc-200 px-2 py-2 text-center">
                    <button type="button" onClick={() => toggleHiddenRow(rowIndex)} className={hiddenRows.has(String(rowIndex)) ? 'border border-zinc-900 bg-zinc-900 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-white' : 'border border-zinc-200 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-zinc-600'}>{hiddenRows.has(String(rowIndex)) ? 'Hidden' : 'Shown'}</button>
                  </td>
                )}
                {row.map((cell, columnIndex) => {
                  const key = `${rowIndex}:${columnIndex}`;
                  return (
                    <td key={columnIndex} className="border border-zinc-200 p-0 align-top">
                      <div className={revealMode && hiddenCells.has(key) ? 'bg-zinc-950 text-white' : ''}>
                        <input value={cell} onChange={(event) => updateTable(paddedRows.map((currentRow, currentRowIndex) => currentRowIndex === rowIndex ? currentRow.map((currentCell, currentColumnIndex) => currentColumnIndex === columnIndex ? event.target.value : currentCell) : currentRow), columns)} className={revealMode && hiddenCells.has(key) ? 'w-full min-w-28 border-0 bg-zinc-950 px-3 py-3 outline-none placeholder:text-zinc-400' : 'w-full min-w-28 border-0 px-3 py-3 outline-none'} />
                        {revealMode && (
                          <button type="button" onClick={() => toggleHiddenCell(rowIndex, columnIndex)} className={hiddenCells.has(key) ? 'w-full border-t border-zinc-800 bg-zinc-900 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-white' : 'w-full border-t border-zinc-200 bg-zinc-50 px-3 py-2 text-[10px] uppercase tracking-[0.16em] text-zinc-600'}>
                            {hiddenCells.has(key) ? 'Hidden cell' : 'Hide cell'}
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const BLANK_PATTERN = /(\{[^}]*\}|\{\}|_{3,}|\[blank\]|\[\d+\])/i;

function InlineBlanksEditor({ block, onChange }) {
  const text = block.text || '';
  const isBlanksField = block.taskType === 'drag_to_blank';
  const parts = text.split(BLANK_PATTERN);
  const blankIndices = [];
  parts.forEach((part, i) => { if (BLANK_PATTERN.test(part)) blankIndices.push(i); });
  const blankCount = blankIndices.length;

  const answers = isBlanksField
    ? (block.blanks || [])
    : (block.answer || '').split('|').map((a) => a.trim());

  const updateAnswer = (idx, value) => {
    const next = [...answers];
    while (next.length <= idx) next.push('');
    next[idx] = value;
    if (isBlanksField) {
      onChange({ ...block, blanks: next });
    } else {
      onChange({ ...block, answer: next.join(' | ') });
    }
  };

  if (blankCount === 0) {
    return (
      <div className="border border-dashed border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400">
        No blanks found in text. Use <code className="border border-zinc-200 bg-zinc-50 px-1 py-0.5">___</code> or <code className="border border-zinc-200 bg-zinc-50 px-1 py-0.5">{'{}'}</code> to create blanks.
      </div>
    );
  }

  let blankNum = 0;
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">Answers for each blank</div>
      <div className="border border-zinc-200 bg-zinc-50 p-3 text-sm leading-8 text-zinc-700">
        {parts.map((part, i) => {
          if (!BLANK_PATTERN.test(part)) {
            return <span key={i} className="whitespace-pre-wrap">{part}</span>;
          }
          const idx = blankNum++;
          return (
            <span key={i} className="inline-flex items-center">
              <span className="mr-0.5 text-[10px] font-bold text-zinc-400">{idx + 1}</span>
              <input
                value={answers[idx] || ''}
                onChange={(e) => updateAnswer(idx, e.target.value)}
                placeholder={`blank ${idx + 1}`}
                className="mx-0.5 inline-flex w-28 border border-dashed border-zinc-400 bg-white px-2 py-0.5 text-center text-sm text-zinc-900 outline-none transition focus:border-zinc-900"
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}

function ItemListEditor({ block, onChange, label = 'Items', field = 'items' }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [bulkInput, setBulkInput] = useState('');
  const [bulkError, setBulkError] = useState('');
  const items = block[field] || [];
  const update = (next) => onChange({ ...block, [field]: next });
  const updateItem = (idx, value) => update(items.map((item, i) => i === idx ? value : item));
  const addItem = () => update([...items, '']);
  const importBulkItems = () => {
    const parsed = parseBulkValues(bulkInput);
    if (parsed.length === 0) {
      setBulkError('No valid items found in this CSV text.');
      return;
    }
    const merged = [...items, ...parsed].map((entry) => String(entry || '').trim()).filter(Boolean);
    update(merged);
    setBulkInput('');
    setBulkError('');
  };
  const removeItem = (idx) => update(items.filter((_, i) => i !== idx));
  const moveItem = (idx, dir) => {
    const t = idx + dir;
    if (t < 0 || t >= items.length) return;
    const next = [...items];
    [next[idx], next[t]] = [next[t], next[idx]];
    update(next);
  };

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">{label}</div>
      {items.map((item, idx) => (
        <div
          key={idx}
          draggable
          onDragStart={() => setDragIndex(idx)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIndex === null || dragIndex === idx) return;
            const next = [...items];
            const [moved] = next.splice(dragIndex, 1);
            next.splice(idx, 0, moved);
            update(next);
            setDragIndex(null);
          }}
          onDragEnd={() => setDragIndex(null)}
          className={`group flex items-center gap-1.5 ${dragIndex === idx ? 'opacity-40' : ''}`}
        >
          <span className="w-5 cursor-grab text-center text-[10px] text-zinc-400" title="Drag to reorder">☰</span>
          <span className="w-5 text-center text-[10px] text-zinc-400">{idx + 1}</span>
          <input
            value={item}
            onChange={(e) => updateItem(idx, e.target.value)}
            className="min-w-0 flex-1 border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-900"
          />
          <div className="flex shrink-0 flex-col opacity-0 transition group-hover:opacity-100">
            <button type="button" onClick={() => moveItem(idx, -1)} disabled={idx === 0} className="px-0.5 text-[10px] text-zinc-400 hover:text-zinc-700 disabled:opacity-20">▲</button>
            <button type="button" onClick={() => moveItem(idx, 1)} disabled={idx === items.length - 1} className="px-0.5 text-[10px] text-zinc-400 hover:text-zinc-700 disabled:opacity-20">▼</button>
          </div>
          <button type="button" onClick={() => removeItem(idx)} className="shrink-0 px-1 text-zinc-300 hover:text-red-500">×</button>
        </div>
      ))}
      <button type="button" onClick={addItem} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-zinc-400">+ Add Item</button>
      <details className="border border-zinc-200 bg-zinc-50 px-3 py-2">
        <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Bulk import CSV</summary>
        <div className="mt-2 space-y-2">
          <textarea
            value={bulkInput}
            onChange={(event) => setBulkInput(event.target.value)}
            rows={4}
            placeholder={'Item 1\nItem 2\nItem 3\n\nOr CSV: Item 1,Item 2,Item 3'}
            className="w-full border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-zinc-900"
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={importBulkItems} className="border border-zinc-900 bg-zinc-900 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white">Import</button>
            <button type="button" onClick={() => { setBulkInput(''); setBulkError(''); }} className="border border-zinc-200 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-600">Clear</button>
          </div>
          {bulkError && <div className="text-[10px] text-red-600">{bulkError}</div>}
        </div>
      </details>
    </div>
  );
}

function CategorizeEditor({ block, onChange }) {
  const categories = block.categories || [];
  const pairs = block.pairs || [];

  const updateCategories = (next) => onChange({ ...block, categories: next });
  const updatePairs = (next) => onChange({ ...block, pairs: next });

  const addCategory = () => updateCategories([...categories, '']);
  const removeCategory = (idx) => {
    const removed = categories[idx];
    updateCategories(categories.filter((_, i) => i !== idx));
    if (removed) updatePairs(pairs.filter((p) => p.right !== removed));
  };

  const addItem = (category) => updatePairs([...pairs, { left: '', right: category }]);
  const removeItem = (idx) => updatePairs(pairs.filter((_, i) => i !== idx));
  const updateItem = (idx, value) => updatePairs(pairs.map((p, i) => i === idx ? { ...p, left: value } : p));
  const moveItem = (idx, newCategory) => updatePairs(pairs.map((p, i) => i === idx ? { ...p, right: newCategory } : p));

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">Categories &amp; Items</div>
      <div className="grid gap-3 sm:grid-cols-2">
        {categories.map((cat, catIdx) => {
          const color = CATEGORY_COLORS[catIdx % CATEGORY_COLORS.length];
          const catItems = pairs.map((p, i) => ({ ...p, _idx: i })).filter((p) => p.right === cat);
          return (
            <div key={catIdx} className={`border ${color.border} ${color.bg} p-3 space-y-2`}>
              <div className="flex items-center gap-2">
                <span className={`h-3 w-3 shrink-0 ${color.badge}`} />
                <input
                  value={cat}
                  onChange={(e) => {
                    const oldName = categories[catIdx];
                    const nextCats = categories.map((c, i) => i === catIdx ? e.target.value : c);
                    const nextPairs = pairs.map((p) => p.right === oldName ? { ...p, right: e.target.value } : p);
                    onChange({ ...block, categories: nextCats, pairs: nextPairs });
                  }}
                  placeholder="Category name"
                  className="min-w-0 flex-1 border border-zinc-200 bg-white px-2 py-1 text-sm font-medium outline-none focus:border-zinc-900"
                />
                <button type="button" onClick={() => removeCategory(catIdx)} className="text-zinc-300 hover:text-red-500">×</button>
              </div>
              <div className="space-y-1">
                {catItems.map((item) => (
                  <div key={item._idx} className="flex items-center gap-1">
                    <input
                      value={item.left}
                      onChange={(e) => updateItem(item._idx, e.target.value)}
                      placeholder="Item…"
                      className="min-w-0 flex-1 border border-zinc-200 bg-white px-2 py-1 text-sm outline-none focus:border-zinc-900"
                    />
                    {categories.length > 1 && (
                      <select
                        value={item.right}
                        onChange={(e) => moveItem(item._idx, e.target.value)}
                        className="shrink-0 border border-zinc-200 bg-white px-1 py-1 text-[10px] outline-none"
                      >
                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                    <button type="button" onClick={() => removeItem(item._idx)} className="text-zinc-300 hover:text-red-500">×</button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addItem(cat)} className="border border-zinc-200 bg-white px-2 py-1 text-[10px] text-zinc-600 hover:border-zinc-400">+ Item</button>
            </div>
          );
        })}
      </div>
      <button type="button" onClick={addCategory} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-zinc-400">+ Add Category</button>
      {categories.length === 0 && <div className="border border-dashed border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400">Add categories, then add items to each one.</div>}
    </div>
  );
}

function HighlightEditor({ block, onChange }) {
  const text = block.text || '';
  const targets = block.targets || [];

  const words = text.split(/(\s+)/);

  const isTarget = (word) => {
    const clean = word.replace(/[.,!?;:'"()]/g, '').toLowerCase();
    if (!clean) return false;
    return targets.some((t) => t.toLowerCase() === clean);
  };

  const toggleWord = (word) => {
    const clean = word.replace(/[.,!?;:'"()]/g, '').trim();
    if (!clean) return;
    const lower = clean.toLowerCase();
    if (targets.some((t) => t.toLowerCase() === lower)) {
      onChange({ ...block, targets: targets.filter((t) => t.toLowerCase() !== lower) });
    } else {
      onChange({ ...block, targets: [...targets, clean] });
    }
  };

  if (!text.trim()) {
    return <div className="border border-dashed border-zinc-200 px-4 py-4 text-center text-xs text-zinc-400">Add text above first, then click words to mark as targets.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">Click words to toggle as targets ({targets.length} selected)</div>
      <div className="border border-zinc-200 bg-zinc-50 p-4 text-sm leading-7">
        {words.map((word, idx) => {
          if (/^\s+$/.test(word)) return <span key={idx}>{word}</span>;
          const active = isTarget(word);
          return (
            <button
              key={idx}
              type="button"
              onClick={() => toggleWord(word)}
              className={active
                ? 'bg-yellow-300 px-0.5 font-semibold text-zinc-900 hover:bg-yellow-400'
                : 'px-0.5 text-zinc-700 hover:bg-yellow-100'}
            >
              {word}
            </button>
          );
        })}
      </div>
      {targets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {targets.map((t, idx) => (
            <span key={idx} className="inline-flex items-center gap-1 border border-yellow-300 bg-yellow-50 px-2 py-0.5 text-xs">
              {t}
              <button type="button" onClick={() => onChange({ ...block, targets: targets.filter((_, i) => i !== idx) })} className="text-zinc-400 hover:text-red-500">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PairsEditor({ block, onChange, label = 'Pairs', leftLabel = 'Left', rightLabel = 'Right' }) {
  const [bulkInput, setBulkInput] = useState('');
  const [bulkError, setBulkError] = useState('');
  const pairs = block.pairs || [];
  const update = (next) => onChange({ ...block, pairs: next });
  const updatePair = (idx, side, value) => update(pairs.map((p, i) => (i === idx ? { ...p, [side]: value } : p)));
  const addPair = () => update([...pairs, { left: '', right: '' }]);
  const importBulkPairs = () => {
    const parsed = parseBulkPairs(bulkInput);
    if (parsed.length === 0) {
      setBulkError('No valid pairs found. Use two columns (left,right) or left => right.');
      return;
    }
    update([...pairs, ...parsed]);
    setBulkInput('');
    setBulkError('');
  };
  const removePair = (idx) => update(pairs.filter((_, i) => i !== idx));
  const movePair = (idx, dir) => {
    const t = idx + dir;
    if (t < 0 || t >= pairs.length) return;
    const next = [...pairs];
    [next[idx], next[t]] = [next[t], next[idx]];
    update(next);
  };

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-400">{label}</div>
      {pairs.map((pair, idx) => (
        <div key={idx} className="group flex items-center gap-1.5">
          <span className="w-5 text-center text-[10px] text-zinc-400">{idx + 1}</span>
          <input value={pair.left || ''} onChange={(e) => updatePair(idx, 'left', e.target.value)} placeholder={leftLabel} className="min-w-0 flex-1 border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-900" />
          <span className="text-xs text-zinc-300">⇄</span>
          <input value={pair.right || ''} onChange={(e) => updatePair(idx, 'right', e.target.value)} placeholder={rightLabel} className="min-w-0 flex-1 border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-900" />
          <div className="flex shrink-0 flex-col opacity-0 transition group-hover:opacity-100">
            <button type="button" onClick={() => movePair(idx, -1)} disabled={idx === 0} className="px-0.5 text-[10px] text-zinc-400 hover:text-zinc-700 disabled:opacity-20">▲</button>
            <button type="button" onClick={() => movePair(idx, 1)} disabled={idx === pairs.length - 1} className="px-0.5 text-[10px] text-zinc-400 hover:text-zinc-700 disabled:opacity-20">▼</button>
          </div>
          <button type="button" onClick={() => removePair(idx)} className="shrink-0 px-1 text-zinc-300 hover:text-red-500">×</button>
        </div>
      ))}
      <button type="button" onClick={addPair} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-zinc-400">+ Add Pair</button>
      <details className="border border-zinc-200 bg-zinc-50 px-3 py-2">
        <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Bulk import CSV</summary>
        <div className="mt-2 space-y-2">
          <textarea
            value={bulkInput}
            onChange={(event) => setBulkInput(event.target.value)}
            rows={4}
            placeholder={'left,right\ncat,gato\ndog,perro\n\nOr left => right'}
            className="w-full border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-zinc-900"
          />
          <div className="flex items-center gap-2">
            <button type="button" onClick={importBulkPairs} className="border border-zinc-900 bg-zinc-900 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white">Import</button>
            <button type="button" onClick={() => { setBulkInput(''); setBulkError(''); }} className="border border-zinc-200 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-600">Clear</button>
          </div>
          {bulkError && <div className="text-[10px] text-red-600">{bulkError}</div>}
        </div>
      </details>
    </div>
  );
}

const PAIR_LABELS = {
  cards: { label: 'Cards', left: 'Front', right: 'Back' },
  drag_match: { label: 'Match Items', left: 'Item', right: 'Definition' },
  matching_pairs_categories: { label: 'Pairs', left: 'Example', right: 'Category' },
  emoji_symbol_match: { label: 'Symbols', left: 'Symbol', right: 'Meaning' },
};

function parseDialogueMessages(text) {
  if (!text) return [{ speaker: 'A', content: '' }, { speaker: 'B', content: '' }];
  const msgs = [];
  text.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const m = trimmed.match(/^([A-Za-z0-9_ ]+?)\s*:\s*(.*)$/);
    if (m) msgs.push({ speaker: m[1].trim(), content: m[2] });
    else msgs.push({ speaker: '', content: trimmed });
  });
  return msgs.length > 0 ? msgs : [{ speaker: 'A', content: '' }, { speaker: 'B', content: '' }];
}

function serializeDialogueMessages(msgs) {
  return msgs.map((m) => (m.speaker ? `${m.speaker}: ${m.content}` : m.content)).join('\n');
}

function DialogueEditor({ block, onChange }) {
  const messages = parseDialogueMessages(block.text);
  const speakers = (() => {
    const s = [];
    messages.forEach((m) => { if (m.speaker && !s.includes(m.speaker)) s.push(m.speaker); });
    if (s.length === 0) { s.push('A'); s.push('B'); }
    return s;
  })();

  const update = (nextMsgs) => {
    onChange({ ...block, text: serializeDialogueMessages(nextMsgs) });
  };

  const updateMsg = (idx, field, value) => {
    update(messages.map((m, i) => (i === idx ? { ...m, [field]: value } : m)));
  };

  const addMessage = () => {
    const last = messages[messages.length - 1]?.speaker || speakers[0];
    const next = speakers[(speakers.indexOf(last) + 1) % speakers.length] || 'A';
    update([...messages, { speaker: next, content: '' }]);
  };

  const removeMessage = (idx) => {
    if (messages.length <= 1) return;
    update(messages.filter((_, i) => i !== idx));
  };

  const addSpeaker = () => {
    const names = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const next = names.find((n) => !speakers.includes(n)) || `S${speakers.length + 1}`;
    update([...messages, { speaker: next, content: '' }]);
  };

  const moveMessage = (idx, dir) => {
    const target = idx + dir;
    if (target < 0 || target >= messages.length) return;
    const next = [...messages];
    [next[idx], next[target]] = [next[target], next[idx]];
    update(next);
  };

  const showBlanks = block.taskType === 'dialogue_fill' || block.taskType === 'dialogue_completion';
  const totalBlanks = messages.reduce((c, m) => c + (m.content.match(/(\{[^}]+\}|\{\}|\[\d+\]|_{3,}|\[blank\])/gi) || []).length, 0);

  const getSpeakerColor = (speaker) => {
    const idx = speakers.indexOf(speaker);
    return DIALOGUE_COLORS[(idx >= 0 ? idx : 0) % DIALOGUE_COLORS.length];
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <span className="font-medium uppercase tracking-[0.18em] text-zinc-400">Dialogue</span>
        <span className="text-zinc-300">•</span>
        <span>{messages.length} messages</span>
        <span className="text-zinc-300">•</span>
        <span>{speakers.join(', ')}</span>
        {showBlanks && <><span className="text-zinc-300">•</span><span>{totalBlanks} blanks</span></>}
      </div>

      <div className="space-y-1.5">
        {messages.map((msg, idx) => {
          const color = getSpeakerColor(msg.speaker);
          const isLeft = speakers.indexOf(msg.speaker) % 2 === 0;
          return (
            <div key={idx} className={`group flex items-center gap-1.5 ${isLeft ? '' : 'flex-row-reverse'}`}>
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center text-[10px] font-bold text-white ${color.avatar}`}>
                {msg.speaker?.[0]?.toUpperCase() || '?'}
              </div>
              <div className={`flex min-w-0 flex-1 items-center gap-1 border px-2 py-1.5 ${color.bg} ${color.border}`}>
                <select
                  value={msg.speaker}
                  onChange={(e) => updateMsg(idx, 'speaker', e.target.value)}
                  className={`w-16 shrink-0 border-0 bg-transparent text-xs font-semibold outline-none ${color.text}`}
                >
                  {speakers.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input
                  value={msg.content}
                  onChange={(e) => updateMsg(idx, 'content', e.target.value)}
                  placeholder="Type message…"
                  className="min-w-0 flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-zinc-400"
                />
                {showBlanks && (
                  <button type="button" onClick={() => updateMsg(idx, 'content', msg.content + ' {answer}')} className="shrink-0 border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 hover:border-zinc-400" title="Insert blank — replace 'answer' with the correct word">{"{…}"}</button>
                )}
              </div>
              <div className="flex shrink-0 flex-col opacity-0 transition group-hover:opacity-100">
                <button type="button" onClick={() => moveMessage(idx, -1)} disabled={idx === 0} className="px-0.5 text-[10px] text-zinc-400 hover:text-zinc-700 disabled:opacity-20">▲</button>
                <button type="button" onClick={() => moveMessage(idx, 1)} disabled={idx === messages.length - 1} className="px-0.5 text-[10px] text-zinc-400 hover:text-zinc-700 disabled:opacity-20">▼</button>
              </div>
              <button type="button" onClick={() => removeMessage(idx)} disabled={messages.length <= 1} className="shrink-0 px-1 text-sm text-zinc-300 hover:text-red-500 disabled:opacity-20">×</button>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={addMessage} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-zinc-400">+ Message</button>
        <button type="button" onClick={addSpeaker} className="border border-dashed border-zinc-300 px-3 py-1.5 text-xs text-zinc-500 hover:border-zinc-400">+ New Speaker</button>
      </div>
    </div>
  );
}

export default function BlockEditorForm({ block, onChange, compact = false }) {
  if (!block) return null;
  const [showTaskMenu, setShowTaskMenu] = useState(false);
  const [showExplanation, setShowExplanation] = useState(Boolean((block.explanation || '').trim()));

  useEffect(() => {
    setShowExplanation(Boolean((block.explanation || '').trim()));
  }, [block.id, block.explanation]);

  const area = (field, label, rows = compact ? 3 : 4, help = '') => (
    <Field label={label} help={help}>
      <TextArea value={serializeBlockField(block, field)} onChange={(value) => apply(onChange, block, field, value)} rows={rows} />
    </Field>
  );

  const richArea = (field, label, rows = compact ? 8 : 10, help = '') => (
    <Field label={label} help={help}>
      <MarkdownComposer value={serializeBlockField(block, field)} onChange={(value) => apply(onChange, block, field, value)} rows={rows} />
    </Field>
  );

  const input = (field, label, help = '') => (
    <Field label={label} help={help}>
      <TextInput value={block[field] || ''} onChange={(value) => apply(onChange, block, field, value)} />
    </Field>
  );

  const mediaInput = (field, label, help = '') => (
    <Field label={label} help={help}>
      <MediaInput value={block[field] || ''} onChange={(value) => apply(onChange, block, field, value)} />
    </Field>
  );

  const taskPrompt = (field, label, rows = compact ? 5 : 6, help = '') => (
    <Field label={label} help={help}>
      <MarkdownComposer value={serializeBlockField(block, field)} onChange={(value) => apply(onChange, block, field, value)} rows={rows} />
    </Field>
  );

  const loadSampleTable = () => {
    if (block.type === 'table') {
      onChange({
        ...block,
        columns: ['Prompt', 'Answer'],
        rows: [['I / You / We / They', 'work'], ['He / She / It', 'works']],
      });
      return;
    }
    onChange({
      ...block,
      rows: [['Prompt', 'Student fill'], ['Example', 'Answer'], ['Extension', 'Open response']],
    });
  };

  const addTableRow = () => {
    const rows = [...(block.rows || [])];
    const width = Math.max(rows[0]?.length || block.columns?.length || 2, 2);
    rows.push(Array.from({ length: width }).map((_, index) => `Cell ${rows.length + 1}.${index + 1}`));
    onChange({ ...block, rows });
  };

  const addTableColumn = () => {
    if (block.type !== 'table') return;
    const nextColumns = [...(block.columns || []), `Column ${(block.columns || []).length + 1}`];
    const nextRows = (block.rows || []).map((row) => [...row, `Cell ${row.length + 1}`]);
    onChange({ ...block, columns: nextColumns, rows: nextRows });
  };

  return (
    <div className="builder-form space-y-5">
      {/* Toggle bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 pb-3">
        <Toggle checked={block.enabled !== false} onChange={(value) => apply(onChange, block, 'enabled', value)} />
        {block.type === 'task' && (
          <div className="relative ml-auto">
            <button type="button" onClick={() => setShowTaskMenu((value) => !value)} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-zinc-400" title="Task options">⋮</button>
            {showTaskMenu && (
              <div className="absolute right-0 top-full z-20 mt-1 min-w-[240px] border border-zinc-200 bg-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                <div className="space-y-1">
                  <Toggle checked={block.shuffle !== false} onChange={(value) => apply(onChange, block, 'shuffle', value)} label="Shuffle" />
                  <Toggle checked={block.required !== false} onChange={(value) => apply(onChange, block, 'required', value)} label="Required task" />
                  {block.taskType === 'random_wheel' && <Toggle checked={Boolean(block.repeat)} onChange={(value) => apply(onChange, block, 'repeat', value)} label="Repeat" />}
                  {['multiple_choice', 'multi_select', 'opinion_survey', 'video_questions'].includes(block.taskType) && <Toggle checked={Boolean(block.multiple)} onChange={(value) => apply(onChange, block, 'multiple', value)} label="Allow multiple" />}
                  <Toggle
                    checked={showExplanation}
                    onChange={(value) => {
                      setShowExplanation(value);
                      if (!value && (block.explanation || '').trim()) apply(onChange, block, 'explanation', '');
                    }}
                    label="Show description"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Primary: Question / Title */}
      {block.type === 'task' ? taskPrompt('question', 'Question', compact ? 5 : 6, 'Supports bold, italic, lists, and line breaks') : input('title', 'Title', 'Heading of this slide')}

      {/* Content body */}
      {block.type !== 'task' && richArea('content', 'Content', compact ? 8 : 10, 'Supports Markdown: headings, lists, bold, tables')}
      {block.type === 'task' && input('hint', 'Hint', 'Optional hint shown before answering')}
      {block.type === 'task' && input('points', 'Points', 'Scoring weight for this question (default 1)')}
      {block.type === 'task' && showExplanation && taskPrompt('explanation', 'Description', 4, 'Optional text shown after submission and supports formatting')}

      {['two_column_text_task', 'image_task', 'video_task'].includes(block.type) && (
        <div className="grid gap-4 md:grid-cols-2">
          {richArea('left', 'Left Panel', 8)}
          {richArea('right', 'Right Panel', 8)}
        </div>
      )}

      {['image_task', 'video_task', 'map_diagram'].includes(block.type) && mediaInput('media', 'Media URL')}
      {['carousel', 'step_by_step'].includes(block.type) && <Field label="Steps"><StepListEditor block={block} onChange={onChange} /></Field>}
      {block.type === 'focus' && area('keywords', 'Keywords', 3)}
      {block.type === 'scenario' && <>
        {richArea('dialogue', 'Dialogue', 8)}
        <Toggle label="Reveal messages one by one" checked={Boolean(block.revealMode)} onChange={(value) => apply(onChange, block, 'revealMode', value)} />
      </>}
      {block.type === 'group_task_slide' && area('taskRefs', 'Task Refs', 4)}
      {block.type === 'flashcard_slide' && area('pairsText', 'Cards', 5)}
      {block.type === 'rich' && area('examples', 'Examples', 4)}

      {block.type === 'structure' && (
        <div className="grid gap-4 md:grid-cols-2">
          {area('positive', 'Positive', 3)}
          {area('negative', 'Negative', 3)}
          {area('question', 'Question', 3)}
          {area('examples', 'Examples', 4)}
        </div>
      )}

      {block.type === 'table' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={loadSampleTable} className="border border-zinc-200 px-3 py-2 text-xs text-zinc-700">Use sample table</button>
          </div>
          <Field label="Table editor"><TableGridEditor block={block} onChange={onChange} /></Field>
          <div className="grid gap-4 md:grid-cols-2">{area('columnsText', 'Columns', 2)}{area('rowsText', 'Rows', 5)}</div>
        </div>
      )}

      {block.type === 'task' && (
        <>
          {['multiple_choice', 'multi_select', 'true_false', 'yes_no', 'either_or'].includes(block.taskType) && <OptionListEditor block={block} onChange={onChange} multiple={block.taskType === 'multi_select' || block.multiple} allowCorrect />}
          {['opinion_survey'].includes(block.taskType) && <OptionListEditor block={block} onChange={onChange} multiple={Boolean(block.multiple)} allowCorrect={false} />}
          {['video_questions'].includes(block.taskType) && <OptionListEditor block={block} onChange={onChange} multiple={Boolean(block.multiple)} allowCorrect />}
          {['short_answer', 'long_answer', 'error_correction', 'flash_response', 'choose_and_explain', 'scenario_decision', 'highlight_mistake', 'select_and_correct'].includes(block.taskType) && input('answer', 'Answer', block.taskType === 'highlight_mistake' ? 'The incorrect word in the text' : block.taskType === 'select_and_correct' ? 'The correct replacement' : 'Correct answer(s), use | for multiple')}
          {['drag_to_blank', 'fill_typing', 'short_answer', 'long_answer', 'reading_highlight', 'error_correction', 'flash_response', 'choose_and_explain', 'scenario_decision', 'conditional_branch_questions', 'highlight_differences', 'memory_recall', 'keyword_expand', 'highlight_mistake', 'select_and_correct', 'highlight_glossary', 'text_linking'].includes(block.taskType) && area('text', 'Text', 4, block.taskType === 'text_linking' ? 'The passage for students to annotate' : block.taskType === 'highlight_glossary' ? 'The passage students click to collect words' : 'Use ___ or {} for blanks in fill tasks')}
          {['fill_typing', 'drag_to_blank'].includes(block.taskType) && <InlineBlanksEditor block={block} onChange={onChange} />}
          {['dialogue_fill', 'dialogue_completion', 'dialogue_reconstruct'].includes(block.taskType) && <DialogueEditor block={block} onChange={onChange} />}
          {['dialogue_fill', 'dialogue_completion'].includes(block.taskType) && !(block.text || '').includes('{') && input('answer', 'Answer', 'Correct values for each blank, separated by | (optional with {answer} syntax)')}
          {['fill_typing', 'dialogue_fill', 'drag_to_blank'].includes(block.taskType) && (
            <Toggle label="Flexible answer order (accept shifted answers for consecutive blanks)" checked={Boolean(block.flexibleOrder)} onChange={(value) => apply(onChange, block, 'flexibleOrder', value)} />
          )}
          {['drag_to_blank', 'dialogue_completion'].includes(block.taskType) && area('options', 'Distractors (word bank extras)', 3, 'Extra wrong words for the word bank, one per line')}
          <BankSizeWarning block={block} />
          {['drag_drop', 'match', 'drag_match', 'matching_pairs_categories', 'emoji_symbol_match', 'highlight_glossary'].includes(block.taskType) && (() => {
            if (block.taskType === 'highlight_glossary') {
              return <PairsEditor block={block} onChange={onChange} label="Optional translations" leftLabel="Word" rightLabel="Translation" />;
            }
            const labels = PAIR_LABELS[block.taskType] || { label: 'Pairs', left: 'Left', right: 'Right' };
            return <PairsEditor block={block} onChange={onChange} label={labels.label} leftLabel={labels.left} rightLabel={labels.right} />;
          })()}
          {['cards'].includes(block.taskType) && <PairsEditor block={block} onChange={onChange} label="Cards" leftLabel="Front" rightLabel="Back" />}
          {['order', 'random_wheel', 'timeline_order', 'sentence_builder', 'peer_review_checklist', 'story_reconstruction', 'justify_order', 'word_family_builder', 'word_cloud'].includes(block.taskType) && <ItemListEditor block={block} onChange={onChange} label={block.taskType === 'sentence_builder' ? 'Words / Chunks' : block.taskType === 'word_family_builder' ? 'Word Forms' : block.taskType === 'peer_review_checklist' ? 'Checklist Items' : block.taskType === 'random_wheel' ? 'Wheel Segments' : block.taskType === 'word_cloud' ? 'Seed Words' : 'Items (correct order)'} />}
          {['categorize', 'categorize_grammar'].includes(block.taskType) && <CategorizeEditor block={block} onChange={onChange} />}
          {['reading_highlight', 'highlight_differences', 'highlight_glossary', 'text_linking'].includes(block.taskType) && <HighlightEditor block={block} onChange={onChange} />}
          {['image_labeling', 'audio_transcription', 'video_questions', 'map_geography_label', 'hotspot_selection', 'image_compare_spot', 'pronunciation_shadowing', 'youtube'].includes(block.taskType) && mediaInput('media', 'Media URL', 'Direct link to image, audio, or video')}
          {['image_labeling', 'map_geography_label', 'image_compare_spot'].includes(block.taskType) && <ItemListEditor block={block} onChange={onChange} label="Clickable targets" field="items" />}
          {['fill_grid', 'fill_table_matrix', 'puzzle_jigsaw', 'compare_contrast_table', 'table_reveal'].includes(block.taskType) && <Field label="Table editor"><TableGridEditor block={block} onChange={onChange} revealMode={block.taskType === 'table_reveal'} /></Field>}
          {['fill_grid', 'fill_table_matrix', 'puzzle_jigsaw', 'compare_contrast_table', 'table_reveal'].includes(block.taskType) && area('rowsText', 'Rows', 5)}
          {['fill_grid', 'fill_table_matrix', 'puzzle_jigsaw', 'compare_contrast_table', 'table_reveal'].includes(block.taskType) && area('columnsText', 'Columns', 2)}
          {['fill_grid', 'fill_table_matrix', 'puzzle_jigsaw', 'compare_contrast_table', 'table_reveal'].includes(block.taskType) && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={loadSampleTable} className="border border-zinc-200 px-3 py-2 text-xs text-zinc-700">Use sample grid</button>
              <button type="button" onClick={addTableRow} className="border border-zinc-200 px-3 py-2 text-xs text-zinc-700">Add row</button>
              <button type="button" onClick={addTableColumn} className="border border-zinc-200 px-3 py-2 text-xs text-zinc-700">Add column</button>
            </div>
          )}
          {block.taskType === 'table_reveal' && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Reveal Mode">
                <select value={block.revealMode || 'manual'} onChange={(event) => apply(onChange, block, 'revealMode', event.target.value)} className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
                  <option value="manual">Teacher chooses hidden cells</option>
                  <option value="random">Hide random cells</option>
                </select>
              </Field>
              <Field label="Random Hidden Count">
                <TextInput value={block.randomHiddenCount || ''} onChange={(value) => apply(onChange, block, 'randomHiddenCount', Number(value) || '')} />
              </Field>
              {area('hiddenRows', 'Hidden Rows', 3)}
              {area('hiddenCells', 'Hidden Cells', 3)}
            </div>
          )}
          {['matching_pairs_categories'].includes(block.taskType) && area('categories', 'Categories', 4, 'One category name per line')}
          {block.taskType === 'scale' && (
            <div className="grid gap-4 md:grid-cols-3">
              {input('min', 'Min')}
              {input('max', 'Max')}
              {input('answer', 'Selected Value')}
            </div>
          )}
          {block.taskType === 'random_wheel' && input('timeLimit', 'Time Limit')}
        </>
      )}
    </div>
  );
}
