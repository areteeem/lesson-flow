import { useEffect, useMemo, useRef, useState } from 'react';
import { exportLesson, exportSession, importLesson, printSessionReport } from '../storage';
import { generateDSL } from '../parser';
import { DotsVerticalIcon, ChevronRightIcon, ChevronDownIcon, FolderIcon, FolderOpenIcon, PlusIcon, CopyIcon, EditIcon, RefreshIcon } from './Icons';
import PromptModal from './PromptModal';
import { createLessonShareLink } from '../utils/lessonSharing';
import { createAssignmentLink, fetchAssignmentsForOwner, fetchAssignmentSubmissionsForOwner } from '../utils/lessonAssignments';

const SORT_OPTIONS = {
  last_opened: 'Last opened',
  date_created: 'Date created',
  name: 'Name',
};

const DEFAULT_ASSIGNMENT_CONFIG = {
  visibilityPolicy: 'student_answers_only',
  allowRetry: false,
  showCheckButton: false,
  enableGrading: true,
  showTotalGrade: true,
  showPerQuestionGrade: true,
  disableBackNavigation: false,
  sessionTimeLimitMinutes: '',
  maxAttempts: '1',
  retryCooldownSeconds: '',
  randomizeQuestions: false,
  randomizeOptions: false,
  lockOnTimeout: true,
  bindAttemptToDevice: false,
  suspiciousTabSwitchThreshold: '6',
  copyPasteRestricted: false,
  gracePeriodSeconds: '',
  dueAt: '',
};

function EmptyPlaybook({ title, detail, actions = [] }) {
  return (
    <div className="border border-dashed border-zinc-300 bg-white px-6 py-8 text-center">
      <div className="text-sm font-semibold text-zinc-800">{title}</div>
      <div className="mt-2 text-xs text-zinc-500">{detail}</div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {actions.map((action) => (
          <button key={action.label} type="button" onClick={action.onClick} className={action.primary ? 'inline-flex items-center gap-1 border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white' : 'inline-flex items-center gap-1 border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:border-zinc-900'}>
            {action.icon || null}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function toLocalDateTimeValue(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

function fromLocalDateTimeValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

// ─── Folder tree helpers ──────────────────────
function getAllDescendantIds(folder) {
  return [folder.id, ...(folder.children || []).flatMap(getAllDescendantIds)];
}

function normalizeVisibilityPolicy(policy) {
  const value = String(policy || '').trim();
  if (!value) return 'student_answers_only';
  if (value === 'full_answers') return 'full_feedback';
  return value;
}

function findFolder(folders, id) {
  for (const f of folders) {
    if (f.id === id) return f;
    const found = findFolder(f.children || [], id);
    if (found) return found;
  }
  return null;
}

function addFolder(folders, parentId, name) {
  const entry = { id: crypto.randomUUID(), name, children: [] };
  if (!parentId) return [...folders, entry];
  return folders.map((f) => f.id === parentId ? { ...f, children: [...(f.children || []), entry] } : { ...f, children: addFolder(f.children || [], parentId, name) });
}

function removeFolder(folders, id) {
  return folders.filter((f) => f.id !== id).map((f) => ({ ...f, children: removeFolder(f.children || [], id) }));
}

function renameFolderInTree(folders, id, name) {
  return folders.map((f) => f.id === id ? { ...f, name } : { ...f, children: renameFolderInTree(f.children || [], id, name) });
}

function folderPath(folders, id) {
  for (const f of folders) {
    if (f.id === id) return f.name;
    const sub = folderPath(f.children || [], id);
    if (sub) return `${f.name} / ${sub}`;
  }
  return null;
}

function previewText(lesson) {
  if (lesson.dsl) {
    return lesson.dsl.split('\n').find((line) => !line.startsWith('#') && !line.startsWith('Title:') && line.trim()) || 'Interactive lesson';
  }
  return generateDSL(lesson).split('\n').find((line) => !line.startsWith('#') && !line.startsWith('Title:') && line.trim()) || 'Interactive lesson';
}

function SessionPreviewModal({ session, onClose, onDelete }) {
  if (!session) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/30 p-4">
      <button type="button" onClick={onClose} className="absolute inset-0" />
      <div className="relative mx-auto max-w-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Recent Session</div>
            <div className="mt-1 text-xl font-semibold text-zinc-950">{session.lessonTitle}</div>
            <div className="mt-2 text-sm text-zinc-600">{session.studentName || 'Unknown student'} | {new Date(session.timestamp).toLocaleString()} | {session.score}%</div>
          </div>
          <button type="button" onClick={onClose} className="border border-zinc-200 px-3 py-2 text-xs text-zinc-700">Close</button>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Score</div>
            <div className="mt-1 text-lg font-semibold text-zinc-950">{session.score}%</div>
          </div>
          <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Correct</div>
            <div className="mt-1 text-lg font-semibold text-zinc-950">{session.correctCount ?? '-'}</div>
          </div>
          <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Reviewed</div>
            <div className="mt-1 text-lg font-semibold text-zinc-950">{session.completedCount ?? '-'}</div>
          </div>
          <div className="border border-zinc-200 bg-zinc-50 px-3 py-3">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Graded</div>
            <div className="mt-1 text-lg font-semibold text-zinc-950">{session.total ?? '-'}</div>
          </div>
        </div>
        <div className="mt-5 border border-zinc-200 bg-zinc-50 p-4 text-sm leading-7 text-zinc-700 whitespace-pre-wrap">{session.lessonPreview || 'No saved lesson preview for this session.'}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => exportSession(session)} className="border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700">Export JSON</button>
          <button type="button" onClick={() => printSessionReport(session)} className="border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700">Print Report</button>
          {onDelete && <button type="button" onClick={() => { onDelete(session.id); onClose(); }} className="border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50">Delete Session</button>}
        </div>
      </div>
    </div>
  );
}

function LessonCardMenu({ lesson, onClose, onDuplicate, onExport, onRename, onMoveToFolder, onShare, onAssignments, onPractice, onDelete }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  const items = [
    { label: 'Duplicate', action: () => { onDuplicate(lesson); onClose(); } },
    { label: 'Start practice mode', action: () => { onPractice(lesson); onClose(); } },
    { label: 'Assignment center', action: () => { onAssignments(lesson); onClose(); } },
    { label: 'Create share link', action: () => { onShare(lesson); onClose(); } },
    { label: 'Export JSON', action: () => { onExport(lesson); onClose(); } },
    { label: 'Rename', action: () => { onRename(lesson); onClose(); } },
    { label: 'Move to folder', action: () => { onMoveToFolder(lesson); onClose(); } },
    { label: 'Delete', action: () => { onDelete(lesson.id); onClose(); }, danger: true },
  ];
  return (
    <div ref={ref} className="absolute top-8 right-0 z-30 w-44 border border-zinc-200 bg-white py-1 shadow-lg">
      {items.map((item) => (
        <button key={item.label} type="button" onClick={item.action} className={`w-full px-3 py-2 text-left text-xs ${item.danger ? 'text-red-600 hover:bg-red-50' : 'text-zinc-700 hover:bg-zinc-50'}`}>{item.label}</button>
      ))}
    </div>
  );
}

function RenameModal({ lesson, onSave, onClose }) {
  const [name, setName] = useState(lesson?.title || '');
  if (!lesson) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm border border-zinc-200 bg-white p-5">
        <div className="text-sm font-semibold text-zinc-900">Rename Lesson</div>
        <input value={name} onChange={(e) => setName(e.target.value)} className="mt-3 w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900" autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) { onSave(lesson, name.trim()); } }} />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600">Cancel</button>
          <button type="button" onClick={() => name.trim() && onSave(lesson, name.trim())} disabled={!name.trim()} className="border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-40">Save</button>
        </div>
      </div>
    </div>
  );
}

function MoveFolderModal({ lesson, folders, onSave, onClose }) {
  const [selected, setSelected] = useState(lesson?.folder || null);
  if (!lesson) return null;
  function renderOptions(nodes, depth = 0) {
    return nodes.map((f) => (
      <div key={f.id}>
        <button type="button" onClick={() => setSelected(f.id)} className={`w-full text-left text-xs py-1.5 ${selected === f.id ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`} style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: 12 }}>
          {f.name}
        </button>
        {f.children?.length > 0 && renderOptions(f.children, depth + 1)}
      </div>
    ));
  }
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm border border-zinc-200 bg-white p-5">
        <div className="text-sm font-semibold text-zinc-900">Move to Folder</div>
        <div className="mt-3 max-h-60 overflow-auto border border-zinc-200">
          <button type="button" onClick={() => setSelected(null)} className={`w-full px-3 py-1.5 text-left text-xs ${selected === null ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>
            / Root (no folder)
          </button>
          {renderOptions(folders)}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600">Cancel</button>
          <button type="button" onClick={() => onSave(lesson, selected)} className="border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs text-white">Move</button>
        </div>
      </div>
    </div>
  );
}

function ShareLessonModal({ lesson, shareState, onClose, onCreateLink, onCopyLink }) {
  if (!lesson) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-lg border border-zinc-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Share lesson</div>
            <div className="mt-1 text-base font-semibold text-zinc-950">{lesson.title || 'Untitled lesson'}</div>
          </div>
          <button type="button" onClick={onClose} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700">Close</button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="text-xs text-zinc-600">Create a read-only public preview link. Anyone with the link can open preview and make their own copy.</div>

          <button
            type="button"
            onClick={() => onCreateLink(lesson)}
            disabled={shareState.loading}
            className="border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
          >
            {shareState.loading ? 'Creating link…' : 'Create / refresh share link'}
          </button>

          {shareState.error && (
            <div className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {shareState.error}
            </div>
          )}

          {shareState.link && (
            <div className="space-y-2">
              <label className="block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Share link</label>
              <input
                readOnly
                value={shareState.link}
                className="w-full border border-zinc-200 px-3 py-2 text-xs text-zinc-700 outline-none"
              />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onCopyLink(shareState.link)} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:border-zinc-900">Copy link</button>
                {shareState.copied && <span className="text-[11px] text-emerald-700">Copied</span>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AssignmentCenterModal({
  open,
  lessons,
  assignments,
  submissionsByAssignment,
  selectedLessonId,
  assignmentConfig,
  saving,
  loading,
  error,
  success,
  latestLink,
  copied,
  expandedAssignmentId,
  onClose,
  onRefresh,
  onSelectedLessonChange,
  onConfigChange,
  onSaveAssignment,
  onEditAssignment,
  onCopyLink,
  onToggleExpandedAssignment,
  onOpenGrading,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 p-3 sm:p-5">
      <button type="button" onClick={onClose} className="absolute inset-0" aria-label="Close assignment center" />
      <div className="relative mx-auto max-h-[92vh] w-full max-w-6xl overflow-auto border border-zinc-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Assignment center</div>
            <div className="mt-1 text-lg font-semibold text-zinc-950">Create and manage homework links</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-1 border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:border-zinc-900 disabled:opacity-60">
              <RefreshIcon />
              Refresh
            </button>
            <button type="button" onClick={onClose} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:border-zinc-900">Close</button>
          </div>
        </div>

        <section className="border border-zinc-200 bg-zinc-50 p-3 sm:p-4">
          <div className="mb-3 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">Assignment settings</div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Lesson</span>
              <select value={selectedLessonId} onChange={(event) => onSelectedLessonChange(event.target.value)} className="w-full border border-zinc-200 px-2 py-2 text-xs outline-none focus:border-zinc-900">
                <option value="">Select lesson</option>
                {lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>{lesson.title || 'Untitled lesson'}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Due date/time window</span>
              <input
                type="datetime-local"
                value={assignmentConfig.dueAt}
                onChange={(event) => onConfigChange((current) => ({ ...current, dueAt: event.target.value }))}
                className="w-full border border-zinc-200 px-2 py-2 text-xs outline-none focus:border-zinc-900"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Answer visibility</span>
              <select
                value={assignmentConfig.visibilityPolicy}
                onChange={(event) => onConfigChange((current) => ({ ...current, visibilityPolicy: event.target.value }))}
                className="w-full border border-zinc-200 px-2 py-2 text-xs outline-none focus:border-zinc-900"
              >
                <option value="correctness_only">Correct/incorrect only</option>
                <option value="show_correct_answers">Show correct answers</option>
                <option value="student_answers_only">Show student answers only</option>
                <option value="full_feedback">Show full feedback</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Homework retries</span>
              <select
                value={assignmentConfig.allowRetry ? 'enabled' : 'disabled'}
                onChange={(event) => onConfigChange((current) => ({ ...current, allowRetry: event.target.value === 'enabled' }))}
                className="w-full border border-zinc-200 px-2 py-2 text-xs outline-none focus:border-zinc-900"
              >
                <option value="disabled">Disabled</option>
                <option value="enabled">Enabled</option>
              </select>
            </label>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="inline-flex items-center gap-2 text-xs text-zinc-700"><input type="checkbox" checked={assignmentConfig.enableGrading} onChange={(event) => onConfigChange((current) => ({ ...current, enableGrading: event.target.checked }))} />Enable grading</label>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-700"><input type="checkbox" checked={assignmentConfig.showTotalGrade} onChange={(event) => onConfigChange((current) => ({ ...current, showTotalGrade: event.target.checked }))} />Show total grade</label>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-700"><input type="checkbox" checked={assignmentConfig.showPerQuestionGrade} onChange={(event) => onConfigChange((current) => ({ ...current, showPerQuestionGrade: event.target.checked }))} />Show per-question grade</label>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-700"><input type="checkbox" checked={assignmentConfig.showCheckButton} onChange={(event) => onConfigChange((current) => ({ ...current, showCheckButton: event.target.checked }))} />Show check button</label>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-700"><input type="checkbox" checked={assignmentConfig.disableBackNavigation} onChange={(event) => onConfigChange((current) => ({ ...current, disableBackNavigation: event.target.checked }))} />Disable back button</label>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-700"><input type="checkbox" checked={assignmentConfig.randomizeQuestions} onChange={(event) => onConfigChange((current) => ({ ...current, randomizeQuestions: event.target.checked }))} />Randomize questions</label>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-700"><input type="checkbox" checked={assignmentConfig.randomizeOptions} onChange={(event) => onConfigChange((current) => ({ ...current, randomizeOptions: event.target.checked }))} />Randomize options</label>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-700"><input type="checkbox" checked={assignmentConfig.lockOnTimeout} onChange={(event) => onConfigChange((current) => ({ ...current, lockOnTimeout: event.target.checked }))} />Lock on timeout</label>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-700"><input type="checkbox" checked={assignmentConfig.bindAttemptToDevice} onChange={(event) => onConfigChange((current) => ({ ...current, bindAttemptToDevice: event.target.checked }))} />Bind attempts to device</label>
            <label className="inline-flex items-center gap-2 text-xs text-zinc-700"><input type="checkbox" checked={assignmentConfig.copyPasteRestricted} onChange={(event) => onConfigChange((current) => ({ ...current, copyPasteRestricted: event.target.checked }))} />Restrict copy/paste</label>
            <label className="space-y-1 text-xs text-zinc-700">
              <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Time limit (minutes)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={assignmentConfig.sessionTimeLimitMinutes}
                onChange={(event) => onConfigChange((current) => ({ ...current, sessionTimeLimitMinutes: event.target.value }))}
                placeholder="None"
                className="w-full border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-900"
              />
            </label>
            <label className="space-y-1 text-xs text-zinc-700">
              <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Max attempts</span>
              <input
                type="number"
                min={1}
                step={1}
                value={assignmentConfig.maxAttempts}
                onChange={(event) => onConfigChange((current) => ({ ...current, maxAttempts: event.target.value }))}
                placeholder="1"
                className="w-full border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-900"
              />
            </label>
            <label className="space-y-1 text-xs text-zinc-700">
              <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Retry cooldown (seconds)</span>
              <input
                type="number"
                min={0}
                step={5}
                value={assignmentConfig.retryCooldownSeconds}
                onChange={(event) => onConfigChange((current) => ({ ...current, retryCooldownSeconds: event.target.value }))}
                placeholder="0"
                className="w-full border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-900"
              />
            </label>
            <label className="space-y-1 text-xs text-zinc-700">
              <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Tab-switch warning threshold</span>
              <input
                type="number"
                min={1}
                step={1}
                value={assignmentConfig.suspiciousTabSwitchThreshold}
                onChange={(event) => onConfigChange((current) => ({ ...current, suspiciousTabSwitchThreshold: event.target.value }))}
                placeholder="6"
                className="w-full border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-900"
              />
            </label>
            <label className="space-y-1 text-xs text-zinc-700">
              <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Deadline grace period (seconds)</span>
              <input
                type="number"
                min={0}
                step={5}
                value={assignmentConfig.gracePeriodSeconds}
                onChange={(event) => onConfigChange((current) => ({ ...current, gracePeriodSeconds: event.target.value }))}
                placeholder="0"
                className="w-full border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-zinc-900"
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={onSaveAssignment} disabled={saving || !selectedLessonId} className="border border-zinc-900 bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">
              {saving ? 'Saving assignment…' : 'Create / update assignment'}
            </button>
            {latestLink && (
              <button type="button" onClick={() => onCopyLink(latestLink)} className="inline-flex items-center gap-1 border border-zinc-200 px-3 py-2 text-xs text-zinc-700 hover:border-zinc-900">
                <CopyIcon />
                Copy latest link
              </button>
            )}
            {copied && <span className="text-[11px] text-emerald-700">Copied</span>}
          </div>
          {latestLink && <input readOnly value={latestLink} className="mt-2 w-full border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-700" />}
          {error && <div className="mt-2 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
          {success && <div className="mt-2 border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</div>}
        </section>

        <section className="mt-4 border border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Assignments ({assignments.length})</div>
          <div className="divide-y divide-zinc-200">
            {assignments.map((assignment) => {
              const assignmentSubmissions = submissionsByAssignment.get(assignment.assignmentId) || [];
              const expanded = expandedAssignmentId === assignment.assignmentId;
              return (
                <div key={assignment.assignmentId} className="px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-zinc-900">{assignment.lessonTitle}</div>
                      <div className="mt-1 text-[11px] text-zinc-500">
                        {assignment.expiresAt ? `Due ${new Date(assignment.expiresAt).toLocaleString()}` : 'No due date'} · {assignmentSubmissions.length} submission{assignmentSubmissions.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => onEditAssignment(assignment)} className="inline-flex items-center gap-1 border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:border-zinc-900"><EditIcon />Edit</button>
                      <button type="button" onClick={() => onCopyLink(assignment.assignmentUrl)} className="inline-flex items-center gap-1 border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:border-zinc-900"><CopyIcon />Copy link</button>
                      <button type="button" onClick={() => onToggleExpandedAssignment(assignment.assignmentId)} className="border border-zinc-200 px-2 py-1 text-xs text-zinc-700 hover:border-zinc-900">{expanded ? 'Hide submissions' : 'View submissions'}</button>
                    </div>
                  </div>
                  {expanded && (
                    <div className="mt-2 space-y-1 border border-zinc-200 bg-zinc-50 p-2">
                      {assignmentSubmissions.length === 0 && (
                        <div className="text-xs text-zinc-500">No submissions yet. Share the link and ask students to complete this assignment.</div>
                      )}
                      {assignmentSubmissions.map((submission) => (
                        <div key={submission.submissionId} className="flex flex-wrap items-center justify-between gap-2 border border-zinc-200 bg-white px-2 py-1.5 text-xs">
                          <div className="text-zinc-700">{submission.studentName}</div>
                          <div className="text-zinc-500">{new Date(submission.timestamp).toLocaleString()}</div>
                          <div className="font-medium text-zinc-700">{submission.score}%</div>
                          <div className="text-zinc-500">{submission.submissionState || 'awaiting_review'}</div>
                          {onOpenGrading && (
                            <button type="button" onClick={() => onOpenGrading(submission)} className="border border-zinc-200 px-2 py-1 text-[10px] text-zinc-700 hover:border-zinc-900">Grade</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {assignments.length === 0 && (
              <div className="px-3 py-6">
                <EmptyPlaybook
                  title="No assignments yet"
                  detail="Select a lesson, configure policy controls, and create your first assignment link."
                  actions={[]}
                />
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function FolderNode({ folder, depth, selectedFolder, onSelectFolder, onAdd, onRename, onRemove, lessonCounts }) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(folder.name);
  const hasChildren = folder.children?.length > 0;
  const count = lessonCounts[folder.id] || 0;
  const isSelected = selectedFolder === folder.id;

  return (
    <li role="treeitem" aria-expanded={hasChildren ? expanded : undefined} aria-selected={isSelected}>
      <div className={`group flex items-center gap-0.5 ${isSelected ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`} style={{ paddingLeft: `${depth * 14}px` }}>
        <button type="button" onClick={() => hasChildren && setExpanded(!expanded)} className="shrink-0 p-0.5" aria-label={hasChildren ? (expanded ? 'Collapse folder' : 'Expand folder') : undefined} tabIndex={hasChildren ? 0 : -1}>
          {hasChildren ? (expanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />) : <span className="inline-block w-3" />}
        </button>
        {editing ? (
          <input value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 bg-white px-1 py-0.5 text-xs text-zinc-900 outline-none" autoFocus onBlur={() => { if (editName.trim()) onRename(folder.id, editName.trim()); setEditing(false); }} onKeyDown={(e) => { if (e.key === 'Enter' && editName.trim()) { onRename(folder.id, editName.trim()); setEditing(false); } if (e.key === 'Escape') setEditing(false); }} />
        ) : (
          <button type="button" onClick={() => onSelectFolder(folder.id)} onDoubleClick={() => { setEditing(true); setEditName(folder.name); }} className="flex-1 py-1 text-left text-xs truncate">
            {folder.name}
          </button>
        )}
        <span className="shrink-0 pr-1 text-[9px] opacity-60">{count}</span>
        <button type="button" onClick={() => onAdd(folder.id)} className="shrink-0 p-0.5 opacity-0 group-hover:opacity-100" title="Add subfolder" aria-label={`Add subfolder to ${folder.name}`}><PlusIcon size={10} /></button>
        <button type="button" onClick={() => onRemove(folder.id)} className="shrink-0 p-0.5 text-red-500 opacity-0 group-hover:opacity-100" title="Delete folder" aria-label={`Delete folder ${folder.name}`}>×</button>
      </div>
      {expanded && hasChildren && (
        <ul role="group">
          {folder.children.map((child) => (
            <FolderNode key={child.id} folder={child} depth={depth + 1} selectedFolder={selectedFolder} onSelectFolder={onSelectFolder} onAdd={onAdd} onRename={onRename} onRemove={onRemove} lessonCounts={lessonCounts} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function RecentLessons({ lessons, sessions, onCreate, onSelect, onPractice, onDelete, onDeleteSession, onImport, onSave, folders = [], onSaveFolders }) {
  const inputRef = useRef(null);
  const mainRef = useRef(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [menuLessonId, setMenuLessonId] = useState(null);
  const [renamingLesson, setRenamingLesson] = useState(null);
  const [movingLesson, setMovingLesson] = useState(null);
  const [shareLesson, setShareLesson] = useState(null);
  const [shareState, setShareState] = useState({ loading: false, error: '', link: '', copied: false });
  const [assignmentCenterOpen, setAssignmentCenterOpen] = useState(false);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState('');
  const [assignmentSuccess, setAssignmentSuccess] = useState('');
  const [assignmentLink, setAssignmentLink] = useState('');
  const [assignmentLinkCopied, setAssignmentLinkCopied] = useState(false);
  const [selectedAssignmentLessonId, setSelectedAssignmentLessonId] = useState('');
  const [assignmentConfig, setAssignmentConfig] = useState(DEFAULT_ASSIGNMENT_CONFIG);
  const [ownerAssignments, setOwnerAssignments] = useState([]);
  const [ownerAssignmentSubmissions, setOwnerAssignmentSubmissions] = useState([]);
  const [expandedAssignmentId, setExpandedAssignmentId] = useState('');
  const [folderPromptParent, setFolderPromptParent] = useState(null);
  const [sortBy, setSortBy] = useState(() => {
    try {
      return localStorage.getItem('lf_lessons_sort') || 'last_opened';
    } catch {
      return 'last_opened';
    }
  });
  const [createTemplate, setCreateTemplate] = useState(null);
  const [renderCount, setRenderCount] = useState(48);
  const [recentSidebarOpen, setRecentSidebarOpen] = useState(true);

  useEffect(() => {
    try {
      localStorage.setItem('lf_lessons_sort', sortBy);
    } catch {
      // Ignore storage failures.
    }
  }, [sortBy]);

  const handleDuplicate = (lesson) => {
    const copy = { ...lesson, id: crypto.randomUUID(), title: `${lesson.title || 'Untitled'} (Copy)`, createdAt: Date.now(), updatedAt: Date.now() };
    onSave(copy);
  };

  const handleRename = (lesson, newTitle) => {
    onSave({ ...lesson, title: newTitle });
    setRenamingLesson(null);
  };

  const handleMoveToFolder = (lesson, folderId) => {
    onSave({ ...lesson, folder: folderId });
    setMovingLesson(null);
  };

  const handleCreateShareLink = async (lesson) => {
    setShareState((prev) => ({ ...prev, loading: true, error: '', copied: false }));
    const result = await createLessonShareLink(lesson);
    if (!result.ok) {
      const reason = result.reason === 'auth_required'
        ? 'Sign in with a teacher account in Settings to create share links.'
        : result.reason || 'Failed to create share link.';
      setShareState((prev) => ({ ...prev, loading: false, error: reason }));
      return;
    }
    setShareState((prev) => ({ ...prev, loading: false, error: '', link: result.shareUrl || '', copied: false }));
  };

  const handleCopyShareLink = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setShareState((prev) => ({ ...prev, copied: true }));
      setTimeout(() => {
        setShareState((prev) => ({ ...prev, copied: false }));
      }, 1400);
    } catch {
      setShareState((prev) => ({ ...prev, error: 'Clipboard access denied. Copy link manually from the field.' }));
    }
  };

  const submissionsByAssignment = useMemo(() => {
    const map = new Map();
    ownerAssignmentSubmissions.forEach((submission) => {
      const key = String(submission.assignmentId || '').trim();
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(submission);
    });
    map.forEach((items) => items.sort((left, right) => right.timestamp - left.timestamp));
    return map;
  }, [ownerAssignmentSubmissions]);

  const hydrateAssignmentConfigFromLesson = (lesson) => {
    const settings = lesson?.settings || {};
    return {
      visibilityPolicy: normalizeVisibilityPolicy(settings.visibilityPolicy || 'student_answers_only'),
      allowRetry: Boolean(settings.allowRetryHomework),
      showCheckButton: Boolean(settings.showCheckButton),
      enableGrading: settings.enableGrading !== false,
      showTotalGrade: settings.showTotalGrade !== false,
      showPerQuestionGrade: settings.showPerQuestionGrade !== false,
      disableBackNavigation: settings.disableBackNavigation === true,
      sessionTimeLimitMinutes: settings.sessionTimeLimitMinutes ? String(settings.sessionTimeLimitMinutes) : '',
      maxAttempts: settings.maxAttempts ? String(settings.maxAttempts) : '1',
      retryCooldownSeconds: settings.retryCooldownSeconds ? String(settings.retryCooldownSeconds) : '',
      randomizeQuestions: settings.randomizeQuestions === true,
      randomizeOptions: settings.randomizeOptions === true,
      lockOnTimeout: settings.lockOnTimeout !== false,
      bindAttemptToDevice: settings.bindAttemptToDevice === true,
      suspiciousTabSwitchThreshold: settings.suspiciousTabSwitchThreshold ? String(settings.suspiciousTabSwitchThreshold) : '6',
      copyPasteRestricted: settings.copyPasteRestricted === true,
      gracePeriodSeconds: settings.gracePeriodSeconds ? String(settings.gracePeriodSeconds) : '',
      dueAt: '',
    };
  };

  const refreshAssignmentCenter = async () => {
    setAssignmentLoading(true);
    setAssignmentError('');

    const [assignmentsResult, submissionsResult] = await Promise.all([
      fetchAssignmentsForOwner({ limit: 300 }),
      fetchAssignmentSubmissionsForOwner({ limit: 500 }),
    ]);

    setAssignmentLoading(false);

    if (!assignmentsResult.ok && !submissionsResult.ok) {
      setAssignmentError(assignmentsResult.reason || submissionsResult.reason || 'Failed to load assignment center data.');
      setOwnerAssignments([]);
      setOwnerAssignmentSubmissions([]);
      return;
    }

    setOwnerAssignments(assignmentsResult.ok ? (assignmentsResult.assignments || []) : []);
    setOwnerAssignmentSubmissions(submissionsResult.ok ? (submissionsResult.sessions || []) : []);
  };

  const openAssignmentCenter = async (lesson = null) => {
    const targetLessonId = String(lesson?.id || '').trim() || String(lessons?.[0]?.id || '').trim();
    setAssignmentCenterOpen(true);
    setSelectedAssignmentLessonId(targetLessonId);
    setAssignmentConfig(lesson ? hydrateAssignmentConfigFromLesson(lesson) : DEFAULT_ASSIGNMENT_CONFIG);
    setAssignmentError('');
    setAssignmentSuccess('');
    setAssignmentLink('');
    setAssignmentLinkCopied(false);
    setExpandedAssignmentId('');
    await refreshAssignmentCenter();
  };

  const handleSaveAssignmentFromCenter = async () => {
    const lesson = lessons.find((entry) => String(entry.id) === String(selectedAssignmentLessonId));
    if (!lesson) {
      setAssignmentError('Pick a lesson before creating an assignment.');
      return;
    }

    setAssignmentSaving(true);
    setAssignmentError('');
    setAssignmentSuccess('');
    const result = await createAssignmentLink(lesson, {
      oneAttempt: true,
      allowRetry: Boolean(assignmentConfig.allowRetry),
      visibilityPolicy: normalizeVisibilityPolicy(assignmentConfig.visibilityPolicy || lesson?.settings?.visibilityPolicy || 'student_answers_only'),
      showCheckButton: Boolean(assignmentConfig.showCheckButton),
      enableGrading: assignmentConfig.enableGrading !== false,
      showTotalGrade: assignmentConfig.showTotalGrade !== false,
      showPerQuestionGrade: assignmentConfig.showPerQuestionGrade !== false,
      disableBackNavigation: assignmentConfig.disableBackNavigation === true,
      sessionTimeLimitMinutes: Number(assignmentConfig.sessionTimeLimitMinutes) > 0 ? Number(assignmentConfig.sessionTimeLimitMinutes) : null,
      maxAttempts: Math.max(1, Number(assignmentConfig.maxAttempts) || 1),
      retryCooldownSeconds: Math.max(0, Number(assignmentConfig.retryCooldownSeconds) || 0),
      randomizeQuestions: assignmentConfig.randomizeQuestions === true,
      randomizeOptions: assignmentConfig.randomizeOptions === true,
      lockOnTimeout: assignmentConfig.lockOnTimeout !== false,
      bindAttemptToDevice: assignmentConfig.bindAttemptToDevice === true,
      suspiciousTabSwitchThreshold: Math.max(1, Number(assignmentConfig.suspiciousTabSwitchThreshold) || 6),
      copyPasteRestricted: assignmentConfig.copyPasteRestricted === true,
      gracePeriodSeconds: Math.max(0, Number(assignmentConfig.gracePeriodSeconds) || 0),
      expiresAt: fromLocalDateTimeValue(assignmentConfig.dueAt),
    });
    setAssignmentSaving(false);

    if (!result.ok) {
      const reason = result.reason === 'auth_required'
        ? 'Sign in with a teacher account in Settings to manage assignments.'
        : result.reason || 'Failed to create assignment link.';
      setAssignmentError(reason);
      return;
    }

    setAssignmentLink(result.assignmentUrl || '');
    setAssignmentSuccess('Assignment saved. You can copy and share the link below.');
    await refreshAssignmentCenter();
  };

  const handleEditAssignmentFromCenter = (assignment) => {
    setSelectedAssignmentLessonId(String(assignment.lessonId || ''));
    setAssignmentConfig({
      visibilityPolicy: normalizeVisibilityPolicy(assignment.visibilityPolicy || 'student_answers_only'),
      allowRetry: Boolean(assignment.allowRetry),
      showCheckButton: Boolean(assignment.showCheckButton),
      enableGrading: assignment.enableGrading !== false,
      showTotalGrade: assignment.showTotalGrade !== false,
      showPerQuestionGrade: assignment.showPerQuestionGrade !== false,
      disableBackNavigation: assignment.disableBackNavigation === true,
      sessionTimeLimitMinutes: assignment.sessionTimeLimitMinutes ? String(assignment.sessionTimeLimitMinutes) : '',
      maxAttempts: assignment.maxAttempts ? String(assignment.maxAttempts) : '1',
      retryCooldownSeconds: assignment.retryCooldownSeconds ? String(assignment.retryCooldownSeconds) : '',
      randomizeQuestions: assignment.randomizeQuestions === true,
      randomizeOptions: assignment.randomizeOptions === true,
      lockOnTimeout: assignment.lockOnTimeout !== false,
      bindAttemptToDevice: assignment.bindAttemptToDevice === true,
      suspiciousTabSwitchThreshold: assignment.suspiciousTabSwitchThreshold ? String(assignment.suspiciousTabSwitchThreshold) : '6',
      copyPasteRestricted: assignment.copyPasteRestricted === true,
      gracePeriodSeconds: assignment.gracePeriodSeconds ? String(assignment.gracePeriodSeconds) : '',
      dueAt: toLocalDateTimeValue(assignment.expiresAt),
    });
    setAssignmentLink(assignment.assignmentUrl || '');
    setAssignmentSuccess(`Loaded settings for ${assignment.lessonTitle}.`);
    setAssignmentError('');
  };

  const handleCopyAssignmentLink = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setAssignmentLinkCopied(true);
      setTimeout(() => setAssignmentLinkCopied(false), 1400);
    } catch {
      setAssignmentError('Clipboard access denied. Copy link manually from the field.');
    }
  };

  const handleAddFolder = (parentId) => {
    setFolderPromptParent(parentId ?? '__root__');
  };

  const handleRenameFolder = (folderId, name) => {
    onSaveFolders(renameFolderInTree(folders, folderId, name));
  };

  const handleRemoveFolder = (folderId) => {
    onSaveFolders(removeFolder(folders, folderId));
    if (selectedFolder === folderId) setSelectedFolder(null);
  };

  const lessonCounts = useMemo(() => {
    const counts = {};
    for (const lesson of lessons) {
      const fid = lesson.folder || null;
      counts[fid] = (counts[fid] || 0) + 1;
    }
    return counts;
  }, [lessons]);

  const activeSession = useMemo(() => sessions.find((session) => session.id === activeSessionId) || null, [activeSessionId, sessions]);
  const sessionStats = useMemo(() => {
    const averageScore = sessions.length ? Math.round(sessions.reduce((sum, session) => sum + (session.score || 0), 0) / sessions.length) : 0;
    const uniqueStudents = new Set(sessions.map((session) => session.studentName).filter(Boolean)).size;
    return { averageScore, uniqueStudents, totalSessions: sessions.length };
  }, [sessions]);

  const filteredLessons = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let allowedIds = null;
    if (selectedFolder) {
      const target = findFolder(folders, selectedFolder);
      allowedIds = target ? new Set(getAllDescendantIds(target)) : new Set();
    }
    const visible = lessons.filter((lesson) => {
      if (q && !(lesson.title || '').toLowerCase().includes(q)) return false;
      if (allowedIds && !allowedIds.has(lesson.folder)) return false;
      return true;
    });

    if (sortBy === 'name') {
      return visible.sort((left, right) => (left.title || '').localeCompare(right.title || ''));
    }

    if (sortBy === 'date_created') {
      return visible.sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0));
    }

    return visible.sort((left, right) => {
      const leftOpened = left.openedAt || left.updatedAt || 0;
      const rightOpened = right.openedAt || right.updatedAt || 0;
      return rightOpened - leftOpened;
    });
  }, [lessons, searchQuery, selectedFolder, folders, sortBy]);

  const renderedLessons = useMemo(() => filteredLessons.slice(0, renderCount), [filteredLessons, renderCount]);

  useEffect(() => {
    setRenderCount(48);
  }, [searchQuery, selectedFolder, sortBy, lessons.length]);

  useEffect(() => {
    const node = mainRef.current;
    if (!node) return undefined;
    const onScroll = () => {
      if (renderCount >= filteredLessons.length) return;
      const threshold = node.scrollHeight - node.clientHeight - 400;
      if (node.scrollTop >= threshold) {
        setRenderCount((current) => Math.min(current + 32, filteredLessons.length));
      }
    };
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, [filteredLessons.length, renderCount]);

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const lesson = await importLesson(file);
      onImport(lesson);
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f7f7f5]">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-6 py-3">
        <div>
          <div className="text-lg font-semibold tracking-tight text-zinc-950">Lesson Flow</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void openAssignmentCenter()} className="border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-900">Assignments</button>
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search lessons…" className="w-full sm:w-56 border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-zinc-900" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 outline-none focus:border-zinc-900"
            aria-label="Sort lessons"
          >
            {Object.entries(SORT_OPTIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <button type="button" onClick={() => inputRef.current?.click()} className="border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-zinc-900">Import</button>
          <input ref={inputRef} type="file" accept="application/json" className="hidden" onChange={handleImport} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left sidebar — stats + quick create + categories */}
        <aside className="hidden w-[260px] shrink-0 flex-col border-r border-zinc-200 bg-white lg:flex">
          <div className="border-b border-zinc-200 p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="border border-zinc-200 bg-zinc-50 px-2 py-2">
                <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">Score</div>
                <div className="mt-0.5 text-sm font-semibold text-zinc-950">{sessionStats.averageScore}%</div>
              </div>
              <div className="border border-zinc-200 bg-zinc-50 px-2 py-2">
                <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">Students</div>
                <div className="mt-0.5 text-sm font-semibold text-zinc-950">{sessionStats.uniqueStudents}</div>
              </div>
              <div className="border border-zinc-200 bg-zinc-50 px-2 py-2">
                <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-500">Sessions</div>
                <div className="mt-0.5 text-sm font-semibold text-zinc-950">{sessionStats.totalSessions}</div>
              </div>
            </div>
          </div>
          <div className="border-b border-zinc-200 p-4">
            <button type="button" onClick={() => setCreateTemplate('blank')} className="mb-2 w-full border border-zinc-900 bg-zinc-900 px-3 py-2.5 text-sm font-medium text-white">
              + New Lesson
            </button>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button type="button" onClick={() => setCreateTemplate('grammar')} className="border border-zinc-200 px-2 py-1.5 text-zinc-600 hover:border-zinc-900">Grammar</button>
              <button type="button" onClick={() => setCreateTemplate('vocabulary')} className="border border-zinc-200 px-2 py-1.5 text-zinc-600 hover:border-zinc-900">Vocabulary</button>
              <button type="button" onClick={() => setCreateTemplate('reading')} className="border border-zinc-200 px-2 py-1.5 text-zinc-600 hover:border-zinc-900">Reading</button>
              <button type="button" onClick={() => setCreateTemplate('catalog')} className="border border-zinc-200 px-2 py-1.5 text-zinc-600 hover:border-zinc-900">All Types</button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">Folders</div>
              <button type="button" onClick={() => handleAddFolder(null)} className="text-zinc-400 hover:text-zinc-900" title="New folder"><PlusIcon size={12} /></button>
            </div>
            <div className="space-y-0">
              <button type="button" onClick={() => setSelectedFolder(null)} className={selectedFolder === null ? 'w-full bg-zinc-900 px-3 py-1.5 text-left text-xs font-medium text-white' : 'w-full px-3 py-1.5 text-left text-xs text-zinc-600 hover:bg-zinc-50'}>
                All Lessons
              </button>
              <ul role="tree" aria-label="Lesson folders">
                {folders.map((f) => (
                  <FolderNode key={f.id} folder={f} depth={0} selectedFolder={selectedFolder} onSelectFolder={setSelectedFolder} onAdd={handleAddFolder} onRename={handleRenameFolder} onRemove={handleRemoveFolder} lessonCounts={lessonCounts} />
                ))}
              </ul>
            </div>
          </div>
        </aside>

        {/* Main content area */}
        <main ref={mainRef} className="min-h-0 flex-1 overflow-auto p-5">
          {/* Lesson grid */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              {filteredLessons.length} lesson{filteredLessons.length !== 1 ? 's' : ''}
              {selectedFolder && ` in ${folderPath(folders, selectedFolder) || 'folder'}`}
            </div>
            {/* Mobile create button */}
            <button type="button" onClick={() => setCreateTemplate('blank')} className="border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white lg:hidden">+ New</button>
          </div>

          {filteredLessons.length === 0 && (
            <EmptyPlaybook
              title={searchQuery ? 'No lessons match this filter' : 'No lessons yet'}
              detail={searchQuery ? 'Try a broader keyword or reset folder and sorting filters.' : 'Start with a blank lesson, then use templates to accelerate authoring.'}
              actions={searchQuery
                ? [{ label: 'Clear search', onClick: () => setSearchQuery('') }]
                : [{ label: 'New lesson', onClick: () => setCreateTemplate('blank'), primary: true, icon: <PlusIcon size={12} /> }]}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{renderedLessons.map((lesson) => (
            <div key={lesson.id} className="group relative flex flex-col border border-zinc-200 bg-white transition hover:border-zinc-900">
              <button
                type="button"
                onClick={() => {
                  const next = { ...lesson, openedAt: Date.now() };
                  onSave(next);
                  onSelect(next);
                }}
                className="flex-1 p-4 text-left"
              >
                <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-400">{(lesson.folder && folderPath(folders, lesson.folder)) || 'Uncategorized'}</div>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{lesson.title || 'Untitled lesson'}</div>
                <div className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">{previewText(lesson)}</div>
              </button>
              <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-2">
                <div className="text-[10px] text-zinc-400">{lesson.updatedAt ? new Date(lesson.updatedAt).toLocaleDateString() : ''}</div>
                <button type="button" onClick={(e) => { e.stopPropagation(); setMenuLessonId(menuLessonId === lesson.id ? null : lesson.id); }} className="p-1 text-zinc-400 opacity-0 transition hover:text-zinc-900 group-hover:opacity-100">
                  <DotsVerticalIcon size={14} />
                </button>
              </div>
              {menuLessonId === lesson.id && (
                <LessonCardMenu
                  lesson={lesson}
                  onClose={() => setMenuLessonId(null)}
                  onDuplicate={handleDuplicate}
                  onExport={exportLesson}
                  onRename={(l) => setRenamingLesson(l)}
                  onMoveToFolder={(l) => setMovingLesson(l)}
                  onPractice={(l) => onPractice?.(l)}
                  onShare={(l) => {
                    setShareLesson(l);
                    setShareState({ loading: false, error: '', link: '', copied: false });
                  }}
                  onAssignments={(l) => { void openAssignmentCenter(l); }}
                  onDelete={onDelete}
                />
              )}
            </div>
          ))}</div>
          {renderCount < filteredLessons.length && (
            <div className="mt-4 text-center">
              <button type="button" onClick={() => setRenderCount((current) => Math.min(current + 64, filteredLessons.length))} className="border border-zinc-200 px-3 py-2 text-xs text-zinc-600 hover:border-zinc-900">
                Load more lessons ({filteredLessons.length - renderCount} remaining)
              </button>
            </div>
          )}

        </main>

        {/* Right sidebar — collapsible recent sessions */}
        {sessions.length > 0 && (
          <aside className="hidden w-[300px] shrink-0 border-l border-zinc-200 bg-white xl:block">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">Recent Sessions</div>
              <button type="button" onClick={() => setRecentSidebarOpen((value) => !value)} className="border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 hover:border-zinc-900">{recentSidebarOpen ? 'Collapse' : 'Expand'}</button>
            </div>
            {recentSidebarOpen && (
              <div className="max-h-[calc(100vh-8rem)] overflow-auto p-3">
                <div className="space-y-2">
                  {sessions.map((session) => (
                    <div key={session.id} className="group border border-zinc-200 bg-white">
                      <button type="button" onClick={() => setActiveSessionId(session.id)} className="w-full px-3 py-3 text-left">
                        <div className="text-xs font-medium text-zinc-900">{session.lessonTitle}</div>
                        <div className="mt-1 text-[10px] text-zinc-500">{session.studentName || 'Unknown'} · {new Date(session.timestamp).toLocaleDateString()}</div>
                        <div className="mt-1 text-[10px] text-zinc-500">Score {session.score}% · {session.correctCount ?? '-'} / {session.total ?? '-'}</div>
                      </button>
                      {onDeleteSession && (
                        <div className="border-t border-zinc-100 px-3 py-2 text-right">
                          <button type="button" onClick={() => onDeleteSession(session.id)} className="text-[10px] text-zinc-400 transition hover:text-red-600">Delete</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      <SessionPreviewModal session={activeSession} onClose={() => setActiveSessionId(null)} onDelete={onDeleteSession} />
      <RenameModal lesson={renamingLesson} onSave={handleRename} onClose={() => setRenamingLesson(null)} />
      <MoveFolderModal lesson={movingLesson} folders={folders} onSave={handleMoveToFolder} onClose={() => setMovingLesson(null)} />
      <ShareLessonModal
        lesson={shareLesson}
        shareState={shareState}
        onClose={() => {
          setShareLesson(null);
          setShareState({ loading: false, error: '', link: '', copied: false });
        }}
        onCreateLink={handleCreateShareLink}
        onCopyLink={handleCopyShareLink}
      />
      <AssignmentCenterModal
        open={assignmentCenterOpen}
        lessons={lessons}
        assignments={ownerAssignments}
        submissionsByAssignment={submissionsByAssignment}
        selectedLessonId={selectedAssignmentLessonId}
        assignmentConfig={assignmentConfig}
        saving={assignmentSaving}
        loading={assignmentLoading}
        error={assignmentError}
        success={assignmentSuccess}
        latestLink={assignmentLink}
        copied={assignmentLinkCopied}
        expandedAssignmentId={expandedAssignmentId}
        onClose={() => setAssignmentCenterOpen(false)}
        onRefresh={refreshAssignmentCenter}
        onSelectedLessonChange={setSelectedAssignmentLessonId}
        onConfigChange={setAssignmentConfig}
        onSaveAssignment={handleSaveAssignmentFromCenter}
        onEditAssignment={handleEditAssignmentFromCenter}
        onCopyLink={handleCopyAssignmentLink}
        onToggleExpandedAssignment={(assignmentId) => setExpandedAssignmentId((current) => (current === assignmentId ? '' : assignmentId))}
        onOpenGrading={() => {
          if (typeof window !== 'undefined') window.location.assign('/grading');
        }}
      />
      <PromptModal
        open={folderPromptParent !== null}
        title="New Folder"
        placeholder="Folder name"
        onConfirm={(name) => { onSaveFolders(addFolder(folders, folderPromptParent === '__root__' ? null : folderPromptParent, name)); setFolderPromptParent(null); }}
        onCancel={() => setFolderPromptParent(null)}
      />
      <PromptModal
        open={Boolean(createTemplate)}
        title="New Lesson"
        placeholder="Lesson title"
        defaultValue=""
        onConfirm={(title) => {
          const value = title.trim();
          if (!value) return;
          onCreate({ template: createTemplate, title: value });
          setCreateTemplate(null);
        }}
        onCancel={() => setCreateTemplate(null)}
      />
    </div>
  );
}
