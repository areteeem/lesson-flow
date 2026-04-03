import { useCallback, useRef, useState } from 'react';
import {
  parseQuizText,
  parseAnswerKey,
  applyAnswerKey,
  questionsToDsl,
  importQuizFile,
  ACCEPTED_QUIZ_EXTENSIONS,
} from '../utils/quizImport';
import { ClipboardIcon, UploadIcon, KeyIcon, CheckIcon, AlertTriangleIcon } from './Icons';

const EXAMPLE_TEXT = `1. Which planet is known as the Red Planet?
A) Earth
B) Mars
C) Venus
D) Jupiter

2. What is the largest ocean on Earth?
A. Atlantic Ocean
B. Indian Ocean
C. Arctic Ocean
D. Pacific Ocean

3. Explain the water cycle in your own words.`;

const EXAMPLE_ANSWER_KEY = `1. B
2. D`;

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-xs font-medium transition ${active ? 'border-b-2 border-zinc-900 text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'}`}
    >
      {children}
    </button>
  );
}

export default function QuizImportModal({ onImport, onClose }) {
  const [tab, setTab] = useState('paste');
  const [rawText, setRawText] = useState('');
  const [answerKeyText, setAnswerKeyText] = useState('');
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [preview, setPreview] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef(null);
  const backdropRef = useRef(null);

  const doParse = useCallback((text) => {
    if (!text.trim()) {
      setPreview(null);
      setWarnings([]);
      return;
    }
    let result = parseQuizText(text);
    if (answerKeyText.trim()) {
      const keyMap = parseAnswerKey(answerKeyText);
      result.questions = applyAnswerKey(result.questions, keyMap);
    }
    setPreview(result.questions);
    setWarnings(result.warnings);
  }, [answerKeyText]);

  const handleTextChange = (text) => {
    setRawText(text);
    doParse(text);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const result = await importQuizFile(file);
      if (answerKeyText.trim()) {
        const keyMap = parseAnswerKey(answerKeyText);
        result.questions = applyAnswerKey(result.questions, keyMap);
      }
      setPreview(result.questions);
      setWarnings(result.warnings);
      setTab('paste');
      // Show the generated text for editing
      setRawText(result.questions.map((q) => {
        let text = `${q.number}. ${q.text}`;
        q.options.forEach((o) => {
          text += `\n${o.letter}) ${o.text}`;
        });
        return text;
      }).join('\n\n'));
    } catch (err) {
      setWarnings([`File read error: ${err.message}`]);
    }
  };

  const handleAnswerKeyChange = (text) => {
    setAnswerKeyText(text);
    if (rawText.trim()) {
      let result = parseQuizText(rawText);
      if (text.trim()) {
        const keyMap = parseAnswerKey(text);
        result.questions = applyAnswerKey(result.questions, keyMap);
      }
      setPreview(result.questions);
      setWarnings(result.warnings);
    }
  };

  const handleImport = () => {
    if (!preview || preview.length === 0) return;
    const dsl = questionsToDsl(preview);
    onImport(dsl);
    onClose();
  };

  const handleBackdropClick = (e) => {
    if (e.target === backdropRef.current) onClose();
  };

  const qCount = preview?.length || 0;
  const withAnswers = preview?.filter((q) => q.correctAnswers.length > 0).length || 0;
  const withoutAnswers = qCount - withAnswers;

  return (
    <div ref={backdropRef} onClick={handleBackdropClick} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Import Quiz">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col border border-zinc-200 bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div className="text-sm font-semibold text-zinc-900">Import Quiz</div>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-700" aria-label="Close">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-100 px-4">
          <TabButton active={tab === 'paste'} onClick={() => setTab('paste')}>
            <span className="inline-flex items-center gap-1.5"><ClipboardIcon className="h-3.5 w-3.5" /> Paste Text</span>
          </TabButton>
          <TabButton active={tab === 'file'} onClick={() => setTab('file')}>
            <span className="inline-flex items-center gap-1.5"><UploadIcon className="h-3.5 w-3.5" /> Import File</span>
          </TabButton>
          <TabButton active={tab === 'examples'} onClick={() => setTab('examples')}>
            Examples
          </TabButton>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {tab === 'paste' && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Questions</label>
                <textarea
                  value={rawText}
                  onChange={(e) => handleTextChange(e.target.value)}
                  placeholder="Paste your quiz questions here…"
                  rows={8}
                  className="w-full resize-y border border-zinc-200 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-900"
                />
              </div>

              <div>
                <button type="button" onClick={() => setShowAnswerKey(!showAnswerKey)} className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700">
                  <KeyIcon className="h-3.5 w-3.5" />
                  {showAnswerKey ? 'Hide answer key' : 'Add answer key'}
                </button>
                {showAnswerKey && (
                  <div className="mt-2">
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Answer Key</label>
                    <textarea
                      value={answerKeyText}
                      onChange={(e) => handleAnswerKeyChange(e.target.value)}
                      placeholder="1. B&#10;2. D&#10;3. A, C"
                      rows={4}
                      className="w-full resize-y border border-zinc-200 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-zinc-900"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'file' && (
            <div className="space-y-3">
              <div className="text-xs text-zinc-500">Supported formats: .txt, .md, .csv, .tsv, .json</div>
              <div
                onClick={() => fileRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-zinc-300 bg-zinc-50 px-6 py-10 text-center transition hover:border-zinc-400"
              >
                <UploadIcon className="mb-2 h-8 w-8 text-zinc-400" />
                <div className="text-sm text-zinc-600">Click to select a file</div>
                <div className="mt-1 text-[11px] text-zinc-400">or drag and drop</div>
                {fileName && <div className="mt-2 text-xs font-medium text-zinc-700">{fileName}</div>}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_QUIZ_EXTENSIONS}
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="text-[11px] text-zinc-400">
                <strong>CSV/TSV format:</strong> question, optionA, optionB, optionC, optionD, answer<br />
                <strong>JSON format:</strong> {'[{ "question": "...", "options": ["A","B"], "answer": "A" }]'}
              </div>
            </div>
          )}

          {tab === 'examples' && (
            <div className="space-y-4">
              <div>
                <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Quiz Text Example</div>
                <pre className="whitespace-pre-wrap border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">{EXAMPLE_TEXT}</pre>
                <button type="button" onClick={() => { setRawText(EXAMPLE_TEXT); doParse(EXAMPLE_TEXT); setTab('paste'); }} className="mt-1 text-xs text-zinc-500 hover:text-zinc-700">Use this example →</button>
              </div>
              <div>
                <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Answer Key Example</div>
                <pre className="whitespace-pre-wrap border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">{EXAMPLE_ANSWER_KEY}</pre>
                <button type="button" onClick={() => { setAnswerKeyText(EXAMPLE_ANSWER_KEY); setShowAnswerKey(true); setTab('paste'); }} className="mt-1 text-xs text-zinc-500 hover:text-zinc-700">Use this answer key →</button>
              </div>
              <div className="border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                <div className="mb-1 font-medium">Supported question markers:</div>
                <ul className="ml-4 list-disc space-y-0.5">
                  <li>Numbered: 1. 2. 3. etc.</li>
                  <li>Options: A) B) C) or A. B. C. or A: B: C:</li>
                  <li>Multi-select: add "(Select all that apply)" to the question</li>
                  <li>Open-ended: questions without options → short answer</li>
                </ul>
              </div>
            </div>
          )}

          {/* Preview */}
          {preview && preview.length > 0 && (
            <div className="mt-4 border border-zinc-200 bg-zinc-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">Preview — {qCount} question{qCount !== 1 ? 's' : ''}</div>
                <div className="flex items-center gap-3 text-[10px] text-zinc-400">
                  {withAnswers > 0 && <span className="inline-flex items-center gap-1"><CheckIcon className="h-3 w-3 text-emerald-500" />{withAnswers} with answers</span>}
                  {withoutAnswers > 0 && <span className="inline-flex items-center gap-1"><AlertTriangleIcon className="h-3 w-3 text-amber-500" />{withoutAnswers} need answers</span>}
                </div>
              </div>
              <div className="max-h-40 space-y-1.5 overflow-auto">
                {preview.slice(0, 20).map((q, i) => (
                  <div key={i} className="border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">Q{q.number}. {q.text.slice(0, 80)}{q.text.length > 80 ? '…' : ''}</span>
                      <span className={`shrink-0 px-1.5 py-0.5 text-[10px] ${q.type === 'open_ended' ? 'bg-blue-50 text-blue-600' : q.type === 'multi_select' ? 'bg-violet-50 text-violet-600' : 'bg-zinc-100 text-zinc-500'}`}>
                        {q.type === 'open_ended' ? 'Open' : q.type === 'multi_select' ? 'Multi' : 'MC'}
                      </span>
                    </div>
                    {q.options.length > 0 && (
                      <div className="mt-0.5 text-[11px] text-zinc-400">
                        {q.options.map((o) => `${o.letter}) ${o.text}`).join(' · ')}
                      </div>
                    )}
                    {q.correctAnswers.length > 0 && (
                      <div className="mt-0.5 text-[11px] text-emerald-600">Answer: {q.correctAnswers.join(', ')}</div>
                    )}
                  </div>
                ))}
                {preview.length > 20 && <div className="text-center text-[11px] text-zinc-400">+{preview.length - 20} more…</div>}
              </div>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="mt-3 space-y-1">
              {warnings.map((w, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-amber-600">
                  <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0" />{w}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3">
          <div className="text-[11px] text-zinc-400">
            {qCount > 0 ? `${qCount} question${qCount !== 1 ? 's' : ''} ready` : 'No questions detected'}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-zinc-900">Cancel</button>
            <button type="button" onClick={handleImport} disabled={qCount === 0} className="border border-zinc-900 bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-30">
              Import {qCount > 0 ? `${qCount} Question${qCount !== 1 ? 's' : ''}` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
