import { useEffect, useMemo, useRef, useState } from 'react';
import { exportLesson, exportSession, importLesson, printSessionReport } from '../storage';
import { generateDSL } from '../parser';
import { DotsVerticalIcon, ChevronRightIcon, ChevronDownIcon, FolderIcon, FolderOpenIcon, PlusIcon } from './Icons';
import PromptModal from './PromptModal';
import { createLessonShareLink } from '../utils/lessonSharing';
import { createAssignmentLink } from '../utils/lessonAssignments';

const SORT_OPTIONS = {
  last_opened: 'Last opened',
  date_created: 'Date created',
  name: 'Name',
};

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

function LessonCardMenu({ lesson, onClose, onDuplicate, onExport, onRename, onMoveToFolder, onShare, onPractice, onDelete }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  const items = [
    { label: 'Duplicate', action: () => { onDuplicate(lesson); onClose(); } },
    { label: 'Start practice mode', action: () => { onPractice(lesson); onClose(); } },
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

function ShareLessonModal({ lesson, shareState, assignmentConfig, onChangeAssignmentConfig, onClose, onCreateLink, onCreateAssignmentLink, onCopyLink }) {
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

          <div className="border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Homework settings</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">Answer visibility</span>
                <select
                  value={assignmentConfig.visibilityPolicy}
                  onChange={(event) => onChangeAssignmentConfig((current) => ({ ...current, visibilityPolicy: event.target.value }))}
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
                  onChange={(event) => onChangeAssignmentConfig((current) => ({ ...current, allowRetry: event.target.value === 'enabled' }))}
                  className="w-full border border-zinc-200 px-2 py-2 text-xs outline-none focus:border-zinc-900"
                >
                  <option value="disabled">Disabled</option>
                  <option value="enabled">Enabled</option>
                </select>
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-zinc-700">
                <input type="checkbox" checked={assignmentConfig.enableGrading} onChange={(event) => onChangeAssignmentConfig((current) => ({ ...current, enableGrading: event.target.checked }))} />
                Enable grading
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-zinc-700">
                <input type="checkbox" checked={assignmentConfig.showTotalGrade} onChange={(event) => onChangeAssignmentConfig((current) => ({ ...current, showTotalGrade: event.target.checked }))} />
                Show total grade
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-zinc-700">
                <input type="checkbox" checked={assignmentConfig.showPerQuestionGrade} onChange={(event) => onChangeAssignmentConfig((current) => ({ ...current, showPerQuestionGrade: event.target.checked }))} />
                Show per-question grade
              </label>
              <label className="inline-flex items-center gap-2 text-xs text-zinc-700">
                <input type="checkbox" checked={assignmentConfig.showCheckButton} onChange={(event) => onChangeAssignmentConfig((current) => ({ ...current, showCheckButton: event.target.checked }))} />
                Show check button
              </label>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onCreateAssignmentLink(lesson, assignmentConfig)}
            disabled={shareState.assignmentLoading}
            className="border border-zinc-900 bg-white px-3 py-2 text-xs font-medium text-zinc-700 disabled:opacity-60"
          >
            {shareState.assignmentLoading ? 'Creating assignment…' : 'Create assignment link (one attempt)'}
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

          {shareState.assignmentLink && (
            <div className="space-y-2">
              <label className="block text-[11px] uppercase tracking-[0.14em] text-zinc-500">Assignment link</label>
              <input
                readOnly
                value={shareState.assignmentLink}
                className="w-full border border-zinc-200 px-3 py-2 text-xs text-zinc-700 outline-none"
              />
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onCopyLink(shareState.assignmentLink)} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700 hover:border-zinc-900">Copy link</button>
                {shareState.assignmentCopied && <span className="text-[11px] text-emerald-700">Copied</span>}
              </div>
            </div>
          )}
        </div>
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
    <div>
      <div className={`group flex items-center gap-0.5 ${isSelected ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`} style={{ paddingLeft: `${depth * 14}px` }}>
        <button type="button" onClick={() => hasChildren && setExpanded(!expanded)} className="shrink-0 p-0.5">
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
        <button type="button" onClick={() => onAdd(folder.id)} className="shrink-0 p-0.5 opacity-0 group-hover:opacity-100" title="Add subfolder"><PlusIcon size={10} /></button>
        <button type="button" onClick={() => onRemove(folder.id)} className="shrink-0 p-0.5 text-red-500 opacity-0 group-hover:opacity-100" title="Delete folder">×</button>
      </div>
      {expanded && hasChildren && folder.children.map((child) => (
        <FolderNode key={child.id} folder={child} depth={depth + 1} selectedFolder={selectedFolder} onSelectFolder={onSelectFolder} onAdd={onAdd} onRename={onRename} onRemove={onRemove} lessonCounts={lessonCounts} />
      ))}
    </div>
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
  const [shareState, setShareState] = useState({ loading: false, assignmentLoading: false, error: '', link: '', copied: false, assignmentLink: '', assignmentCopied: false });
  const [assignmentConfig, setAssignmentConfig] = useState({
    visibilityPolicy: 'student_answers_only',
    allowRetry: false,
    showCheckButton: false,
    enableGrading: true,
    showTotalGrade: true,
    showPerQuestionGrade: true,
  });
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

  const handleCreateAssignmentLink = async (lesson, config) => {
    setShareState((prev) => ({ ...prev, assignmentLoading: true, error: '', assignmentCopied: false }));
    const result = await createAssignmentLink(lesson, {
      oneAttempt: true,
      allowRetry: Boolean(config?.allowRetry),
      visibilityPolicy: normalizeVisibilityPolicy(config?.visibilityPolicy || lesson?.settings?.visibilityPolicy || 'student_answers_only'),
      showCheckButton: Boolean(config?.showCheckButton),
      enableGrading: config?.enableGrading !== false,
      showTotalGrade: config?.showTotalGrade !== false,
      showPerQuestionGrade: config?.showPerQuestionGrade !== false,
    });
    if (!result.ok) {
      const reason = result.reason === 'auth_required'
        ? 'Sign in with a teacher account in Settings to create assignment links.'
        : result.reason || 'Failed to create assignment link.';
      setShareState((prev) => ({ ...prev, assignmentLoading: false, error: reason }));
      return;
    }
    setShareState((prev) => ({ ...prev, assignmentLoading: false, error: '', assignmentLink: result.assignmentUrl || '', assignmentCopied: false }));
  };

  const handleCopyShareLink = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      const isAssignment = value === shareState.assignmentLink;
      setShareState((prev) => ({ ...prev, copied: !isAssignment, assignmentCopied: isAssignment }));
      setTimeout(() => {
        setShareState((prev) => ({ ...prev, copied: false, assignmentCopied: false }));
      }, 1400);
    } catch {
      setShareState((prev) => ({ ...prev, error: 'Clipboard access denied. Copy link manually from the field.' }));
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
              {folders.map((f) => (
                <FolderNode key={f.id} folder={f} depth={0} selectedFolder={selectedFolder} onSelectFolder={setSelectedFolder} onAdd={handleAddFolder} onRename={handleRenameFolder} onRemove={handleRemoveFolder} lessonCounts={lessonCounts} />
              ))}
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
            <div className="border border-dashed border-zinc-300 bg-white px-6 py-12 text-center">
              <div className="text-sm text-zinc-500">{searchQuery ? 'No lessons match your search.' : 'No lessons yet. Create your first one!'}</div>
              {!searchQuery && <button type="button" onClick={() => setCreateTemplate('blank')} className="mt-4 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white">Create Lesson</button>}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{renderedLessons.map((lesson) => (
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
                    const settings = l?.settings || {};
                    setAssignmentConfig({
                      visibilityPolicy: normalizeVisibilityPolicy(settings.visibilityPolicy || 'student_answers_only'),
                      allowRetry: Boolean(settings.allowRetryHomework),
                      showCheckButton: Boolean(settings.showCheckButton),
                      enableGrading: settings.enableGrading !== false,
                      showTotalGrade: settings.showTotalGrade !== false,
                      showPerQuestionGrade: settings.showPerQuestionGrade !== false,
                    });
                    setShareState({ loading: false, assignmentLoading: false, error: '', link: '', copied: false, assignmentLink: '', assignmentCopied: false });
                  }}
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
        assignmentConfig={assignmentConfig}
        onChangeAssignmentConfig={setAssignmentConfig}
        onClose={() => {
          setShareLesson(null);
          setShareState({ loading: false, assignmentLoading: false, error: '', link: '', copied: false, assignmentLink: '', assignmentCopied: false });
        }}
        onCreateLink={handleCreateShareLink}
        onCreateAssignmentLink={handleCreateAssignmentLink}
        onCopyLink={handleCopyShareLink}
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
