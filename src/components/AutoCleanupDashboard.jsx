import { useCallback, useEffect, useState } from 'react';

/**
 * Calculates localStorage usage for lesson-flow keys.
 * Returns { totalBytes, sessionCount, keyBreakdown }.
 */
function measureLocalStorage() {
  let totalBytes = 0;
  let sessionCount = 0;
  const keyBreakdown = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const value = localStorage.getItem(key) || '';
    const bytes = new Blob([key + value]).size;
    totalBytes += bytes;

    if (key.startsWith('lf_live_responses_')) {
      sessionCount++;
      keyBreakdown.push({ key, bytes, type: 'live_response' });
    } else if (key.startsWith('lf-player-') || key.startsWith('lf_')) {
      keyBreakdown.push({ key, bytes, type: 'app_data' });
    }
  }

  return { totalBytes, sessionCount, keyBreakdown };
}

/**
 * Clears all lesson-flow related localStorage entries except user preferences.
 * Returns number of keys removed.
 */
function clearAllSessionData() {
  const preserveKeys = new Set([
    'lf_theme',
    'lf_debug_mode',
    'lesson-flow-player-student-experience-v1',
    'lesson-flow-app-settings',
    'lesson-flow-favorites',
  ]);

  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.startsWith('lf_') || key.startsWith('lf-player-') || key.startsWith('lesson-flow-recent-')) {
      if (!preserveKeys.has(key)) {
        toRemove.push(key);
      }
    }
  }

  toRemove.forEach((key) => localStorage.removeItem(key));
  return toRemove.length;
}

/**
 * Formats bytes to a human-readable string.
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * AutoCleanupDashboard — shows device storage usage and cleanup controls.
 *
 * Designed to be embedded in a settings page or as a standalone panel.
 * Fully self-contained with no external dependencies beyond React.
 */
export default function AutoCleanupDashboard() {
  const [stats, setStats] = useState(() => measureLocalStorage());
  const [lastCleanup, setLastCleanup] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const refresh = useCallback(() => {
    setStats(measureLocalStorage());
  }, []);

  // Refresh stats on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    const removed = clearAllSessionData();
    setLastCleanup({ removed, at: Date.now() });
    setConfirmClear(false);
    refresh();
  };

  return (
    <div className="cleanup-card">
      <div className="type-caption mb-3" style={{ color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Device Storage
      </div>

      <div className="cleanup-stat">
        <span style={{ color: 'var(--color-text-secondary)' }}>Total stored data</span>
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{formatBytes(stats.totalBytes)}</span>
      </div>

      <div className="cleanup-stat">
        <span style={{ color: 'var(--color-text-secondary)' }}>Live session records</span>
        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{stats.sessionCount}</span>
      </div>

      {lastCleanup && (
        <div className="mt-2 text-xs animate-soft-rise" style={{ color: 'var(--color-correct-text)' }}>
          {lastCleanup.removed} item{lastCleanup.removed !== 1 ? 's' : ''} cleaned up.
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleClear}
          className={confirmClear ? 'action-primary px-3 py-1.5 text-xs' : 'action-secondary px-3 py-1.5 text-xs'}
        >
          {confirmClear ? 'Confirm clear' : 'Clear all session data'}
        </button>
        {confirmClear && (
          <button
            type="button"
            onClick={() => setConfirmClear(false)}
            className="action-secondary px-3 py-1.5 text-xs"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

export { measureLocalStorage, clearAllSessionData, formatBytes };
