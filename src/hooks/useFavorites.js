import { useCallback, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'lesson-flow-favorites';

let cache = null;

function read() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { cache = []; }
  return cache;
}

const listeners = new Set();
function subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); }
function notify() { listeners.forEach((cb) => cb()); }

function getSnapshot() { return read(); }

export default function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, getSnapshot);

  const toggle = useCallback((type) => {
    const current = read();
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
    cache = next;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    notify();
  }, []);

  const isFavorite = useCallback((type) => read().includes(type), [favorites]);

  return { favorites, toggle, isFavorite };
}
