import { useState } from 'react';

const STATE_META = {
  local:  { color: 'var(--color-correct-icon)', label: 'Session data stays on your device' },
  shared: { color: '#5B7C8B',                   label: 'Connected to teacher — answers shared' },
  none:   { color: '#8B8B85',                   label: 'No data collected' },
};

export default function PrivacyDot({ state = 'none' }) {
  const [showTip, setShowTip] = useState(false);
  const meta = STATE_META[state] || STATE_META.none;

  return (
    <span className="relative inline-flex items-center">
      <span
        className="privacy-dot"
        data-state={state}
        role="status"
        aria-label={meta.label}
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        onClick={() => setShowTip(v => !v)}
      />
      {showTip && (
        <span
          className="absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap px-2.5 py-1 text-xs depth-2"
          style={{
            background: 'var(--color-bg-card)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-subtle)',
            zIndex: 'var(--z-tooltip)',
          }}
        >
          {meta.label}
        </span>
      )}
    </span>
  );
}
