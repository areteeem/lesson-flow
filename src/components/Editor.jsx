import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { generateDSL, parseLesson } from '../parser';
import { exportLesson, importDsl, importLesson, printLessonReport, printStudentLesson } from '../storage';
import { loadAppSettings } from '../utils/appSettings';
import { mergeGeneratedDslIntoLesson } from '../utils/aiBridge';
import { syncLessonToCloud } from '../utils/cloudSync';
import { addCustomTemplate } from './GuidePanel';
import { createDefaultBlock, createLessonTemplate, deleteBlockFromTree } from '../utils/builder';
import { flattenBlocks } from '../utils/lesson';
import { useAppContext } from '../context/AppContext';
import { LESSON_THEMES } from '../config/constants';
import HotkeysModal from './HotkeysModal';
import MarkdownComposer from './MarkdownComposer';
import TemplatePicker from './TemplatePicker';
import PromptModal from './PromptModal';
import { BackIcon, DotsVerticalIcon, PlayIcon as PlayIconSharp, SaveIcon as SaveIconSharp, SettingsIcon as SettingsIconSharp, DslIcon, BuilderIcon, PreviewIcon, TemplateIcon, ClipboardIcon, BrainIcon, QuestionIcon } from './Icons';
import QuizImportModal from './QuizImportModal';

const DslMonacoEditor = lazy(() => import('./DslMonacoEditor'));
const BuilderPanel = lazy(() => import('./BuilderPanel'));
const BlockPreview = lazy(() => import('./BlockPreview'));
const GradingConsole = lazy(() => import('./GradingConsole'));
const AiPanel = lazy(() => import('./AiPanel'));
const HISTORY_LIMIT = 50;

function createStateFromLesson(sourceLesson, existingBlocks) {
  const baseLesson = sourceLesson || createLessonTemplate('blank');
  const dsl = baseLesson.dsl || generateDSL(baseLesson);
  const parsed = parseLesson(dsl, existingBlocks);
  return { dsl, parsed };
}

function IconButton({ title, onClick, children, className = '', variant }) {
  const base = variant === 'primary'
    ? 'editor-control-btn editor-control-btn-primary inline-flex h-10 w-10 items-center justify-center border transition'
    : `editor-control-btn inline-flex h-10 w-10 items-center justify-center border transition ${className}`;
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className={base}>
      {children}
    </button>
  );
}

function MenuIcon() {
  return <DotsVerticalIcon />;
}

function PlayIcon() {
  return <PlayIconSharp />;
}

function SaveIcon() {
  return <SaveIconSharp />;
}

function SettingsIcon() {
  return <SettingsIconSharp />;
}

function AutoGrowField({ value, onChange, placeholder, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = '0px';
    ref.current.style.height = `${Math.max(ref.current.scrollHeight, 44)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value || ''}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={`w-full resize-none overflow-hidden border border-zinc-200 px-3 py-2 text-sm outline-none transition focus:border-zinc-900 ${className}`}
    />
  );
}

function formatSaveTime(timestamp) {
  if (!timestamp) return 'never';
  try {
    return new Date(timestamp).toLocaleTimeString();
  } catch {
    return 'unknown';
  }
}

function SaveStatusTag({ saveState }) {
  const dotColor = saveState.status === 'cloud_error'
    ? 'bg-red-500'
    : saveState.status === 'synced'
      ? 'bg-emerald-500'
      : saveState.status === 'saving_local' || saveState.status === 'syncing_cloud'
        ? 'bg-amber-500'
        : 'bg-zinc-400';

  return (
    <div className="group relative inline-flex items-center gap-1.5 px-1.5 py-1 text-[10px] text-zinc-500 cursor-default" title={`${saveState.label} ${saveState.detail || ''}`}>
      <span className={`dot-round h-1.5 w-1.5 ${dotColor} ${saveState.status === 'synced' ? 'animate-sync-check' : ''}`} aria-hidden="true" />
      <span className="font-medium uppercase tracking-[0.12em]">{saveState.label}</span>
    </div>
  );
}

function ToastStack({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <div key={toast.id} className={toast.tone === 'error' ? 'pointer-events-auto border border-red-300 bg-white px-3 py-2 shadow-lg animate-soft-rise' : toast.tone === 'warning' ? 'pointer-events-auto border border-amber-300 bg-white px-3 py-2 shadow-lg animate-soft-rise' : 'pointer-events-auto border border-emerald-300 bg-white px-3 py-2 shadow-lg animate-soft-rise'}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{toast.title}</div>
              <div className="mt-0.5 text-xs text-zinc-700">{toast.message}</div>
            </div>
            <button type="button" onClick={() => onDismiss(toast.id)} className="text-xs text-zinc-400 transition hover:text-zinc-800" aria-label="Dismiss notification">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}

const FOCUS_OPTIONS = ['vocabulary', 'reading', 'speaking', 'listening', 'writing', 'grammar', 'mixed'];
const DIFFICULTY_OPTIONS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function CommandPalette({ commands, onClose }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q) || (c.group || '').toLowerCase().includes(q));
  }, [search, commands]);

  useEffect(() => { setActiveIndex(0); }, [filtered]);

  const run = (cmd) => { onClose(); cmd.action(); };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(filtered.length - 1, i + 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1)); return; }
    if (e.key === 'Enter' && filtered[activeIndex]) { run(filtered[activeIndex]); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-center bg-black/20 pt-[15vh] backdrop-blur-[1px]" onClick={onClose}>
      <div className="h-fit w-full max-w-sm md:max-w-lg border border-zinc-900 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)]" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-zinc-200 px-4 py-3">
          <input ref={inputRef} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={onKeyDown} placeholder="Type a command…" className="w-full text-sm outline-none placeholder:text-zinc-400" />
        </div>
        <div className="max-h-72 overflow-auto">
          {filtered.length === 0 && <div className="px-4 py-6 text-center text-xs text-zinc-400">No matching commands</div>}
          {filtered.map((cmd, i) => (
            <button key={cmd.id} type="button" onClick={() => run(cmd)} className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition ${i === activeIndex ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-50'}`}>
              <span>{cmd.label}</span>
              {cmd.shortcut && <span className={`text-[10px] ${i === activeIndex ? 'text-zinc-400' : 'text-zinc-400'}`}>{cmd.shortcut}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LessonSettingsModal({ lesson, onClose, onSave }) {
  if (!lesson) return null;
  const settings = lesson.settings || {};
  const patch = (updates) => onSave({ ...lesson, ...updates });
  const patchSettings = (updates) => patch({ settings: { ...settings, ...updates } });

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black/30 p-4 backdrop-blur-[2px]">
      <button type="button" onClick={onClose} className="absolute inset-0" />
      <div className="relative mx-auto mt-6 max-w-3xl animate-soft-rise border border-zinc-900 bg-white sm:mt-12">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-400">Lesson Setup</div>
          <button type="button" onClick={onClose} className="border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-900">Done</button>
        </div>

        <div className="space-y-0">
          {/* Title — large, prominent like a document title */}
          <div className="px-6 pt-6">
            <AutoGrowField value={lesson.title || ''} onChange={(value) => patch({ title: value })} placeholder="Untitled Lesson" className="border-0 px-0 text-2xl font-semibold text-zinc-950 placeholder:text-zinc-300 focus:border-0 sm:text-3xl" />
          </div>

          {/* Topic + Grammar — inline compact fields */}
          <div className="grid gap-4 px-6 pt-2 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Topic</div>
              <AutoGrowField value={settings.lessonTopic || ''} onChange={(value) => patchSettings({ lessonTopic: value })} placeholder="e.g. Travel, Food, Daily Routines" />
            </div>
            <div>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Grammar Focus</div>
              <AutoGrowField value={settings.grammarTopic || ''} onChange={(value) => patchSettings({ grammarTopic: value })} placeholder="e.g. Present Simple, Conditionals" />
            </div>
          </div>

          {/* Description — large rich text area, like writing a post */}
          <div className="px-6 pt-4">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Description</div>
            <MarkdownComposer value={settings.description || ''} onChange={(value) => patchSettings({ description: value })} rows={8} />
            <div className="mt-1 text-[10px] text-zinc-400">Write a rich description for this lesson. Supports bold, lists, headings.</div>
          </div>

          {/* Focus + Difficulty — multi-select tag selectors */}
          <div className="grid gap-4 px-6 pt-5 sm:grid-cols-2">
            <div>
              <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Focus Areas <span className="normal-case tracking-normal text-zinc-300">(multi)</span></div>
              <div className="flex flex-wrap gap-1.5">
                {FOCUS_OPTIONS.map((opt) => {
                  const focusArr = Array.isArray(settings.focus) ? settings.focus : [];
                  const isActive = focusArr.includes(opt);
                  return (
                    <button key={opt} type="button" onClick={() => patchSettings({ focus: isActive ? focusArr.filter((f) => f !== opt) : [...focusArr, opt] })} className={isActive ? 'border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-medium capitalize text-white' : 'border border-zinc-200 px-3 py-1.5 text-xs capitalize text-zinc-600 transition hover:border-zinc-400'}>{opt}</button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Levels <span className="normal-case tracking-normal text-zinc-300">(multi)</span></div>
              <div className="flex flex-wrap gap-1.5">
                {DIFFICULTY_OPTIONS.map((opt) => {
                  const diffArr = Array.isArray(settings.difficulty) ? settings.difficulty : [];
                  const isActive = diffArr.includes(opt);
                  return (
                    <button key={opt} type="button" onClick={() => patchSettings({ difficulty: isActive ? diffArr.filter((d) => d !== opt) : [...diffArr, opt] })} className={isActive ? 'border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white' : 'border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:border-zinc-400'}>{opt}</button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Toggles — grouped by category */}
          <div className="space-y-4 px-6 pt-5">
            {/* General */}
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">General</div>
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-zinc-400">
                  <input type="checkbox" checked={settings.showHints !== false} onChange={(event) => patchSettings({ showHints: event.target.checked })} />
                  Show hints
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-zinc-400">
                  <input type="checkbox" checked={settings.showExplanations !== false} onChange={(event) => patchSettings({ showExplanations: event.target.checked })} />
                  Show explanations
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-zinc-400">
                  <input type="checkbox" checked={settings.allowSessionSave !== false} onChange={(event) => patchSettings({ allowSessionSave: event.target.checked })} />
                  Allow session saving
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-zinc-400">
                  <input type="checkbox" checked={settings.disableBackNavigation === true} onChange={(event) => patchSettings({ disableBackNavigation: event.target.checked })} />
                  Disable back button in player
                </label>
              </div>
            </div>
            {/* Homework */}
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Homework</div>
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-zinc-400">
                  <input type="checkbox" checked={Boolean(settings.showCheckButton)} onChange={(event) => patchSettings({ showCheckButton: event.target.checked })} />
                  Show check button
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-zinc-400">
                  <input type="checkbox" checked={Boolean(settings.allowRetryHomework)} onChange={(event) => patchSettings({ allowRetryHomework: event.target.checked })} />
                  Allow retry
                </label>
              </div>
            </div>
            {/* Grading */}
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Grading</div>
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-zinc-400">
                  <input type="checkbox" checked={settings.enableGrading !== false} onChange={(event) => patchSettings({ enableGrading: event.target.checked })} />
                  Enable grading in reports
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-zinc-400">
                  <input type="checkbox" checked={settings.showTotalGrade !== false} onChange={(event) => patchSettings({ showTotalGrade: event.target.checked })} />
                  Show total grade
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-zinc-400">
                  <input type="checkbox" checked={settings.showPerQuestionGrade !== false} onChange={(event) => patchSettings({ showPerQuestionGrade: event.target.checked })} />
                  Show per-question grade
                </label>
              </div>
            </div>
            {/* Live Mode */}
            <div>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Live Mode</div>
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-zinc-400">
                  <input type="checkbox" checked={settings.allowRetryLive === true} onChange={(event) => patchSettings({ allowRetryLive: event.target.checked })} />
                  Allow retries
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-zinc-400">
                  <input type="checkbox" checked={settings.showCheckButtonLive === true} onChange={(event) => patchSettings({ showCheckButtonLive: event.target.checked })} />
                  Show check button
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-zinc-400">
                  <input type="checkbox" checked={settings.lockAfterSubmitLive !== false} onChange={(event) => patchSettings({ lockAfterSubmitLive: event.target.checked })} />
                  One attempt per task
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-zinc-400">
                  <input type="checkbox" checked={settings.hideQuestionContentLive === true} onChange={(event) => patchSettings({ hideQuestionContentLive: event.target.checked })} />
                  Hide question text
                </label>
                <label className="inline-flex cursor-pointer items-center gap-2 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 transition hover:border-zinc-400">
                  <input type="checkbox" checked={settings.showLeaderboardEachQuestionLive === true} onChange={(event) => patchSettings({ showLeaderboardEachQuestionLive: event.target.checked })} />
                  Show leaderboard each question
                </label>
              </div>
            </div>
          </div>

          <div className="grid gap-4 px-6 pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Session time limit (minutes)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={settings.sessionTimeLimitMinutes || ''}
                onChange={(event) => patchSettings({ sessionTimeLimitMinutes: event.target.value ? Number(event.target.value) : null })}
                placeholder="No limit"
                className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Live auto-advance (seconds)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={settings.liveAutoAdvanceSeconds || ''}
                onChange={(event) => patchSettings({ liveAutoAdvanceSeconds: event.target.value ? Number(event.target.value) : null })}
                placeholder="Manual next"
                className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Live auto-advance policy</span>
              <select
                value={settings.liveAutoAdvancePolicy || 'timer'}
                onChange={(event) => patchSettings({ liveAutoAdvancePolicy: event.target.value })}
                className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
              >
                <option value="timer">Timer (seconds)</option>
                <option value="all_submitted">Advance when all submit</option>
                <option value="submission_threshold">Advance at submission threshold</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Live submission threshold (%)</span>
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                value={settings.liveAutoAdvanceSubmissionThreshold || ''}
                onChange={(event) => patchSettings({ liveAutoAdvanceSubmissionThreshold: event.target.value ? Number(event.target.value) : null })}
                disabled={(settings.liveAutoAdvancePolicy || 'timer') !== 'submission_threshold'}
                placeholder="70"
                className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Live auto mode limit (minutes)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={settings.liveAutoModeTimeLimitMinutes || ''}
                onChange={(event) => patchSettings({ liveAutoModeTimeLimitMinutes: event.target.value ? Number(event.target.value) : null })}
                placeholder="No limit"
                className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Live question deadline (seconds)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={settings.liveQuestionResponseDeadlineSeconds || ''}
                onChange={(event) => patchSettings({ liveQuestionResponseDeadlineSeconds: event.target.value ? Number(event.target.value) : null })}
                placeholder="No deadline"
                className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
              />
            </label>
          </div>

          <div className="px-6 pt-4">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Result Visibility Policy</div>
            <select
              value={settings.visibilityPolicy === 'full_answers' ? 'full_feedback' : (settings.visibilityPolicy || 'student_answers_only')}
              onChange={(event) => patchSettings({ visibilityPolicy: event.target.value })}
              className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
            >
              <option value="student_answers_only">Student answers only</option>
              <option value="correctness_only">Correctness only</option>
              <option value="show_correct_answers">Show correct answers</option>
              <option value="full_feedback">Full feedback</option>
              <option value="teacher_only">Teacher only (no results shown)</option>
            </select>
            <div className="mt-1 text-[10px] text-zinc-400">Controls what student-facing reports can reveal after submission.</div>
          </div>

          {/* Finish Page Customization */}
          <div className="px-6 pt-4">
            <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Finish Page</div>
            <label className="block space-y-1">
              <span className="text-[10px] text-zinc-400">Custom message (shown to student after finishing)</span>
              <textarea
                value={settings.finishPageMessage || ''}
                onChange={(event) => patchSettings({ finishPageMessage: event.target.value })}
                placeholder="e.g. Great job! Review your mistakes at home."
                rows={2}
                className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900 resize-y"
              />
            </label>
            <div className="mt-3 space-y-2">
              <div className="text-[10px] text-zinc-400">Sections visible to students</div>
              {[
                { key: 'score', label: 'Score circle & stats' },
                { key: 'takeaways', label: 'Key takeaways (strengths/weaknesses)' },
                { key: 'breakdown', label: 'Per-task breakdown' },
              ].map((section) => (
                <label key={section.key} className="flex items-center gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={(settings.finishPageSections || {})[section.key] !== false}
                    onChange={(event) => patchSettings({ finishPageSections: { ...(settings.finishPageSections || {}), [section.key]: event.target.checked } })}
                    className="h-4 w-4 border border-zinc-300 accent-zinc-900"
                  />
                  {section.label}
                </label>
              ))}
            </div>
          </div>

          {/* Theme Selector */}
          <div className="px-6 pt-5">
            <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Player Theme</div>
            {['light', 'dark'].map((group) => (
              <div key={group} className="mb-2">
                <div className="mb-1.5 text-[10px] text-zinc-400 capitalize">{group}</div>
                <div className="flex flex-wrap gap-2">
                  {LESSON_THEMES.filter((t) => t.group === group).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => patchSettings({ theme: t.id === 'classic' ? '' : t.id })}
                      className={`flex items-center gap-2 border px-3 py-2 text-xs transition ${(settings.theme || 'classic') === t.id ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 text-zinc-600 hover:border-zinc-400'}`}
                    >
                      <span
                        className="inline-block h-3.5 w-3.5 shrink-0 border border-zinc-300"
                        style={{ backgroundColor: t.swatch }}
                      />
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Font settings */}
          <div className="px-6 pt-5 pb-6">
            <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-400">Font Override <span className="normal-case tracking-normal text-zinc-300">(player)</span></div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <div className="mb-1.5 text-[10px] text-zinc-400">Family</div>
                <select value={settings.fontFamily || ''} onChange={(e) => patchSettings({ fontFamily: e.target.value })} className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
                  <option value="">Default</option>
                  <option value="system">System</option>
                  <option value="serif">Serif</option>
                  <option value="mono">Mono</option>
                  <option value="rounded">Rounded</option>
                  <option value="dyslexic">Dyslexia-friendly</option>
                  <option value="handwriting">Handwriting</option>
                </select>
              </div>
              <div>
                <div className="mb-1.5 text-[10px] text-zinc-400">Size</div>
                <div className="flex gap-1">
                  {[{ id: 'sm', label: 'S' }, { id: 'md', label: 'M' }, { id: 'lg', label: 'L' }, { id: 'xl', label: 'XL' }].map((s) => (
                    <button key={s.id} type="button" onClick={() => patchSettings({ fontSize: settings.fontSize === s.id ? '' : s.id })} className={`flex-1 py-1.5 text-center text-xs font-medium ${settings.fontSize === s.id ? 'border border-zinc-900 bg-zinc-900 text-white' : 'border border-zinc-200 text-zinc-600 hover:border-zinc-400'}`}>{s.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[10px] text-zinc-400">Line spacing</div>
                <div className="flex gap-1">
                  {[{ id: 'compact', label: 'Tight' }, { id: 'normal', label: 'Normal' }, { id: 'relaxed', label: 'Relaxed' }].map((l) => (
                    <button key={l.id} type="button" onClick={() => patchSettings({ lineHeight: settings.lineHeight === l.id ? '' : l.id })} className={`flex-1 py-1.5 text-center text-xs font-medium ${settings.lineHeight === l.id ? 'border border-zinc-900 bg-zinc-900 text-white' : 'border border-zinc-200 text-zinc-600 hover:border-zinc-400'}`}>{l.label}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Editor({ lesson, routeMode = 'builder', requestedOverlay = '', onNavigateMode, onNavigateOverlay, onSave, onSaveSilent, onPlay, onGoLive, onBack, onOpenGuide }) {
  const { sessions } = useAppContext();
  const inputRef = useRef(null);
  const dslInputRef = useRef(null);
  const autoSaveRef = useRef(null);
  const dslParseTimer = useRef(null);
  const menuButtonRef = useRef(null);
  const [mode, setMode] = useState(routeMode || 'builder');
  const editorModes = useMemo(() => ['dsl', 'builder', 'preview', 'grading', 'ai'], []);
  const initialState = useMemo(() => createStateFromLesson(lesson), [lesson]);
  // Combined history state — eliminates stale-closure bugs on fast edits
  const [hist, setHist] = useState(() => ({ entries: [initialState], index: 0 }));
  const [selectedBlockId, setSelectedBlockId] = useState(() => initialState.parsed.blocks[0]?.id || null);
  const [showHotkeys, setShowHotkeys] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 16 });
  const [showLessonSettings, setShowLessonSettings] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [templatePromptOpen, setTemplatePromptOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showQuizImport, setShowQuizImport] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [saveState, setSaveState] = useState({
    status: 'idle',
    label: 'idle',
    detail: 'No saves yet',
    lastLocalSavedAt: null,
    lastCloudSavedAt: null,
    lastAttemptAt: null,
    source: 'manual',
  });
  const toastTimerRef = useRef(new Map());
  const warningSignatureRef = useRef('');
  const saveErrorSignatureRef = useRef('');

  const dismissToast = useCallback((id) => {
    const timer = toastTimerRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimerRef.current.delete(id);
    }
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const pushToast = useCallback((toast) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current.slice(-3), { ...toast, id }]);
    const timer = setTimeout(() => {
      setToasts((current) => current.filter((entry) => entry.id !== id));
      toastTimerRef.current.delete(id);
    }, toast.duration ?? 4200);
    toastTimerRef.current.set(id, timer);
  }, []);

  useEffect(() => {
    const next = initialState;
    setHist({ entries: [next], index: 0 });
    setSelectedBlockId(next.parsed.blocks[0]?.id || null);
  }, [initialState]);

  useEffect(() => {
    setMode(routeMode || 'builder');
  }, [routeMode]);

  const current = hist.entries[hist.index] || hist.entries[hist.entries.length - 1] || createStateFromLesson(lesson);
  const parsed = current.parsed;
  const dsl = current.dsl;
  const allBlocks = useMemo(() => flattenBlocks(parsed.blocks || []), [parsed.blocks]);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Build current payload for auto-save
  const payloadRef = useRef(null);

  const buildPayload = useCallback(() => ({
    ...(lesson || {}),
    id: lesson?.id || crypto.randomUUID(),
    title: parsed.title,
    settings: parsed.settings,
    blocks: parsed.blocks,
    lesson: parsed.lesson,
    warnings: parsed.warnings,
    dsl,
  }), [lesson, parsed.title, parsed.settings, parsed.blocks, parsed.lesson, parsed.warnings, dsl]);

  // Keep payloadRef in sync
  useEffect(() => {
    payloadRef.current = buildPayload();
  });

  const performSave = useCallback((source = 'manual') => {
    if (!payloadRef.current) return Promise.resolve();

    const payload = payloadRef.current;
    setSaveState((currentValue) => ({
      ...currentValue,
      status: 'saving_local',
      label: source === 'auto' ? 'auto-save' : source === 'background' ? 'background-save' : 'saving',
      detail: source === 'auto' ? 'Saving local changes in background…' : 'Saving locally…',
      lastAttemptAt: Date.now(),
      source,
    }));

    const job = (async () => {
      try {
        const saveFn = (source === 'auto' || source === 'background') && onSaveSilent ? onSaveSilent : onSave;
        const saved = await Promise.resolve(saveFn(payload));
        const localSavedAt = saved?.updatedAt || Date.now();
        setSaveState((currentValue) => ({
          ...currentValue,
          status: 'syncing_cloud',
          label: 'syncing',
          detail: 'Saved locally, syncing cloud…',
          lastLocalSavedAt: localSavedAt,
        }));

        const cloudState = await syncLessonToCloud(saved || payload, { source });

        if (cloudState.state === 'synced') {
          setSaveState((currentValue) => ({
            ...currentValue,
            status: 'synced',
            label: 'saved',
            detail: 'Saved locally and to cloud',
            lastCloudSavedAt: cloudState.updatedAt || Date.now(),
            lastLocalSavedAt: currentValue.lastLocalSavedAt || localSavedAt,
          }));
          return;
        }

        if (cloudState.state === 'disabled') {
          setSaveState((currentValue) => ({
            ...currentValue,
            status: 'saved_local',
            label: 'saved',
            detail: 'Saved locally (cloud sync disabled)',
            lastLocalSavedAt: currentValue.lastLocalSavedAt || localSavedAt,
          }));
          return;
        }

        if (cloudState.state === 'unavailable') {
          setSaveState((currentValue) => ({
            ...currentValue,
            status: 'saved_local',
            label: 'saved-local',
            detail: 'Saved locally (cloud unavailable)',
            lastLocalSavedAt: currentValue.lastLocalSavedAt || localSavedAt,
          }));
          return;
        }

        setSaveState((currentValue) => ({
          ...currentValue,
          status: 'cloud_error',
          label: 'cloud-error',
          detail: cloudState.message || 'Saved locally, cloud sync failed',
          lastLocalSavedAt: currentValue.lastLocalSavedAt || localSavedAt,
        }));
      } catch (error) {
        setSaveState((currentValue) => ({
          ...currentValue,
          status: 'cloud_error',
          label: 'save-error',
          detail: error?.message || 'Save failed',
        }));
      }
    })();

    return job;
  }, [onSave, onSaveSilent]);

  // Auto-save: debounced save (configurable interval from settings)
  const scheduleAutoSave = () => {
    const appSettings = loadAppSettings();
    if (appSettings.autoSave === false) return;
    const delay = (appSettings.autoSaveInterval || 5) * 1000;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      void performSave('auto');
    }, delay);
  };

  // Save immediately (for visibility change / beforeunload)
  const saveNow = () => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    if (payloadRef.current) void performSave('background');
  };

  // Warn before closing tab with unsaved work + save on visibility change
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      saveNow();
      event.preventDefault();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') saveNow();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      if (dslParseTimer.current) clearTimeout(dslParseTimer.current);
    };
  }, [performSave]);

  useEffect(() => {
    return () => {
      toastTimerRef.current.forEach((timer) => clearTimeout(timer));
      toastTimerRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const warningCount = parsed.warnings?.length || 0;
    const firstWarning = warningCount > 0 ? parsed.warnings[0] : '';
    const signature = `${warningCount}:${firstWarning}`;
    if (warningCount > 0 && warningSignatureRef.current !== signature) {
      warningSignatureRef.current = signature;
      pushToast({
        tone: 'warning',
        title: `${warningCount} issue${warningCount > 1 ? 's' : ''}`,
        message: `${firstWarning}${warningCount > 1 ? ` (+${warningCount - 1} more)` : ''}`,
      });
    }
    if (warningCount === 0) {
      warningSignatureRef.current = '';
    }
  }, [parsed.warnings, pushToast]);

  useEffect(() => {
    if (saveState.status === 'cloud_error') {
      const signature = `${saveState.status}:${saveState.detail}`;
      if (saveErrorSignatureRef.current !== signature) {
        saveErrorSignatureRef.current = signature;
        pushToast({ tone: 'error', title: 'Save warning', message: saveState.detail || 'Cloud sync failed' });
      }
      return;
    }
    if (saveState.status === 'synced' && saveErrorSignatureRef.current) {
      saveErrorSignatureRef.current = '';
      pushToast({ tone: 'success', title: 'Synced', message: 'All lesson changes are now synced.' });
    }
  }, [pushToast, saveState.detail, saveState.status]);

  const commit = (nextDsl, nextParsed) => {
    setHist(({ entries, index }) => ({
      entries: (() => {
        const nextEntries = [...entries.slice(0, index + 1), { dsl: nextDsl, parsed: nextParsed }];
        if (nextEntries.length <= HISTORY_LIMIT) return nextEntries;
        return nextEntries.slice(nextEntries.length - HISTORY_LIMIT);
      })(),
      index: Math.min(HISTORY_LIMIT - 1, index + 1),
    }));
    const nextFlat = flattenBlocks(nextParsed.blocks || []);
    setSelectedBlockId((currentId) => currentId && nextFlat.some((block) => block.id === currentId) ? currentId : nextFlat[0]?.id || null);
    scheduleAutoSave();
  };

  const syncFromDsl = useCallback((nextDsl) => {
    clearTimeout(dslParseTimer.current);
    dslParseTimer.current = setTimeout(() => {
      const nextParsed = parseLesson(nextDsl, parsed.blocks);
      commit(nextDsl, nextParsed);
    }, 180);
  }, [parsed.blocks]);

  // Builder edits: generate DSL for persistence but keep original blocks
  // (avoids round-trip through parser which can corrupt IDs and dialogue text).
  const syncFromModel = (nextModel) => {
    const nextDsl = generateDSL(nextModel);
    const nextBlocks = nextModel.blocks || [];
    commit(nextDsl, {
      ...nextModel,
      lesson: {
        title: nextModel.title,
        slides: nextBlocks.filter((b) => b.type !== 'task' && b.type !== 'group'),
        tasks: nextBlocks.flatMap((b) => b.type === 'group' ? (b.children || []) : [b]).filter((b) => b.type === 'task'),
      },
    });
  };

  const undo = () => {
    setHist(({ entries, index }) => {
      const nextIndex = Math.max(0, index - 1);
      const nextState = entries[nextIndex];
      if (nextState) {
        const nextFlat = flattenBlocks(nextState.parsed.blocks || []);
        setSelectedBlockId((currentId) => currentId && nextFlat.some((block) => block.id === currentId) ? currentId : nextFlat[0]?.id || null);
      }
      return { entries, index: nextIndex };
    });
  };

  const redo = () => {
    setHist(({ entries, index }) => {
      const nextIndex = Math.min(entries.length - 1, index + 1);
      const nextState = entries[nextIndex];
      if (nextState) {
        const nextFlat = flattenBlocks(nextState.parsed.blocks || []);
        setSelectedBlockId((currentId) => currentId && nextFlat.some((block) => block.id === currentId) ? currentId : nextFlat[0]?.id || null);
      }
      return { entries, index: nextIndex };
    });
  };

  const syncTemplateMenuOpen = useCallback((nextOpen, nextMode = mode) => {
    setTemplateMenuOpen(nextOpen);
    if ((requestedOverlay === 'templates') !== nextOpen) {
      onNavigateOverlay?.(nextOpen ? 'templates' : '', nextMode, payloadRef.current || buildPayload());
    }
  }, [buildPayload, mode, onNavigateOverlay, requestedOverlay]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const isPrimary = event.ctrlKey || event.metaKey;
      if (isPrimary && key === '/') {
        event.preventDefault();
        if (isMobile) setShowHotkeys((currentValue) => !currentValue);
        return;
      }
      if (isPrimary && key === 'p') {
        event.preventDefault();
        setShowCommandPalette((v) => !v);
        return;
      }
      if (event.key === 'Escape') {
        if (focusMode) { setFocusMode(false); return; }
        setShowHotkeys(false);
        setMenuOpen(false);
        syncTemplateMenuOpen(false);
        setShowCommandPalette(false);
        return;
      }
      if (focusMode && !isPrimary && (key === 'arrowleft' || key === 'arrowup' || key === 'arrowright' || key === 'arrowdown')) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
        event.preventDefault();
        const ids = allBlocks.map((b) => b.id);
        const idx = ids.indexOf(selectedBlockId);
        if (key === 'arrowleft' || key === 'arrowup') {
          setSelectedBlockId(ids[Math.max(0, idx - 1)]);
        } else {
          setSelectedBlockId(ids[Math.min(ids.length - 1, idx + 1)]);
        }
        return;
      }
      if (isPrimary && !event.shiftKey && key === 'z') {
        event.preventDefault();
        undo();
        return;
      }
      if (isPrimary && ((event.shiftKey && key === 'z') || key === 'y')) {
        event.preventDefault();
        redo();
        return;
      }
      // J/K navigation for block list (builder mode, no modifier)
      if (!isPrimary && !event.shiftKey && mode === 'builder' && (key === 'j' || key === 'k')) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || document.activeElement?.isContentEditable) return;
        event.preventDefault();
        const ids = allBlocks.map((b) => b.id);
        const idx = ids.indexOf(selectedBlockId);
        if (key === 'j') setSelectedBlockId(ids[Math.min(ids.length - 1, idx + 1)]);
        else setSelectedBlockId(ids[Math.max(0, idx - 1)]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [allBlocks, focusMode, isMobile, mode, selectedBlockId, syncTemplateMenuOpen]);

  const handleAddBlock = (block) => {
    const nextModel = { ...parsed, blocks: [...parsed.blocks, block] };
    syncFromModel(nextModel);
    setSelectedBlockId(block.id);
  };

  const handleDeleteBlock = (blockId) => {
    const nextBlocks = deleteBlockFromTree(parsed.blocks, blockId);
    syncFromModel({ ...parsed, blocks: nextBlocks });
  };

  const payload = useMemo(() => buildPayload(), [buildPayload]);
  const setModeAndSync = useCallback((nextMode) => {
    if (mode === nextMode && routeMode === nextMode) return;
    setMode(nextMode);
    if (routeMode !== nextMode) {
      onNavigateMode?.(nextMode, payloadRef.current || buildPayload());
    }
  }, [buildPayload, mode, onNavigateMode, routeMode]);

  useEffect(() => {
    const shouldOpen = requestedOverlay === 'templates';
    setTemplateMenuOpen((currentValue) => (currentValue === shouldOpen ? currentValue : shouldOpen));
  }, [requestedOverlay]);

  useEffect(() => {
    if (!menuOpen || typeof window === 'undefined' || !menuButtonRef.current) return undefined;

    const updateMenuPosition = () => {
      const rect = menuButtonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({
        top: rect.bottom + 6,
        right: Math.max(window.innerWidth - rect.right, 12),
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [menuOpen]);

  const editorSessions = useMemo(() => {
    const lessonId = lesson?.id || null;
    const lessonTitle = parsed.title || '';
    return (sessions || []).filter((session) => {
      if (!session) return false;
      if (lessonId && session.lessonId && String(session.lessonId) === String(lessonId)) return true;
      if (lessonTitle && session.lessonTitle && String(session.lessonTitle) === String(lessonTitle)) return true;
      return false;
    });
  }, [sessions, lesson?.id, parsed.title]);

  const paletteCommands = useMemo(() => {
    const blockCommands = allBlocks.map((block, i) => ({
      id: `go-${block.id}`, label: `Go to: ${block.title || block.question || block.instruction || `Block ${i + 1}`}`, group: 'Navigate',
      action: () => { setSelectedBlockId(block.id); setModeAndSync('builder'); },
    }));
    const insertBlockCommand = (type, label) => ({
      id: `insert-${type}`,
      label,
      group: 'Insert',
      action: () => {
        const block = createDefaultBlock(type, { blank: true });
        syncFromModel({ ...parsed, blocks: [...(parsed.blocks || []), block] });
        setSelectedBlockId(block.id);
        setModeAndSync('builder');
      },
    });

    return [
      { id: 'undo', label: 'Undo', shortcut: 'Ctrl+Z', group: 'Edit', action: undo },
      { id: 'redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z', group: 'Edit', action: redo },
      { id: 'save', label: 'Save Lesson', shortcut: 'Ctrl+S', group: 'File', action: () => { void performSave('manual'); } },
      { id: 'play', label: 'Play Lesson', group: 'File', action: () => onPlay(payload) },
      { id: 'settings', label: 'Lesson Settings', group: 'Edit', action: () => setShowLessonSettings(true) },
      { id: 'mode-dsl', label: 'Switch to DSL Editor', group: 'Mode', action: () => setModeAndSync('dsl') },
      { id: 'mode-builder', label: 'Switch to Builder', group: 'Mode', action: () => setModeAndSync('builder') },
      { id: 'mode-preview', label: 'Switch to Preview', group: 'Mode', action: () => setModeAndSync('preview') },
      { id: 'mode-grading', label: 'Switch to Grading', group: 'Mode', action: () => setModeAndSync('grading') },
      { id: 'mode-ai', label: 'Switch to AI Generator', group: 'Mode', action: () => setModeAndSync('ai') },
      { id: 'focus-toggle', label: focusMode ? 'Exit Focus Mode' : 'Enter Focus Mode', group: 'View', action: () => setFocusMode((v) => !v) },
      { id: 'debug-toggle', label: showDebugPanel ? 'Hide Debug Panel' : 'Show Debug Panel', group: 'View', action: () => setShowDebugPanel((v) => !v) },
      { id: 'quick-add', label: 'Open Quick Add Palette', shortcut: 'Ctrl+K', group: 'Insert', action: () => setModeAndSync('builder') },
      insertBlockCommand('slide', 'Insert Intro Slide'),
      insertBlockCommand('multiple_choice', 'Insert Multiple Choice Task'),
      insertBlockCommand('group', 'Insert Group Container'),
      { id: 'export-json', label: 'Export JSON', group: 'File', action: () => exportLesson(payload) },
      { id: 'student-pdf', label: 'Print Student PDF', group: 'File', action: () => printStudentLesson(payload) },
      { id: 'teacher-pdf', label: 'Print Teacher PDF', group: 'File', action: () => printLessonReport(payload) },
      { id: 'save-template', label: 'Save as Template', group: 'File', action: () => setTemplatePromptOpen(true) },
      { id: 'ai-open', label: 'Open AI Generator', group: 'AI', action: () => setModeAndSync('ai') },
      { id: 'back', label: 'Back to Home', group: 'Navigation', action: onBack },
      ...blockCommands,
    ];
  }, [allBlocks, focusMode, onBack, parsed, payload, performSave, setModeAndSync, showDebugPanel]);

  const loadTemplate = (kind, customDsl = null) => {
    let next;
    if (customDsl) {
      next = { dsl: customDsl, parsed: parseLesson(customDsl) };
    } else {
      next = createStateFromLesson(createLessonTemplate(kind));
    }
    setHist({ entries: [next], index: 0 });
    setSelectedBlockId(next.parsed.blocks[0]?.id || null);
    setModeAndSync('builder');
    syncTemplateMenuOpen(false, 'builder');
  };

  return (
    <div className="kodak-canvas editor-shell flex h-screen flex-col overflow-hidden bg-[#f7f7f5]">
      {/* Top toolbar */}
      <header className="editor-topbar shrink-0 border-b border-zinc-200 bg-white">
        {focusMode ? (
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0 truncate text-sm font-semibold text-zinc-950">{parsed.title || 'Untitled Lesson'}</div>
              <div className="text-xs text-zinc-400">{(() => { const idx = allBlocks.findIndex((b) => b.id === selectedBlockId); return idx >= 0 ? `${idx + 1} / ${allBlocks.length}` : `${allBlocks.length} blocks`; })()}</div>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => { const ids = allBlocks.map((b) => b.id); const idx = ids.indexOf(selectedBlockId); if (idx > 0) setSelectedBlockId(ids[idx - 1]); }} className="border border-zinc-200 px-2 py-1.5 text-xs text-zinc-600 transition hover:border-zinc-900 disabled:opacity-30" disabled={allBlocks.findIndex((b) => b.id === selectedBlockId) <= 0} title="Previous block (←)">◂ Prev</button>
              <button type="button" onClick={() => { const ids = allBlocks.map((b) => b.id); const idx = ids.indexOf(selectedBlockId); if (idx < ids.length - 1) setSelectedBlockId(ids[idx + 1]); }} className="border border-zinc-200 px-2 py-1.5 text-xs text-zinc-600 transition hover:border-zinc-900 disabled:opacity-30" disabled={allBlocks.findIndex((b) => b.id === selectedBlockId) >= allBlocks.length - 1} title="Next block (→)">Next ▸</button>
              <button type="button" onClick={() => setFocusMode(false)} className="border border-zinc-900 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white" title="Exit focus mode (Esc)">⊡ Exit Focus</button>
            </div>
          </div>
        ) : (
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          {/* Left: Back + Title hero + Meta pills */}
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={onBack} className="hidden items-center gap-1 border border-zinc-200 px-2.5 py-2 text-sm text-zinc-700 transition hover:border-zinc-900 sm:flex">
              <BackIcon />
              <span className="hidden sm:inline">Back</span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <div className="min-w-0 truncate text-base font-semibold text-zinc-950 sm:max-w-[180px] sm:text-lg md:max-w-none">{parsed.title || 'Untitled Lesson'}</div>
                <button type="button" onClick={() => setShowLessonSettings(true)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-zinc-400 transition hover:text-zinc-900" aria-label="Lesson settings" title="Lesson settings">
                  <SettingsIcon />
                </button>
              </div>
              <div className="mt-0.5 hidden min-w-0 flex-wrap items-center gap-1.5 sm:flex">
                {!!parsed.settings?.lessonTopic && <span className="inline-block max-w-[200px] truncate bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">{parsed.settings.lessonTopic}</span>}
                {!!parsed.settings?.grammarTopic && <span className="inline-block max-w-[200px] truncate bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">{parsed.settings.grammarTopic}</span>}
                {!!parsed.settings?.focus && [].concat(parsed.settings.focus).filter(Boolean).map((f) => <span key={f} className="inline-block bg-zinc-100 px-2 py-0.5 text-[10px] font-medium capitalize text-zinc-500">{f}</span>)}
                {!!parsed.settings?.difficulty && [].concat(parsed.settings.difficulty).filter(Boolean).map((d) => <span key={d} className="inline-block border border-zinc-300 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700">{d}</span>)}
                <SaveStatusTag saveState={saveState} />
                <span className="inline-block border border-zinc-200 bg-white px-2 py-0.5 text-[10px] text-zinc-500">Local: {formatSaveTime(saveState.lastLocalSavedAt)}</span>
                <span className="inline-block border border-zinc-200 bg-white px-2 py-0.5 text-[10px] text-zinc-500">Cloud: {formatSaveTime(saveState.lastCloudSavedAt)}</span>
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex shrink-0 items-center gap-1 md:gap-1.5">
            {/* Mode switcher */}
            <div className="hidden border border-zinc-200 sm:flex" role="tablist" aria-label="Editor mode">
              {editorModes.map((entry) => (
                <button key={entry} type="button" role="tab" aria-selected={mode === entry} onClick={() => setModeAndSync(entry)} className={mode === entry ? 'editor-mode-btn border-r border-zinc-900 bg-zinc-900 px-2 py-1.5 text-xs font-medium text-white last:border-r-0 md:px-3' : 'editor-mode-btn border-r border-zinc-200 px-2 py-1.5 text-xs font-medium text-zinc-600 last:border-r-0 hover:bg-zinc-50 md:px-3'}>{entry === 'dsl' ? 'DSL' : entry === 'builder' ? 'Builder' : entry === 'preview' ? 'Preview' : entry === 'grading' ? 'Grading' : 'AI'}</button>
              ))}
            </div>

            {mode === 'builder' && selectedBlockId && (
              <button type="button" onClick={() => setFocusMode((v) => !v)} className={focusMode ? 'border border-zinc-900 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-white' : 'hidden border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-600 transition hover:border-zinc-900 sm:inline-flex'} title={focusMode ? 'Exit focus mode' : 'Focus on selected block'}>
                {focusMode ? '⊡ Exit Focus' : '⊡ Focus'}
              </button>
            )}

            {/* Mobile mode switcher — moved to bottom bar, hidden from header */}

            <div className="relative">
              <button type="button" onClick={() => syncTemplateMenuOpen(true)} className="editor-text-btn hidden border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-600 transition hover:border-zinc-900 md:inline-flex md:items-center md:gap-1">
                <TemplateIcon size={14} />
                Templates
              </button>
              {templateMenuOpen && (
                <TemplatePicker onSelect={loadTemplate} onClose={() => syncTemplateMenuOpen(false)} />
              )}
            </div>

            <IconButton title={mode === 'dsl' ? 'Open DSL templates' : 'Open guide'} onClick={() => {
              if (mode === 'dsl') {
                syncTemplateMenuOpen(true);
                return;
              }
              onOpenGuide?.();
            }}>
              <QuestionIcon />
            </IconButton>

            <div className="relative">
              <div ref={menuButtonRef}>
              <IconButton title="Import or export" onClick={() => setMenuOpen((v) => !v)}>
                <MenuIcon />
              </IconButton>
              </div>
              {menuOpen && typeof document !== 'undefined' && createPortal(
                <>
                  <button type="button" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-[55] cursor-default bg-transparent" aria-label="Close import and export menu" />
                  <div style={{ top: `${menuPosition.top}px`, right: `${menuPosition.right}px` }} className="app-menu-surface fixed z-[56] min-w-48 border border-zinc-200 bg-white shadow-[0_18px_48px_rgba(0,0,0,0.16)]">
                  <button type="button" onClick={() => { setShowQuizImport(true); setMenuOpen(false); }} className="flex w-full items-center gap-2 border-b border-zinc-100 px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50"><ClipboardIcon className="h-3.5 w-3.5 text-zinc-400" /> Import Quiz</button>
                  <button type="button" onClick={() => dslInputRef.current?.click()} className="block w-full border-b border-zinc-100 px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50">Import DSL</button>
                  <button type="button" onClick={() => inputRef.current?.click()} className="block w-full border-b border-zinc-100 px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50">Import JSON</button>
                  <button type="button" onClick={() => { exportLesson(payload); setMenuOpen(false); }} className="block w-full border-b border-zinc-100 px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50">Export JSON</button>
                  <button type="button" onClick={() => { printStudentLesson(payload); setMenuOpen(false); }} className="block w-full border-b border-zinc-100 px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50">Student PDF</button>
                  <button type="button" onClick={() => { printLessonReport(payload); setMenuOpen(false); }} className="block w-full border-b border-zinc-100 px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50">Teacher PDF</button>
                  <button type="button" onClick={() => { setTemplatePromptOpen(true); setMenuOpen(false); }} className="block w-full px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50">Save as Template</button>
                  </div>
                </>,
                document.body,
              )}
            </div>

            <IconButton title="Save lesson" onClick={() => { void performSave('manual'); }}>
              <SaveIcon />
            </IconButton>
            <IconButton title="Play lesson" onClick={() => onPlay(payload)} variant="primary">
              <PlayIcon />
            </IconButton>
            {onGoLive && (
              <button type="button" onClick={() => onGoLive(payload)} className="animate-live-pulse border border-red-600 bg-red-600 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-red-500" title="Start live quiz">
                Live
              </button>
            )}
          </div>
        </div>
        )}
      </header>

      {/* Hidden file inputs */}
      <input ref={inputRef} type="file" accept="application/json" className="hidden" onChange={async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const imported = await importLesson(file);
        const importedDsl = imported.dsl || generateDSL(imported);
        const next = { dsl: importedDsl, parsed: parseLesson(importedDsl) };
        setHist({ entries: [next], index: 0 });
        setSelectedBlockId(next.parsed.blocks[0]?.id || null);
        event.target.value = '';
        setMenuOpen(false);
      }} />
      <input ref={dslInputRef} type="file" accept=".txt,.md,.dsl,text/plain" className="hidden" onChange={async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const importedDsl = await importDsl(file);
        syncFromDsl(importedDsl);
        event.target.value = '';
        setMenuOpen(false);
      }} />

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* Main content area — full screen */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {mode === 'dsl' && (
          <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_340px]">
            <div className="flex min-h-0 flex-col border-r border-zinc-200 bg-white">
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfbf8_100%)] px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center border border-zinc-200 bg-white text-zinc-900">
                    <DslIcon size={16} />
                  </span>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-700">Lexor DSL Studio</div>
                    <div className="mt-1 text-[11px] text-zinc-500">Direct authoring mode with validation, trace tools, and structured fixes.</div>
                  </div>
                </div>
                <button type="button" onClick={() => loadTemplate('catalog')} className="inline-flex items-center gap-2 border border-zinc-200 bg-white px-3 py-2 text-[11px] font-medium text-zinc-700 hover:border-zinc-900 hover:bg-zinc-50">
                  <TemplateIcon size={14} />
                  All Types
                </button>
              </div>
              <div className="min-h-[34rem] min-h-0 flex-1">
                <Suspense fallback={<div className="flex h-full items-center justify-center bg-[#1e1e1e] text-sm text-zinc-400">Loading editor…</div>}>
                  <DslMonacoEditor value={dsl} onChange={syncFromDsl} onLoadTemplate={loadTemplate} />
                </Suspense>
              </div>
            </div>
            <aside className="hidden min-h-0 overflow-auto bg-[#fcfcfb] p-4 lg:block">
              <div className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Parsed blocks</div>
              <div className="space-y-1.5">
                {allBlocks.map((block, index) => (
                  <button key={block.id} type="button" onClick={() => { setSelectedBlockId(block.id); setModeAndSync('builder'); }} className="w-full border border-zinc-200 bg-white px-3 py-2 text-left transition hover:border-zinc-900">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400">{block.taskType || block.type}</div>
                    <div className="mt-0.5 text-xs font-medium text-zinc-800 truncate">{block.title || block.question || block.instruction || `Block ${index + 1}`}</div>
                  </button>
                ))}
              </div>
            </aside>
          </div>
        )}

        {mode === 'builder' && (
          <Suspense fallback={<div className="flex h-full items-center justify-center bg-white text-sm text-zinc-500">Loading builder…</div>}>
            <BuilderPanel
              lesson={focusMode && selectedBlockId ? { ...parsed, blocks: parsed.blocks.filter((b) => b.id === selectedBlockId || (b.children || []).some((c) => c.id === selectedBlockId)) } : parsed}
              selectedId={selectedBlockId}
              onSelect={setSelectedBlockId}
              onOpenGuide={onOpenGuide}
              onReplaceLesson={(next) => { syncFromModel(focusMode ? { ...parsed, blocks: parsed.blocks.map((b) => { const replacement = next.blocks.find((nb) => nb.id === b.id); return replacement || b; }) } : next); }}
              onAddBlock={handleAddBlock}
              onDeleteBlock={handleDeleteBlock}
            />
          </Suspense>
        )}

        {mode === 'preview' && (
          <div className="h-full overflow-auto bg-white p-3 sm:p-6">
            <div className="mx-auto max-w-4xl px-0 sm:px-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Full lesson preview</div>
                <div className="border border-zinc-200 px-2 py-1 text-[10px] text-zinc-500">{parsed.blocks.length} blocks</div>
              </div>
              <div className="space-y-5">
                {parsed.blocks.map((block) => <div key={block.id} className="overflow-x-auto"><Suspense fallback={<div className="border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">Loading…</div>}><BlockPreview block={block} /></Suspense></div>)}
              </div>
            </div>
          </div>
        )}

        {mode === 'grading' && (
          <div className="h-full overflow-auto bg-white">
            <Suspense fallback={<div className="flex h-full items-center justify-center bg-white text-sm text-zinc-500">Loading grading…</div>}>
              <GradingConsole
                sessions={editorSessions}
                onBack={() => setModeAndSync('builder')}
                initialLessonId={lesson?.id || null}
                initialLessonTitle={parsed.title || null}
                requireLessonSelection={false}
              />
            </Suspense>
          </div>
        )}

        {mode === 'ai' && (
          <div className="h-full overflow-auto bg-[#f7f7f5]">
            <Suspense fallback={<div className="flex h-full items-center justify-center bg-white text-sm text-zinc-500">Loading AI…</div>}>
              <AiPanel lessonContext={parsed} onInsertDsl={(generated) => {
                try {
                  const merged = mergeGeneratedDslIntoLesson({
                    title: parsed.title,
                    settings: parsed.settings,
                    blocks: parsed.blocks,
                    lesson: parsed.lesson,
                  }, generated);
                  syncFromDsl(merged.dsl);
                  pushToast({
                    tone: 'success',
                    title: 'AI blocks inserted',
                    message: `${merged.insertedBlockCount} block${merged.insertedBlockCount === 1 ? '' : 's'} added to the lesson.`,
                  });
                } catch (error) {
                  pushToast({
                    tone: 'error',
                    title: 'AI insert failed',
                    message: error?.message || 'The generated content could not be parsed into lesson blocks.',
                  });
                  return;
                }
                setModeAndSync('builder');
              }} />
            </Suspense>
          </div>
        )}
      </div>

      {/* Mobile bottom tab bar */}
      {!focusMode && (
        <nav className="shrink-0 border-t border-zinc-200 bg-white sm:hidden [padding-bottom:env(safe-area-inset-bottom)]" aria-label="Editor navigation">
          <div className="flex" role="tablist" aria-label="Editor mode (mobile)">
            <button type="button" onClick={onBack} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-zinc-500" aria-label="Back to lessons">
              <BackIcon />
              <span className="text-[10px]">Back</span>
            </button>
            {editorModes.map((entry) => (
              <button key={entry} type="button" role="tab" aria-selected={mode === entry} onClick={() => setModeAndSync(entry)} className={`flex flex-1 flex-col items-center gap-0.5 py-2 ${mode === entry ? 'text-zinc-900' : 'text-zinc-400'}`}>
                {entry === 'dsl' && <DslIcon />}
                {entry === 'builder' && <BuilderIcon />}
                {entry === 'preview' && <PreviewIcon />}
                {entry === 'grading' && <span className="text-xs font-bold">%</span>}
                {entry === 'ai' && <BrainIcon />}
                <span className="text-[10px] font-medium">{entry === 'dsl' ? 'DSL' : entry === 'builder' ? 'Build' : entry === 'preview' ? 'View' : entry === 'grading' ? 'Grade' : 'AI'}</span>
              </button>
            ))}
          </div>
        </nav>
      )}

      {isMobile && <HotkeysModal isOpen={showHotkeys} onClose={() => setShowHotkeys(false)} />}
      {showLessonSettings && <LessonSettingsModal lesson={parsed} onClose={() => setShowLessonSettings(false)} onSave={syncFromModel} />}
      {showCommandPalette && <CommandPalette commands={paletteCommands} onClose={() => setShowCommandPalette(false)} />}
      {showQuizImport && (
        <QuizImportModal
          onImport={(quizDsl) => {
            const combined = dsl.trim() ? `${dsl.trim()}\n\n${quizDsl}` : quizDsl;
            syncFromDsl(combined);
          }}
          onClose={() => setShowQuizImport(false)}
        />
      )}

      {/* State Debug Panel */}
      {showDebugPanel && (
        <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[40vh] overflow-auto border-t-2 border-amber-400 bg-zinc-950 text-xs text-zinc-300 shadow-2xl">
          <div className="sticky top-0 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-2">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-400">State Debug</span>
              <span className="text-zinc-500">History: {hist.entries.length} entries</span>
              <span className="text-zinc-500">Index: {hist.index}</span>
              <span className="text-zinc-500">Blocks: {parsed.blocks?.length || 0}</span>
              <span className="text-zinc-500">Mode: {mode}</span>
              <span className="text-zinc-500">Selected: {selectedBlockId || 'none'}</span>
            </div>
            <button type="button" onClick={() => setShowDebugPanel(false)} className="px-2 py-0.5 text-zinc-500 hover:text-white">✕</button>
          </div>
          <div className="grid grid-cols-3 gap-px bg-zinc-800">
            <div className="bg-zinc-950 p-3">
              <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400">Selected Block</div>
              <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-zinc-400">
                {selectedBlockId ? JSON.stringify(allBlocks.find((b) => b.id === selectedBlockId) || null, null, 2) : 'No selection'}
              </pre>
            </div>
            <div className="bg-zinc-950 p-3">
              <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-blue-400">Parsed Model</div>
              <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-zinc-400">
                {JSON.stringify({ title: parsed.title, settings: parsed.settings, blockCount: parsed.blocks?.length, warnings: parsed.warnings }, null, 2)}
              </pre>
            </div>
            <div className="bg-zinc-950 p-3">
              <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-purple-400">DSL Preview</div>
              <pre className="max-h-[30vh] overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-zinc-500">{dsl?.slice(0, 2000)}{dsl?.length > 2000 ? '\n…truncated' : ''}</pre>
            </div>
          </div>
        </div>
      )}

      <PromptModal
        open={templatePromptOpen}
        title="Save as Template"
        placeholder="Template name"
        defaultValue={parsed.title || 'My Template'}
        onConfirm={(name) => { addCustomTemplate(name, dsl); setTemplatePromptOpen(false); }}
        onCancel={() => setTemplatePromptOpen(false)}
      />
    </div>
  );
}
