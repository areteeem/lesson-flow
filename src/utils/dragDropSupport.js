let dragGhostEl = null;

function ensureGhost() {
  if (dragGhostEl) return dragGhostEl;
  const el = document.createElement('canvas');
  el.width = 1;
  el.height = 1;
  dragGhostEl = el;
  return dragGhostEl;
}

export function configureDragStart(event, payload, mimeType = 'text/plain') {
  const dt = event?.dataTransfer;
  if (!dt) return;
  dt.effectAllowed = 'move';
  dt.dropEffect = 'move';
  dt.setData(mimeType, payload);
  try {
    dt.setDragImage(ensureGhost(), 0, 0);
  } catch {
    // Drag image customization is not supported in some browsers.
  }
}

export function readDropData(event, mimeType = 'text/plain') {
  try {
    return event?.dataTransfer?.getData(mimeType) || '';
  } catch {
    return '';
  }
}

export function normalizeDragOver(event) {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

export async function initMobileDragDropSupport() {
  if (typeof window === 'undefined') return { enabled: false, reason: 'server' };
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (!isTouch) return { enabled: false, reason: 'not-touch' };

  try {
    const [{ polyfill }, { scrollBehaviourDragImageTranslateOverride }] = await Promise.all([
      import('mobile-drag-drop'),
      import('mobile-drag-drop/scroll-behaviour'),
    ]);

    polyfill({
      dragImageTranslateOverride: scrollBehaviourDragImageTranslateOverride,
      holdToDrag: 180,
      dragStartConditionOverride: (event) => {
        const el = event?.target;
        if (!(el instanceof Element)) return true;
        return !el.closest('input, textarea, select, button[draggable="false"]');
      },
    });

    return { enabled: true };
  } catch (error) {
    return { enabled: false, reason: error?.message || 'polyfill-failed' };
  }
}
