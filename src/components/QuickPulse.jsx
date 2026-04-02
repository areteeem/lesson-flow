import { useCallback, useEffect, useState } from 'react';

const PULSE_OPTIONS = [
  { id: 'thumbsup', emoji: '👍', label: 'Got it' },
  { id: 'thumbsdown', emoji: '👎', label: 'Lost' },
  { id: 'confused', emoji: '😕', label: 'Confused' },
];

const AUTO_DISMISS_MS = 6000;

/**
 * QuickPulse — a one-tap engagement check for live sessions.
 *
 * Props:
 *   mode        — 'host' | 'student'
 *   onSend      — (optionId: string) => void  (student sends vote)
 *   onDismiss   — () => void                  (host closes)
 *   votes       — { thumbsup: number, thumbsdown: number, confused: number }
 *   totalVoters — number
 */
export default function QuickPulse({ mode = 'student', onSend, onDismiss, votes = {}, totalVoters = 0 }) {
  const [voted, setVoted] = useState(null);
  const [autoDismiss, setAutoDismiss] = useState(null);

  const handleVote = useCallback((optionId) => {
    if (voted) return;
    setVoted(optionId);
    onSend?.(optionId);
  }, [voted, onSend]);

  // Auto-dismiss results after timeout
  useEffect(() => {
    if (mode !== 'host' || !totalVoters) return undefined;
    const timer = window.setTimeout(() => {
      onDismiss?.();
    }, AUTO_DISMISS_MS);
    setAutoDismiss(timer);
    return () => window.clearTimeout(timer);
  }, [mode, totalVoters, onDismiss]);

  // Host view: show results bar chart
  if (mode === 'host' && totalVoters > 0) {
    const maxVotes = Math.max(1, ...PULSE_OPTIONS.map((o) => votes[o.id] || 0));
    return (
      <div className="pulse-overlay" onClick={onDismiss} role="dialog" aria-modal="true" aria-label="Quick Pulse results">
        <div className="pulse-card" onClick={(e) => e.stopPropagation()}>
          <div className="type-caption mb-3" style={{ color: 'var(--color-text-tertiary)' }}>QUICK PULSE — {totalVoters} response{totalVoters !== 1 ? 's' : ''}</div>
          <div className="space-y-2">
            {PULSE_OPTIONS.map((option) => {
              const count = votes[option.id] || 0;
              const pct = totalVoters > 0 ? Math.round((count / totalVoters) * 100) : 0;
              return (
                <div key={option.id} className="flex items-center gap-2">
                  <span className="w-8 text-center text-lg">{option.emoji}</span>
                  <div className="flex-1">
                    <div className="pulse-results-bar" style={{ width: `${(count / maxVotes) * 100}%`, background: 'var(--sage-500)', opacity: 0.7 }} />
                  </div>
                  <span className="w-12 text-right text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{pct}%</span>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={onDismiss} className="action-secondary mt-4 px-4 py-2 text-xs">Dismiss</button>
        </div>
      </div>
    );
  }

  // Student view: vote buttons
  return (
    <div className="pulse-overlay" role="dialog" aria-modal="true" aria-label="Quick Pulse — how are you feeling?">
      <div className="pulse-card">
        <div className="type-caption mb-1" style={{ color: 'var(--color-text-tertiary)' }}>QUICK CHECK</div>
        <div className="type-heading mb-4" style={{ color: 'var(--color-text-primary)' }}>How are you feeling?</div>
        {voted ? (
          <div className="text-sm animate-soft-rise" style={{ color: 'var(--color-text-secondary)' }}>
            Thanks! Your response was recorded.
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3">
            {PULSE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="pulse-btn"
                onClick={() => handleVote(option.id)}
                aria-label={option.label}
              >
                <span className="pulse-emoji">{option.emoji}</span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export { PULSE_OPTIONS };
