const SESSION_PARAM_KEYS = ['session', 'pin', 'sid'];
const TRANSPORT_PARAM_KEYS = ['transport', 'liveTransport'];

function normalizeTransportMode(mode) {
  const value = String(mode || '').trim().toLowerCase();
  if (value === 'supabase' || value === 'sb') return 'supabase';
  if (value === 'local' || value === 'broadcast' || value === 'broadcast-local') return 'local';
  if (value === 'auto') return 'auto';
  return '';
}

function getQueryParamValue(search, keys) {
  try {
    const params = new URLSearchParams(search || '');
    for (const key of keys) {
      const value = (params.get(key) || '').trim();
      if (value) return value;
    }
  } catch {
    return '';
  }
  return '';
}

export function supportsLocalLiveTransport() {
  return typeof window !== 'undefined' && typeof window.BroadcastChannel !== 'undefined';
}

export function supportsSupabaseLiveTransport() {
  const url = String(import.meta.env?.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(import.meta.env?.VITE_SUPABASE_ANON_KEY || '').trim();
  return typeof window !== 'undefined' && typeof window.WebSocket !== 'undefined' && Boolean(url) && Boolean(anonKey);
}

export function getLiveTransportMode(search = '') {
  const queryValue = normalizeTransportMode(getQueryParamValue(search, TRANSPORT_PARAM_KEYS));
  if (queryValue) return queryValue;
  const envValue = normalizeTransportMode(import.meta.env?.VITE_LIVE_TRANSPORT);
  if (envValue) return envValue;
  return 'auto';
}

export function supportsConfiguredLiveTransport(search = '') {
  const mode = getLiveTransportMode(search);
  if (mode === 'supabase') return supportsSupabaseLiveTransport();
  if (mode === 'local') return supportsLocalLiveTransport();
  return supportsSupabaseLiveTransport() || supportsLocalLiveTransport();
}

export function getLiveTransportLabel(search = '') {
  const mode = getLiveTransportMode(search);
  if (mode === 'supabase') return 'supabase';
  if (mode === 'local') return 'broadcast-local';
  if (supportsSupabaseLiveTransport()) return 'supabase';
  return 'broadcast-local';
}

export function createLiveSessionId() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function getLiveSessionIdFromSearch(search = '') {
  return getQueryParamValue(search, SESSION_PARAM_KEYS);
}

export function getLiveChannelName(sessionId) {
  return `live-session-${sessionId}`;
}

export function buildLiveJoinUrl(sessionId) {
  const params = new URLSearchParams();
  params.set('session', String(sessionId || ''));

  const mode = getLiveTransportMode(typeof window !== 'undefined' ? window.location.search : '');
  if (mode === 'supabase') params.set('transport', 'supabase');

  if (typeof window === 'undefined') return `/live/join?${params.toString()}`;
  return `${window.location.origin}/live/join?${params.toString()}`;
}

export function buildLiveQrUrl(joinUrl) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}`;
}
