/**
 * SessionWarmth — engagement gauge for live sessions.
 *
 * Shows a color-coded indicator based on response rate:
 *   Cold    (< 30%) — "Waiting for responses..."
 *   Warming (30–70%) — "Most students are working..."
 *   Hot     (> 70%) — "Almost everyone answered!"
 *
 * Props:
 *   responded — number of students who answered
 *   total     — total number of students
 */
export default function SessionWarmth({ responded = 0, total = 0 }) {
  if (total <= 0) return null;

  const pct = Math.round((responded / total) * 100);
  let tier, label;

  if (pct >= 70) {
    tier = 'warmth-hot';
    label = 'Almost everyone answered!';
  } else if (pct >= 30) {
    tier = 'warmth-warming';
    label = 'Most students are working...';
  } else {
    tier = 'warmth-cold';
    label = 'Waiting for responses...';
  }

  return (
    <div className={`warmth-indicator ${tier}`} role="status" aria-label={`${pct}% responded — ${label}`}>
      <span className="warmth-dot" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
