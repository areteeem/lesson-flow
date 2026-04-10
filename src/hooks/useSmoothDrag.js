import { useCallback, useRef, useState } from 'react';

/**
 * Shared hook for smooth drag-and-drop interactions across all task types.
 * Provides mobile tap-to-place detection, drag state tracking, and reduced-motion detection.
 */
export function useSmoothDrag({ disabled = false } = {}) {
  const [draggedItem, setDraggedItem] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [hoveredTarget, setHoveredTarget] = useState(null);
  const [preferTap, setPreferTap] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  });
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  });

  const dragRef = useRef(null);

  // Listen for media query changes (call in useEffect)
  const setupMediaListeners = useCallback(() => {
    if (typeof window === 'undefined') return () => {};
    const coarseQuery = window.matchMedia('(pointer: coarse)');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateCoarse = () => setPreferTap(coarseQuery.matches);
    const updateMotion = () => setReducedMotion(motionQuery.matches);
    updateCoarse();
    updateMotion();
    coarseQuery.addEventListener?.('change', updateCoarse);
    motionQuery.addEventListener?.('change', updateMotion);
    return () => {
      coarseQuery.removeEventListener?.('change', updateCoarse);
      motionQuery.removeEventListener?.('change', updateMotion);
    };
  }, []);

  const clearSelection = useCallback(() => {
    setDraggedItem(null);
    setSelectedItem(null);
    setHoveredTarget(null);
  }, []);

  const selectItem = useCallback((item) => {
    if (disabled) return;
    setSelectedItem((prev) => (prev?.id === item.id ? null : item));
  }, [disabled]);

  const startDrag = useCallback((item) => {
    if (disabled) return;
    setDraggedItem(item);
    setSelectedItem(item);
  }, [disabled]);

  const endDrag = useCallback(() => {
    setDraggedItem(null);
    setHoveredTarget(null);
  }, []);

  // Spring config for motion animations
  const springConfig = reducedMotion
    ? { duration: 0.01 }
    : { type: 'spring', stiffness: 500, damping: 30, mass: 0.8 };

  const gentleSpring = reducedMotion
    ? { duration: 0.01 }
    : { type: 'spring', stiffness: 300, damping: 25, mass: 1 };

  const quickSpring = reducedMotion
    ? { duration: 0.01 }
    : { type: 'spring', stiffness: 700, damping: 35, mass: 0.5 };

  return {
    draggedItem,
    selectedItem,
    hoveredTarget,
    preferTap,
    reducedMotion,
    dragRef,
    springConfig,
    gentleSpring,
    quickSpring,
    setDraggedItem,
    setSelectedItem,
    setHoveredTarget,
    setupMediaListeners,
    clearSelection,
    selectItem,
    startDrag,
    endDrag,
  };
}

/** Shared animation variants for draggable items */
export const dragItemVariants = {
  initial: { opacity: 0, scale: 0.8, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.8, y: -8 },
  dragging: { scale: 1.05, boxShadow: '0 12px 32px rgba(0,0,0,0.12)', rotate: 1.5 },
  placed: { scale: 1, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', rotate: 0 },
};

/** Shared animation variants for drop zones */
export const dropZoneVariants = {
  idle: { scale: 1, borderColor: 'rgba(212,212,216,1)' },
  hover: { scale: 1.02, borderColor: 'rgba(24,24,27,1)' },
  active: { scale: 1.04, borderColor: 'rgba(24,24,27,1)', backgroundColor: 'rgba(250,250,250,1)' },
};

/** Verdict animation variants */
export const verdictVariants = {
  correct: {
    scale: [1, 1.06, 1],
    transition: { duration: 0.35 },
  },
  incorrect: {
    x: [0, -6, 6, -4, 4, 0],
    transition: { duration: 0.4 },
  },
};
