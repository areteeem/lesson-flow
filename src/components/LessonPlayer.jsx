import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBlockLabel, getRequiredTaskBlocks, isTaskRequired, normalizeVisibleBlocks, validateLessonStructure } from '../utils/lesson';
import GradingScreen from './GradingScreen';
import LessonStage from './LessonStage';
import PrivacyDot from './PrivacyDot';
import { HamburgerIcon, FullscreenIcon, ExitFullscreenIcon } from './Icons';
import FontSettingsPanel, { loadFontSettings, getFontCSSVars } from './FontSettingsPanel';
import { recordDebugEvent } from '../utils/debug';

function useSwipe(onSwipeLeft, onSwipeRight) {
  const touchRef = useRef(null);
  const handlers = useMemo(() => ({
    onTouchStart: (e) => {
      const t = e.touches[0];
      touchRef.current = { x: t.clientX, y: t.clientY, time: Date.now(), target: e.target };
    },
    onTouchEnd: (e) => {
      if (!touchRef.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchRef.current.x;
      const dy = t.clientY - touchRef.current.y;
      const dt = Date.now() - touchRef.current.time;
      const origin = touchRef.current.target;
      touchRef.current = null;
      if (dt > 500 || Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
      // Skip swipe if originated inside a horizontally scrollable container
      let el = origin;
      while (el && el !== document.body) {
        if (el.scrollWidth > el.clientWidth + 4) return;
        el = el.parentElement;
      }
      if (dx < 0) onSwipeLeft();
      else onSwipeRight();
    },
  }), [onSwipeLeft, onSwipeRight]);
  return handlers;
}

function toPositiveNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function formatCountdown(totalSeconds) {
  const safe = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function seededHash(input = '') {
  let hash = 2166136261;
  const value = String(input || '');
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function seededShuffle(list = [], seedValue = '') {
  const arr = [...list];
  let seed = seededHash(seedValue) || 1;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function withRandomizedOptions(block, seed) {
  if (!block || typeof block !== 'object') return block;
  const next = { ...block };
  if (Array.isArray(next.options) && next.options.length > 1) {
    next.options = seededShuffle(next.options, `${seed}:${next.id || ''}:options`);
  }
  if (Array.isArray(next.children) && next.children.length > 0) {
    next.children = next.children.map((child, index) => withRandomizedOptions(child, `${seed}:child:${index}`));
  }
  return next;
}

const STUDENT_EXPERIENCE_KEY = 'lesson-flow-player-student-experience-v1';
const DEFAULT_STUDENT_EXPERIENCE = {
  highContrastMode: false,
  dyslexiaMode: false,
  reducedMotionMode: false,
  vibrationCue: true,
  showProgressTimeline: false,
  textZoomPreset: 100,
  zenMode: false,
};

function clampZoomPreset(value, fallback = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(85, Math.min(150, Math.round(numeric)));
}

function loadStudentExperience() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STUDENT_EXPERIENCE_KEY) || '{}');
    return {
      ...DEFAULT_STUDENT_EXPERIENCE,
      ...parsed,
      textZoomPreset: clampZoomPreset(parsed?.textZoomPreset, DEFAULT_STUDENT_EXPERIENCE.textZoomPreset),
    };
  } catch {
    return { ...DEFAULT_STUDENT_EXPERIENCE };
  }
}

function saveStudentExperience(value) {
  try {
    localStorage.setItem(STUDENT_EXPERIENCE_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage failures and keep in-memory settings.
  }
}

const PLAYER_SHORTCUTS = [
  { key: 'Arrow Left / Arrow Right', description: 'Navigate previous/next block' },
  { key: 'M', description: 'Open lesson map drawer' },
  { key: 'F', description: 'Toggle fullscreen' },
  { key: 'H', description: 'Toggle high-contrast mode' },
  { key: 'Z', description: 'Toggle Zen mode (minimal UI)' },
  { key: 'Esc', description: 'Close any open panel' },
  { key: '?', description: 'Open keyboard shortcut help' },
];

export default function LessonPlayer({ lesson, onExit, mode = 'default', sessionMeta = null, onSubmitted = null }) {
  const SIDEBAR_ITEM_HEIGHT = 76;
  const SIDEBAR_OVERSCAN = 6;
  const validation = useMemo(() => validateLessonStructure(lesson), [lesson]);
  const baseBlocks = useMemo(() => normalizeVisibleBlocks(lesson?.blocks || []), [lesson]);
  const sessionKey = lesson?.id ? `lf-player-${lesson.id}` : null;
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (!sessionKey) return 0;
    try { return Number(sessionStorage.getItem(`${sessionKey}-idx`)) || 0; } catch { return 0; }
  });
  const [results, setResults] = useState(() => {
    if (!sessionKey) return {};
    try { return JSON.parse(sessionStorage.getItem(sessionKey)) || {}; } catch { return {}; }
  });
  const [showGrading, setShowGrading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [studentName, setStudentName] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fontSettings, setFontSettings] = useState(loadFontSettings);
  const [showFontPanel, setShowFontPanel] = useState(false);
  const [showPlayerHotkeys, setShowPlayerHotkeys] = useState(false);
  const [showAccessibilityPanel, setShowAccessibilityPanel] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [studentExperience, setStudentExperience] = useState(loadStudentExperience);
  const [interactionLog, setInteractionLog] = useState(() => ({
    startedAt: Date.now(),
    tabLeaves: 0,
    tabReturns: 0,
    blurCount: 0,
    focusCount: 0,
    lastTabLeftAt: null,
    answers: [],
    events: [],
  }));
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(null);
  const [confidenceByBlock, setConfidenceByBlock] = useState(() => {
    if (!sessionKey) return {};
    try {
      return JSON.parse(sessionStorage.getItem(`${sessionKey}-confidence`) || '{}') || {};
    } catch {
      return {};
    }
  });
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [confidenceVisible, setConfidenceVisible] = useState(false);
  const confidenceTimerRef = useRef(null);
  const [policyNotice, setPolicyNotice] = useState('');
  const shellRef = useRef(null);
  const sidebarViewportRef = useRef(null);
  const [sidebarScrollTop, setSidebarScrollTop] = useState(0);
  const [sidebarHeight, setSidebarHeight] = useState(560);
  const resumePromptInitializedRef = useRef(false);

  const modeConfig = useMemo(() => ({
    id: mode || 'default',
    origin: sessionMeta?.origin || (mode === 'assignment' ? 'homework' : mode === 'practice' ? 'practice' : mode === 'live' ? 'live' : 'local'),
    allowRetry: sessionMeta?.allowRetry ?? (mode !== 'assignment' && mode !== 'homework'),
    allowRestart: sessionMeta?.allowRestart ?? (mode !== 'assignment' && mode !== 'homework'),
    requireRequiredTasks: sessionMeta?.requireRequiredTasks ?? (mode === 'assignment' || mode === 'homework'),
    showCheckButton: sessionMeta?.showCheckButton ?? (mode !== 'assignment' && mode !== 'homework'),
    disableBackNavigation: sessionMeta?.disableBackNavigation ?? (lesson?.settings?.disableBackNavigation === true),
    sessionTimeLimitMinutes: toPositiveNumber(
      sessionMeta?.sessionTimeLimitMinutes ?? lesson?.settings?.sessionTimeLimitMinutes,
      null,
    ),
    randomizeQuestions: sessionMeta?.randomizeQuestions === true,
    randomizeOptions: sessionMeta?.randomizeOptions === true,
    lockOnTimeout: sessionMeta?.lockOnTimeout !== false,
    suspiciousTabSwitchThreshold: Math.max(1, Number(sessionMeta?.suspiciousTabSwitchThreshold || lesson?.settings?.suspiciousTabSwitchThreshold || 6)),
    copyPasteRestricted: sessionMeta?.copyPasteRestricted === true,
    randomSeed: String(sessionMeta?.randomSeed || `${sessionMeta?.assignmentId || lesson?.id || 'lesson'}:${sessionMeta?.origin || mode}`),
  }), [lesson?.settings?.disableBackNavigation, lesson?.settings?.sessionTimeLimitMinutes, mode, sessionMeta]);

  const blocks = useMemo(() => {
    let nextBlocks = [...baseBlocks];
    if (modeConfig.randomizeQuestions) {
      nextBlocks = seededShuffle(nextBlocks, `${modeConfig.randomSeed}:questions`);
    }
    if (modeConfig.randomizeOptions) {
      nextBlocks = nextBlocks.map((block, index) => withRandomizedOptions(block, `${modeConfig.randomSeed}:block:${index}`));
    }
    return nextBlocks;
  }, [baseBlocks, modeConfig.randomSeed, modeConfig.randomizeOptions, modeConfig.randomizeQuestions]);

  const updateStudentExperience = useCallback((patch) => {
    setStudentExperience((current) => ({
      ...current,
      ...patch,
      textZoomPreset: patch.textZoomPreset === undefined
        ? current.textZoomPreset
        : clampZoomPreset(patch.textZoomPreset, current.textZoomPreset),
    }));
  }, []);

  const resetSessionProgress = useCallback(() => {
    setResults({});
    setCurrentIndex(0);
    setShowGrading(false);
    setConfidenceByBlock({});
    setShowResumePrompt(false);
    if (modeConfig.sessionTimeLimitMinutes) {
      setTimeRemainingSeconds(Math.round(modeConfig.sessionTimeLimitMinutes * 60));
    }
    if (sessionKey) {
      try {
        sessionStorage.removeItem(sessionKey);
        sessionStorage.removeItem(`${sessionKey}-idx`);
        sessionStorage.removeItem(`${sessionKey}-confidence`);
      } catch {
        // Ignore session storage failures.
      }
    }
  }, [modeConfig.sessionTimeLimitMinutes, sessionKey]);

  useEffect(() => {
    if (!sidebarOpen || !sidebarViewportRef.current) return undefined;
    const viewport = sidebarViewportRef.current;
    const updateHeight = () => setSidebarHeight(viewport.clientHeight || 560);
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [sidebarOpen]);

  useEffect(() => {
    saveStudentExperience(studentExperience);
  }, [studentExperience]);

  useEffect(() => {
    if (!sessionKey) return;
    try {
      sessionStorage.setItem(`${sessionKey}-confidence`, JSON.stringify(confidenceByBlock));
    } catch {
      // Ignore quota/storage write failures.
    }
  }, [confidenceByBlock, sessionKey]);

  useEffect(() => {
    if (resumePromptInitializedRef.current) return;
    resumePromptInitializedRef.current = true;
    if (showGrading) return;
    const answeredCount = Object.keys(results || {}).length;
    if (currentIndex > 0 || answeredCount > 0) {
      setShowResumePrompt(true);
    }
  }, [currentIndex, results, showGrading]);

  useEffect(() => {
    const limitMinutes = modeConfig.sessionTimeLimitMinutes;
    if (!limitMinutes) {
      setTimeRemainingSeconds(null);
      return;
    }
    setTimeRemainingSeconds(Math.round(limitMinutes * 60));
  }, [modeConfig.sessionTimeLimitMinutes]);

  useEffect(() => {
    if (showGrading || timeRemainingSeconds === null) return undefined;
    if (timeRemainingSeconds <= 0) {
      recordDebugEvent('lesson_time_limit_reached', {
        lessonId: lesson?.id || null,
        currentIndex,
        totalBlocks: blocks.length,
      });
      if (modeConfig.lockOnTimeout) {
        setShowGrading(true);
      } else {
        setPolicyNotice('Time limit reached. This assignment is configured to continue without hard lock.');
        setTimeRemainingSeconds(null);
      }
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setTimeRemainingSeconds((current) => {
        if (current === null) return null;
        return Math.max(0, current - 1);
      });
    }, 1000);

    return () => window.clearTimeout(timerId);
  }, [blocks.length, currentIndex, lesson?.id, modeConfig.lockOnTimeout, showGrading, timeRemainingSeconds]);

  useEffect(() => {
    if (blocks.length === 0) {
      recordDebugEvent('lesson_player_empty', {
        lessonId: lesson?.id || null,
        title: lesson?.title || null,
        issues: validation.issues,
      }, validation.issues.length > 0 ? 'warn' : 'info');
    }
  }, [blocks.length, lesson?.id, lesson?.title, validation.issues]);

  useEffect(() => {
    if (modeConfig.copyPasteRestricted) {
      setPolicyNotice('Activity is monitored in this session.');
    }
  }, [modeConfig.copyPasteRestricted]);

  useEffect(() => {
    const onVisibilityChange = () => {
      const eventAt = Date.now();
      if (document.visibilityState === 'hidden') {
        setInteractionLog((current) => ({
          ...current,
          tabLeaves: current.tabLeaves + 1,
          lastTabLeftAt: eventAt,
          events: [...current.events, { type: 'tab_hidden', at: eventAt }],
        }));
        return;
      }

      setInteractionLog((current) => ({
        ...current,
        tabReturns: current.tabReturns + 1,
        events: [...current.events, { type: 'tab_visible', at: eventAt }],
      }));
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    if (!modeConfig.copyPasteRestricted) return undefined;

    const deny = (eventType, event) => {
      event.preventDefault();
      const eventAt = Date.now();
      setPolicyNotice('Copy/paste is restricted for this assignment.');
      setInteractionLog((current) => ({
        ...current,
        events: [...current.events, { type: `anti_cheat_${eventType}`, at: eventAt, blockId: blocks[currentIndex]?.id || null }],
      }));
    };

    const onCopy = (event) => deny('copy', event);
    const onPaste = (event) => deny('paste', event);
    const onCut = (event) => deny('cut', event);
    const onContextMenu = (event) => deny('contextmenu', event);

    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('cut', onCut);
    document.addEventListener('contextmenu', onContextMenu);

    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('contextmenu', onContextMenu);
    };
  }, [blocks, currentIndex, modeConfig.copyPasteRestricted]);

  useEffect(() => {
    if (interactionLog.tabLeaves < modeConfig.suspiciousTabSwitchThreshold) return;
    setPolicyNotice(`Warning: tab switching reached ${interactionLog.tabLeaves} events (threshold ${modeConfig.suspiciousTabSwitchThreshold}).`);
  }, [interactionLog.tabLeaves, modeConfig.suspiciousTabSwitchThreshold]);

  useEffect(() => {
    const onBlur = () => {
      const eventAt = Date.now();
      setInteractionLog((current) => ({
        ...current,
        blurCount: current.blurCount + 1,
        events: [...current.events, { type: 'blur', at: eventAt }],
      }));
    };

    const onFocus = () => {
      const eventAt = Date.now();
      setInteractionLog((current) => ({
        ...current,
        focusCount: current.focusCount + 1,
        events: [...current.events, { type: 'focus', at: eventAt }],
      }));
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Keep fullscreen state in sync with the browser, but only enter fullscreen from an explicit user action.
  useEffect(() => {
    setIsFullscreen(!!document.fullscreenElement);
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      const el = shellRef.current || document.documentElement;
      el.requestFullscreen?.().catch(() => {});
    }
  };

  const handleExit = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    recordDebugEvent('lesson_player_exit', { lessonId: lesson?.id || null, currentIndex, totalBlocks: blocks.length });
    onExit();
  };

  // Persist results + index to sessionStorage so navigating back/forward preserves answers
  useEffect(() => {
    if (!sessionKey) return;
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify(results));
      sessionStorage.setItem(`${sessionKey}-idx`, String(currentIndex));
    } catch { /* quota exceeded — ignore */ }
  }, [results, currentIndex, sessionKey]);

  useEffect(() => {
    if (blocks.length === 0) return;
    if (currentIndex > blocks.length - 1) setCurrentIndex(blocks.length - 1);
  }, [blocks.length, currentIndex]);

  // Preload next block's media (audio/video/image)
  useEffect(() => {
    const next = blocks[currentIndex + 1];
    if (!next) return;
    const collectMedia = (b) => {
      const urls = [];
      const src = b?.media || b?.image || b?.video || b?.audio || b?.src || '';
      if (src && !src.startsWith('data:')) urls.push(src);
      if (b?.children) b.children.forEach((c) => urls.push(...collectMedia(c)));
      return urls;
    };
    const urls = collectMedia(next);
    const links = urls.map((url) => {
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = url;
      document.head.appendChild(link);
      return link;
    });
    return () => links.forEach((l) => l.remove());
  }, [currentIndex, blocks]);

  const isComplete = (block) => {
    if (!block) return false;
    if (block.type === 'group') {
      const children = Array.isArray(block.children) ? block.children : [];
      return children.every((child) => Boolean(results[child.id]));
    }
    if (block.type !== 'task') return true;
    return Boolean(results[block.id]);
  };

  const canAdvance = blocks.length > 0;
  const current = blocks[currentIndex] || null;
  const currentRequiredBlocked = Boolean(
    current
    && current.type === 'task'
    && modeConfig.requireRequiredTasks
    && isTaskRequired(current)
    && !results[current.id],
  );
  const canAdvanceCurrent = canAdvance && !currentRequiredBlocked;
  const canGoBack = !modeConfig.disableBackNavigation && currentIndex > 0;

  const goNext = () => {
    if (!canAdvanceCurrent) return;
    if (blocks.length === 0) {
      setShowGrading(true);
      return;
    }
    if (currentIndex >= blocks.length - 1) {
      const unanswered = blocks.filter((b) => (b.type === 'task' || b.type === 'group') && !isComplete(b)).length;
      if (unanswered > 0 && !window.confirm(`You have ${unanswered} unanswered question${unanswered > 1 ? 's' : ''}. Finish anyway?`)) return;
      recordDebugEvent('lesson_complete', {
        lessonId: lesson?.id || null,
        totalBlocks: blocks.length,
        answered: Object.keys(results).length,
      });
      setShowGrading(true);
      return;
    }
    setCurrentIndex((value) => Math.min(blocks.length - 1, value + 1));
    setConfidenceVisible(false);
  };
  const goPrev = () => {
    if (modeConfig.disableBackNavigation) return;
    setCurrentIndex((v) => Math.max(0, v - 1));
    setConfidenceVisible(false);
  };
  const swipeHandlers = useSwipe(goNext, goPrev);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.tagName === 'SELECT' || event.target.isContentEditable) return;
      if (event.key === 'ArrowLeft' && !modeConfig.disableBackNavigation) setCurrentIndex((value) => Math.max(0, value - 1));
      if (event.key === 'ArrowRight' && canAdvanceCurrent) {
        setCurrentIndex((value) => Math.min(blocks.length - 1, value + 1));
      }
      if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        setSidebarOpen(true);
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        toggleFullscreen();
      }
      if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        updateStudentExperience({ highContrastMode: !studentExperience.highContrastMode });
      }
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        updateStudentExperience({ zenMode: !studentExperience.zenMode });
      }
      if (event.key === 'Escape') {
        setShowOverflowMenu(false);
        setShowFontPanel(false);
        setShowAccessibilityPanel(false);
        setShowPlayerHotkeys(false);
        setSidebarOpen(false);
      }
      if (event.key === '?' || (event.key === '/' && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        setShowPlayerHotkeys(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [blocks.length, canAdvanceCurrent, modeConfig.disableBackNavigation, studentExperience.highContrastMode, updateStudentExperience]);

  const saveResult = (blockId, result) => {
    const confidence = typeof confidenceByBlock[blockId] === 'number' ? confidenceByBlock[blockId] : null;
    recordDebugEvent('task_complete', { lessonId: lesson?.id || null, blockId, correct: result?.correct ?? null, score: result?.score ?? null, confidence });
    const answeredAt = Date.now();

    if (studentExperience.vibrationCue && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      const coarsePointer = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)').matches
        : false;
      if (coarsePointer) {
        try {
          navigator.vibrate(20);
        } catch {
          // Ignore vibration API failures.
        }
      }
    }

    setInteractionLog((currentLog) => ({
      ...currentLog,
      answers: [
        ...currentLog.answers,
        {
          blockId,
          answeredAt,
          correct: result?.correct ?? null,
          score: typeof result?.score === 'number' ? result.score : null,
          confidence,
        },
      ],
      events: [
        ...currentLog.events,
        {
          type: 'answer_saved',
          at: answeredAt,
          blockId,
          correct: result?.correct ?? null,
          score: typeof result?.score === 'number' ? result.score : null,
          confidence,
        },
      ].slice(-200),
    }));
    setResults((currentResults) => ({
      ...currentResults,
      [blockId]: {
        ...(result || {}),
        confidence,
      },
    }));
    setConfidenceVisible(true);
    if (confidenceTimerRef.current) clearTimeout(confidenceTimerRef.current);
    confidenceTimerRef.current = setTimeout(() => setConfidenceVisible(false), 3000);
  };

  const effectiveFontSettings = useMemo(() => {
    const s = lesson?.settings || {};
    const base = {
      fontId: s.fontFamily || fontSettings.fontId,
      sizeId: s.fontSize || fontSettings.sizeId,
      lineHeightId: s.lineHeight || fontSettings.lineHeightId,
    };
    if (!studentExperience.dyslexiaMode) return base;
    return {
      ...base,
      fontId: 'dyslexic',
      lineHeightId: base.lineHeightId === 'compact' ? 'normal' : 'relaxed',
    };
  }, [lesson?.settings, fontSettings, studentExperience.dyslexiaMode]);

  const playerShellStyle = useMemo(() => ({
    ...getFontCSSVars(effectiveFontSettings),
    '--player-zoom-scale': String(clampZoomPreset(studentExperience.textZoomPreset, 100) / 100),
  }), [effectiveFontSettings, studentExperience.textZoomPreset]);

  const virtualWindow = useMemo(() => {
    const total = blocks.length;
    if (total <= 60) {
      return {
        topPadding: 0,
        bottomPadding: 0,
        start: 0,
        end: total,
      };
    }

    const visible = Math.max(8, Math.ceil(sidebarHeight / SIDEBAR_ITEM_HEIGHT));
    const start = Math.max(0, Math.floor(sidebarScrollTop / SIDEBAR_ITEM_HEIGHT) - SIDEBAR_OVERSCAN);
    const end = Math.min(total, start + visible + SIDEBAR_OVERSCAN * 2);
    return {
      topPadding: start * SIDEBAR_ITEM_HEIGHT,
      bottomPadding: (total - end) * SIDEBAR_ITEM_HEIGHT,
      start,
      end,
    };
  }, [blocks.length, sidebarHeight, sidebarScrollTop, SIDEBAR_ITEM_HEIGHT, SIDEBAR_OVERSCAN]);

  const visibleBlocks = useMemo(() => {
    if (blocks.length <= 60) return blocks;
    return blocks.slice(virtualWindow.start, virtualWindow.end);
  }, [blocks, virtualWindow]);

  const taskBlocks = blocks.filter((b) => b.type === 'task' || b.type === 'group');
  const completedTaskCount = taskBlocks.filter(isComplete).length;
  const completedCount = blocks.filter(isComplete).length;
  const viewedOrCompleted = Math.max(currentIndex + 1, completedCount);
  const progressWidth = blocks.length > 0 ? `${(viewedOrCompleted / blocks.length) * 100}%` : '0%';
  const requiredTasks = getRequiredTaskBlocks(blocks);
  const requiredCompleted = requiredTasks.filter((task) => Boolean(results[task.id])).length;
  const progressTimelineEntries = useMemo(() => {
    return blocks.map((block, index) => {
      const completed = isComplete(block);
      return {
        id: block.id,
        index,
        completed,
        isCurrent: index === currentIndex,
        confidence: typeof confidenceByBlock[block.id] === 'number' ? confidenceByBlock[block.id] : null,
        label: getBlockLabel(block, index),
        type: block.taskType || block.type,
      };
    });
  }, [blocks, confidenceByBlock, currentIndex]);
  const currentConfidence = current?.type === 'task'
    ? (typeof confidenceByBlock[current.id] === 'number' ? confidenceByBlock[current.id] : 0)
    : 0;

  if (blocks.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-6 text-center">
        <div className="max-w-xl border border-zinc-200 bg-white p-8">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">Lesson complete</div>
          <div className="mt-3 text-2xl font-semibold text-zinc-950">No playable blocks available</div>
          <div className="mt-3 text-sm text-zinc-500">The player did not crash. The lesson has no visible slides or tasks, so there is nothing to render.</div>
          {validation.issues.length > 0 && (
            <div className="mt-4 border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
              {validation.issues.map((issue) => <div key={issue}>{issue}</div>)}
            </div>
          )}
          <button type="button" onClick={handleExit} className="mt-5 border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white">Back to lessons</button>
        </div>
      </div>
    );
  }

  if (showGrading) {
    return (
      <GradingScreen
        lesson={lesson}
        blocks={blocks}
        results={results}
        studentName={studentName}
        onStudentNameChange={setStudentName}
        onRestart={resetSessionProgress}
        onExit={handleExit}
        onSubmitted={onSubmitted}
        mode={modeConfig.id}
        allowRestart={modeConfig.allowRestart}
        sessionMeta={{
          ...sessionMeta,
          origin: modeConfig.origin,
          mode: modeConfig.id,
          tabLeaves: interactionLog.tabLeaves,
          tabReturns: interactionLog.tabReturns,
          blurCount: interactionLog.blurCount,
          focusCount: interactionLog.focusCount,
          lastTabLeftAt: interactionLog.lastTabLeftAt,
          answerTimeline: interactionLog.answers,
          events: interactionLog.events,
          startedAt: interactionLog.startedAt,
          timeLimitMinutes: modeConfig.sessionTimeLimitMinutes,
          timeRemainingSeconds,
          timedOut: Boolean(modeConfig.sessionTimeLimitMinutes && timeRemainingSeconds === 0),
          confidenceByBlock,
          studentExperience,
          antiCheatPolicy: {
            copyPasteRestricted: modeConfig.copyPasteRestricted,
            suspiciousTabSwitchThreshold: modeConfig.suspiciousTabSwitchThreshold,
            lockOnTimeout: modeConfig.lockOnTimeout,
          },
        }}
      />
    );
  }

  return (
    <div
      ref={shellRef}
      data-lesson-theme={lesson?.settings?.theme || 'classic'}
      className={[
        'player-shell flex min-h-screen',
        studentExperience.highContrastMode ? 'player-high-contrast' : '',
        studentExperience.dyslexiaMode ? 'player-dyslexia-mode' : '',
        studentExperience.reducedMotionMode ? 'player-reduced-motion' : '',
        studentExperience.zenMode ? 'zen-mode' : '',
      ].join(' ')}
      style={playerShellStyle}
    >
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex">
          <button type="button" onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-black/20" />
          <aside
            ref={sidebarViewportRef}
            onScroll={(event) => setSidebarScrollTop(event.currentTarget.scrollTop)}
            className="relative z-10 h-full w-[min(24rem,88vw)] overflow-y-auto border-r border-zinc-200 bg-white p-4 md:w-96 md:p-5"
          >
            <div className="mb-1 text-sm font-semibold text-zinc-900">Lesson Map</div>
            <div className="mb-4 text-xs text-zinc-500">{completedTaskCount} of {taskBlocks.length} tasks completed</div>
            <div className="space-y-1.5">
              {virtualWindow.topPadding > 0 && <div style={{ height: `${virtualWindow.topPadding}px` }} />}
              {visibleBlocks.map((block, offset) => {
                const index = blocks.length <= 60 ? offset : virtualWindow.start + offset;
                const mapBackDisabled = modeConfig.disableBackNavigation && index < currentIndex;
                return (
                <button key={block.id} type="button" disabled={mapBackDisabled} onClick={() => {
                  if (mapBackDisabled) return;
                  setCurrentIndex(index);
                  setSidebarOpen(false);
                }} className={[
                  'w-full border px-3 py-2.5 text-left transition',
                  index === currentIndex ? 'border-zinc-900 bg-zinc-950 text-white' : isComplete(block) ? 'border-zinc-200 bg-zinc-50 text-zinc-500' : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
                  mapBackDisabled ? 'cursor-not-allowed opacity-40 hover:bg-white' : '',
                ].join(' ')}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.18em] opacity-60">{block.taskType || block.type}</div>
                      <div className="mt-0.5 truncate text-sm font-medium">{getBlockLabel(block, index)}</div>
                    </div>
                    {isComplete(block) && <span className="shrink-0 text-base">✓</span>}
                  </div>
                </button>
              );
              })}
              {virtualWindow.bottomPadding > 0 && <div style={{ height: `${virtualWindow.bottomPadding}px` }} />}
            </div>
          </aside>
        </div>
      )}
      <div className="flex min-h-screen w-full flex-col">
        <a href="#main-content" className="skip-nav">Skip to content</a>
        <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-4 md:px-5">
          <div className="player-frame mx-auto flex items-center gap-2 md:gap-3">
            {!modeConfig.disableBackNavigation && (
              <button type="button" onClick={goPrev} disabled={!canGoBack} className="player-nav-button border border-zinc-200 px-3 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-30" aria-label="Previous block">←</button>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-sm font-semibold text-zinc-900 md:text-base">{lesson.title}</span>
                <PrivacyDot state={mode === 'live' ? 'shared' : mode === 'practice' ? 'none' : 'local'} />
                <span className="shrink-0 text-xs text-zinc-400">{currentIndex + 1} of {blocks.length}</span>
              </div>
              {modeConfig.requireRequiredTasks && requiredTasks.length > 0 && (
                <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                  Required: {requiredCompleted}/{requiredTasks.length}
                </div>
              )}
            </div>
            {timeRemainingSeconds !== null && (
              <span className={[
                'shrink-0 text-sm font-medium',
                timeRemainingSeconds <= 10 ? 'timer-urgent timer-urgent-pulse' : timeRemainingSeconds <= 30 ? 'timer-warning' : 'timer-calm',
              ].join(' ')} aria-live="polite" aria-label={`Time remaining: ${formatCountdown(timeRemainingSeconds)}`}>
                {formatCountdown(timeRemainingSeconds)}
              </span>
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              <div className="relative">
                <button type="button" onClick={() => setShowOverflowMenu(v => !v)} className="overflow-menu-btn border border-zinc-200 px-2.5 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50" aria-label="More options" aria-expanded={showOverflowMenu}>⋮</button>
                {showOverflowMenu && (
                  <>
                    <button type="button" onClick={() => setShowOverflowMenu(false)} className="fixed inset-0 z-30" aria-label="Close menu" />
                    <div className="absolute right-0 top-full z-40 mt-1 w-56 border border-zinc-200 bg-white shadow-lg depth-2" role="menu">
                      <button type="button" role="menuitem" onClick={() => { setSidebarOpen(true); setShowOverflowMenu(false); }} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50">
                        <HamburgerIcon /> Lesson Map
                      </button>
                      <button type="button" role="menuitem" onClick={() => { setShowFontPanel(v => !v); setShowOverflowMenu(false); }} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50">
                        <span className="text-xs font-bold">Aa</span> Font Settings
                      </button>
                      <button type="button" role="menuitem" onClick={() => { setShowAccessibilityPanel(v => !v); setShowOverflowMenu(false); }} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50">
                        <span className="text-xs font-medium">A11y</span> Accessibility
                      </button>
                      <button type="button" role="menuitem" onClick={() => { setShowPlayerHotkeys(true); setShowOverflowMenu(false); }} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-50">
                        <span className="text-xs font-medium">?</span> Keyboard Shortcuts
                      </button>
                      <div className="border-t border-zinc-100" />
                      <button type="button" role="menuitem" onClick={() => { handleExit(); setShowOverflowMenu(false); }} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-zinc-500 hover:bg-zinc-50">
                        Exit Lesson
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button type="button" onClick={toggleFullscreen} className="border border-zinc-200 px-2.5 py-2 text-sm text-zinc-600 transition hover:bg-zinc-50" title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>{isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}</button>
            </div>
          </div>
        </header>
        <div className="horizon-line" />

        {showResumePrompt && (
          <div className="border-b border-zinc-200 bg-amber-50 px-3 py-3 sm:px-4 md:px-5">
            <div className="player-frame mx-auto flex flex-wrap items-center justify-between gap-3 text-sm text-amber-900">
              <div>
                <div className="text-[10px] font-medium uppercase tracking-[0.16em] text-amber-700">Session Resume</div>
                <div className="mt-1">Recovered progress from this browser: {Object.keys(results).length} answered, currently on block {Math.min(currentIndex + 1, Math.max(blocks.length, 1))}.</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowResumePrompt(false)} className="border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800">Resume</button>
                <button type="button" onClick={resetSessionProgress} className="border border-amber-700 bg-amber-700 px-3 py-1.5 text-xs font-medium text-white">Start over</button>
              </div>
            </div>
          </div>
        )}

        {policyNotice && (
          <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 sm:px-4 md:px-5">
            <div className="player-frame mx-auto text-xs text-amber-800">{policyNotice}</div>
          </div>
        )}

        {showFontPanel && (
          <div className="absolute right-3 top-14 z-50 sm:right-4 md:right-5">
            <FontSettingsPanel settings={fontSettings} onChange={setFontSettings} onClose={() => setShowFontPanel(false)} />
          </div>
        )}
        {showAccessibilityPanel && (
          <div className="absolute right-3 top-14 z-50 sm:right-4 md:right-5">
            <div className="w-72 border border-zinc-200 bg-white p-3 shadow-lg depth-2">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">Student Experience</div>
                <button type="button" onClick={() => setShowAccessibilityPanel(false)} className="text-xs text-zinc-400 hover:text-zinc-700">✕</button>
              </div>
              <div className="space-y-2 text-xs text-zinc-700">
                <label className="flex items-center justify-between gap-2"><span>High contrast</span><input type="checkbox" checked={studentExperience.highContrastMode} onChange={(event) => updateStudentExperience({ highContrastMode: event.target.checked })} /></label>
                <label className="flex items-center justify-between gap-2"><span>Dyslexia reading mode</span><input type="checkbox" checked={studentExperience.dyslexiaMode} onChange={(event) => updateStudentExperience({ dyslexiaMode: event.target.checked })} /></label>
                <label className="flex items-center justify-between gap-2"><span>Reduced motion</span><input type="checkbox" checked={studentExperience.reducedMotionMode} onChange={(event) => updateStudentExperience({ reducedMotionMode: event.target.checked })} /></label>
                <label className="flex items-center justify-between gap-2"><span>Vibration cue on submit</span><input type="checkbox" checked={studentExperience.vibrationCue} onChange={(event) => updateStudentExperience({ vibrationCue: event.target.checked })} /></label>
                <label className="flex items-center justify-between gap-2"><span>Zen mode (minimal UI)</span><input type="checkbox" checked={studentExperience.zenMode} onChange={(event) => updateStudentExperience({ zenMode: event.target.checked })} /></label>
                <label className="flex items-center justify-between gap-2"><span>Progress timeline</span><input type="checkbox" checked={studentExperience.showProgressTimeline} onChange={(event) => updateStudentExperience({ showProgressTimeline: event.target.checked })} /></label>
              </div>
              <div className="mt-3">
                <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500">Text zoom</div>
                <div className="flex gap-1">
                  {[90, 100, 115, 130].map((zoom) => (
                    <button
                      key={`zoom-${zoom}`}
                      type="button"
                      onClick={() => updateStudentExperience({ textZoomPreset: zoom })}
                      className={studentExperience.textZoomPreset === zoom ? 'flex-1 border border-zinc-900 bg-zinc-900 px-1.5 py-1 text-[10px] text-white' : 'flex-1 border border-zinc-200 px-1.5 py-1 text-[10px] text-zinc-600'}
                    >
                      {zoom}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <main id="main-content" className="flex-1 px-3 py-4 sm:px-4 sm:py-5 md:px-5 md:py-7 lg:px-6 lg:py-8 xl:py-10" {...swipeHandlers}>
          <div key={currentIndex} className={`content-island ${studentExperience.reducedMotionMode ? 'player-frame mx-auto' : 'player-frame mx-auto slide-enter'}`}>
            {current?.type === 'task' && results[current.id] && (
              <div className="ghost-watermark relative" data-ghost="Previously answered" aria-hidden="true" />
            )}
            <LessonStage blocks={blocks} currentIndex={currentIndex} results={results} onCompleteBlock={saveResult} taskOptions={{ allowRetry: modeConfig.allowRetry, showCheckButton: modeConfig.showCheckButton }} emptyMessage="This lesson ended safely because the current block is missing." />
          </div>
        </main>

        <footer className="sticky bottom-0 z-20 border-t border-zinc-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-4 md:px-5 [padding-bottom:calc(env(safe-area-inset-bottom)+0.75rem)]">
          {confidenceVisible && current?.type === 'task' && results[current.id] && (
            <div className="player-frame mx-auto mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-600 animate-soft-rise">
              <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Confidence</span>
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={`confidence-${value}`}
                  type="button"
                  aria-label={`Confidence: ${value} of 5`}
                  onClick={() => {
                    if (!current?.id) return;
                    setConfidenceByBlock((currentMap) => ({ ...currentMap, [current.id]: value }));
                    setInteractionLog((currentLog) => ({
                      ...currentLog,
                      events: [
                        ...currentLog.events,
                        {
                          type: 'confidence_set',
                          at: Date.now(),
                          blockId: current.id,
                          confidence: value,
                        },
                      ].slice(-200),
                    }));
                  }}
                  className={currentConfidence === value ? 'border border-zinc-900 bg-zinc-900 px-2 py-1 text-[10px] font-medium text-white' : 'border border-zinc-200 px-2 py-1 text-[10px] text-zinc-600 hover:border-zinc-900'}
                >
                  {value}
                </button>
              ))}
            </div>
          )}
          <div className="player-frame mx-auto flex items-center justify-center gap-3 md:gap-4">
            {!modeConfig.disableBackNavigation && <button type="button" onClick={goPrev} disabled={!canGoBack} className="player-nav-button border border-zinc-200 px-4 py-2.5 text-sm text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-30">← Back</button>}
            <button type="button" onClick={goNext} disabled={!canAdvanceCurrent} className="action-primary player-nav-button px-6 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40">{currentIndex === blocks.length - 1 ? 'Finish ✓' : 'Next →'}</button>
          </div>
          <div className="player-frame mx-auto mt-2">
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: progressWidth }} />
            </div>
          </div>
          {(currentRequiredBlocked || modeConfig.disableBackNavigation) && (
            <div className="player-frame mx-auto mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="text-zinc-500">{modeConfig.disableBackNavigation ? 'Back navigation is locked for this session.' : ''}</div>
              <div className="text-amber-700">{currentRequiredBlocked ? 'Complete this required task before continuing.' : ''}</div>
            </div>
          )}
        </footer>

        {showPlayerHotkeys && (
          <div className="fixed inset-0 z-50 bg-black/35 p-4" role="dialog" aria-modal="true" aria-label="Player shortcuts">
            <button type="button" onClick={() => setShowPlayerHotkeys(false)} className="absolute inset-0" />
            <div className="relative mx-auto mt-10 max-w-xl border border-zinc-900 bg-white p-8 sm:mt-16">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">Keyboard Shortcuts</div>
                  <div className="mt-1 text-lg font-semibold text-zinc-900">Player controls</div>
                </div>
                <button type="button" onClick={() => setShowPlayerHotkeys(false)} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-700">Close</button>
              </div>
              <div className="mt-4 space-y-2">
                {PLAYER_SHORTCUTS.map((row) => (
                  <div key={row.key} className="flex items-center justify-between gap-3 border border-zinc-200 px-3 py-2 text-xs text-zinc-700">
                    <span className="font-medium text-zinc-900">{row.key}</span>
                    <span>{row.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
