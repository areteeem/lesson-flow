const RESPONSE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function cleanupExpiredResponses() {
  const now = Date.now();
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith('lf_live_responses_')) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        if (data?._timestamp && now - data._timestamp > RESPONSE_TTL_MS) {
          localStorage.removeItem(key);
        }
      } catch {
        localStorage.removeItem(key);
      }
    }
  }
}
