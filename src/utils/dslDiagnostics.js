export function getDslIssueSeverity(message) {
  const lower = String(message || '').toLowerCase();
  if (lower.includes('failed to parse') || lower.includes('parse error') || lower.includes('missing required') || lower.includes(' is not in options') || lower.includes(' is not one of the options')) {
    return 'error';
  }
  if (lower.includes('unknown') || lower.includes('ignored') || lower.includes('has no') || lower.includes('auto-repair incomplete')) {
    return 'warning';
  }
  return 'info';
}

export function getBlockingDslIssues(warnings = []) {
  return warnings.filter((message) => getDslIssueSeverity(message) === 'error');
}

export function summarizeDslIssues(warnings = [], limit = 3) {
  const visible = warnings.filter(Boolean).slice(0, Math.max(1, limit));
  if (visible.length === 0) return '';
  if (warnings.length <= visible.length) return visible.join(' ');
  return `${visible.join(' ')} (+${warnings.length - visible.length} more)`;
}