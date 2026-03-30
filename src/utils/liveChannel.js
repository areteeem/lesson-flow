import {
  getLiveChannelName,
  getLiveTransportMode,
  supportsLocalLiveTransport,
  supportsSupabaseLiveTransport,
} from './liveTransport.js';
import { getSupabaseClient, getSupabaseConfig } from './supabaseClient.js';
import { ensureLiveUser, persistLivePayload } from './liveSupabaseData.js';

const DEV_PROXY_BASE = '/__supabase';
const CAN_USE_DEV_PROXY = Boolean(import.meta.env.DEV);

async function buildSupabaseHeaders(client, extra = {}) {
  const { anonKey } = getSupabaseConfig();
  let accessToken = anonKey;

  try {
    const { data } = await client.auth.getSession();
    if (data?.session?.access_token) {
      accessToken = data.session.access_token;
    }
  } catch {
    // Fall back to anon key for diagnostics and degraded connectivity modes.
  }

  return {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
    ...extra,
  };
}

async function fetchSupabaseWithFallback(path, options = {}) {
  const { url } = getSupabaseConfig();
  const directUrl = `${url}${path}`;

  try {
    const response = await fetch(directUrl, options);
    return { response, path: 'direct' };
  } catch (directError) {
    if (!CAN_USE_DEV_PROXY) {
      throw directError;
    }
    const proxyUrl = `${DEV_PROXY_BASE}${path}`;
    const response = await fetch(proxyUrl, options);
    return { response, path: 'proxy', directError };
  }
}

function createLocalChannel({ sessionId, onStatus }) {
  if (!supportsLocalLiveTransport()) return null;
  const channel = new BroadcastChannel(getLiveChannelName(sessionId));
  const wrapper = {
    mode: 'broadcast-local',
    onmessage: null,
    postMessage(message) {
      channel.postMessage({ ...message, sessionId: message?.sessionId || sessionId });
    },
    close() {
      onStatus?.({ state: 'disconnected', mode: 'broadcast-local' });
      channel.close();
    },
  };

  channel.onmessage = (event) => {
    wrapper.onmessage?.({ data: event.data });
  };

  onStatus?.({ state: 'connected', mode: 'broadcast-local' });
  return wrapper;
}

function createSupabaseChannel({ sessionId, role, playerId, name, onStatus }) {
  if (!supportsSupabaseLiveTransport()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const senderClientId = crypto.randomUUID();
  const queue = [];
  let isReady = false;
  let isClosed = false;
  let realtimeChannel = null;
  let pollTimerId = null;
  let subscribeTimeoutId = null;
  let usingPolling = false;
  let lastSeenEventId = 0;

  const wrapper = {
    mode: 'supabase',
    onmessage: null,
    postMessage(message) {
      const payload = {
        ...message,
        sessionId: message?.sessionId || sessionId,
        playerId: message?.playerId || playerId || '',
        name: message?.name || name || '',
      };

      if (!isReady) {
        queue.push(payload);
        return;
      }

      void publishEvent(payload);
    },
    close() {
      isClosed = true;
      onStatus?.({ state: 'disconnected', mode: 'supabase' });
      if (pollTimerId) {
        window.clearInterval(pollTimerId);
        pollTimerId = null;
      }
      if (subscribeTimeoutId) {
        window.clearTimeout(subscribeTimeoutId);
        subscribeTimeoutId = null;
      }
      if (realtimeChannel) client.removeChannel(realtimeChannel);
    },
  };

  function flushQueue() {
    while (queue.length > 0) {
      const next = queue.shift();
      void publishEvent(next);
    }
  }

  async function publishEventViaRest(envelope) {
    const headers = await buildSupabaseHeaders(client, {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    });
    const { response, path } = await fetchSupabaseWithFallback('/rest/v1/live_events', {
      method: 'POST',
      headers,
      body: JSON.stringify(envelope),
    });

    if (!response.ok) {
      onStatus?.({ state: 'error', mode: 'supabase', error: `Live event failed via ${path} (HTTP ${response.status})` });
      return;
    }
  }

  async function pollLiveEvents() {
    const headers = await buildSupabaseHeaders(client);
    const params = new URLSearchParams();
    params.set('select', 'id,payload,sender_client_id');
    params.set('session_id', `eq.${sessionId}`);
    params.set('order', 'id.asc');
    params.set('limit', '60');
    if (lastSeenEventId > 0) {
      params.set('id', `gt.${lastSeenEventId}`);
    }

    const { response } = await fetchSupabaseWithFallback(`/rest/v1/live_events?${params.toString()}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) return;

    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) return;

    for (const row of rows) {
      if (Number(row?.id || 0) > lastSeenEventId) {
        lastSeenEventId = Number(row.id || lastSeenEventId);
      }
      if (!row || row.sender_client_id === senderClientId) continue;
      wrapper.onmessage?.({ data: row.payload || null });
    }
  }

  async function primePollingCursor() {
    const headers = await buildSupabaseHeaders(client);
    const params = new URLSearchParams();
    params.set('select', 'id');
    params.set('session_id', `eq.${sessionId}`);
    params.set('order', 'id.desc');
    params.set('limit', '1');

    const { response } = await fetchSupabaseWithFallback(`/rest/v1/live_events?${params.toString()}`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) return;

    const rows = await response.json();
    if (Array.isArray(rows) && rows[0]?.id) {
      lastSeenEventId = Number(rows[0].id) || 0;
    }
  }

  async function startPollingFallback(reason) {
    if (isClosed || usingPolling) return;
    usingPolling = true;
    isReady = true;

    onStatus?.({
      state: 'connected',
      mode: 'supabase',
      detail: `Realtime unavailable, fallback polling enabled (${reason}).`,
    });

    try {
      await primePollingCursor();
      await pollLiveEvents();
    } catch {
      // Ignore initial polling failures; interval will retry.
    }

    flushQueue();

    pollTimerId = window.setInterval(() => {
      if (isClosed) return;
      void pollLiveEvents();
    }, 1500);
  }

  async function publishEvent(payload) {
    await persistLivePayload(payload, role || 'student');

    const envelope = {
      session_id: payload.sessionId,
      event_type: payload.type || 'event',
      payload,
      sender_client_id: senderClientId,
      sender_player_id: payload.playerId || null,
      created_at: new Date().toISOString(),
    };

    try {
      const { error } = await client.from('live_events').insert(envelope);
      if (error) {
        if ((error.message || '').toLowerCase().includes('failed to fetch')) {
          await publishEventViaRest(envelope);
          return;
        }
        onStatus?.({ state: 'error', mode: 'supabase', error: error.message || 'Failed to write live event.' });
      }
    } catch (error) {
      try {
        await publishEventViaRest(envelope);
      } catch {
        onStatus?.({ state: 'error', mode: 'supabase', error: error?.message || 'Failed to write live event.' });
      }
    }
  }

  async function setup() {
    onStatus?.({ state: 'connecting', mode: 'supabase' });

    await ensureLiveUser({ playerId, name });
    if (isClosed) return;

    realtimeChannel = client
      .channel(`live-events-${sessionId}-${senderClientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'live_events',
          filter: `session_id=eq.${sessionId}`,
        },
        (event) => {
          const row = event.new;
          if (!row || row.sender_client_id === senderClientId) return;
          wrapper.onmessage?.({ data: row.payload || null });
        }
      );

    subscribeTimeoutId = window.setTimeout(() => {
      void startPollingFallback('subscribe-timeout');
    }, 6500);

    realtimeChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        if (subscribeTimeoutId) {
          window.clearTimeout(subscribeTimeoutId);
          subscribeTimeoutId = null;
        }
        if (pollTimerId) {
          window.clearInterval(pollTimerId);
          pollTimerId = null;
        }
        usingPolling = false;
        isReady = true;
        onStatus?.({ state: 'connected', mode: 'supabase' });
        flushQueue();
      }
      if (status === 'CHANNEL_ERROR') {
        onStatus?.({ state: 'error', mode: 'supabase', error: 'Supabase realtime channel error. Switching to polling fallback.' });
        void startPollingFallback('channel-error');
      }
      if (status === 'TIMED_OUT') {
        onStatus?.({ state: 'error', mode: 'supabase', error: 'Supabase realtime channel timed out. Switching to polling fallback.' });
        void startPollingFallback('channel-timeout');
      }
      if (status === 'CLOSED' && !isClosed) {
        onStatus?.({ state: 'disconnected', mode: 'supabase' });
        void startPollingFallback('channel-closed');
      }
    });
  }

  void setup();
  return wrapper;
}

export function createLiveChannel({
  sessionId,
  role = 'student',
  playerId = '',
  name = '',
  search = typeof window !== 'undefined' ? window.location.search : '',
  onStatus,
} = {}) {
  const mode = getLiveTransportMode(search);

  if ((mode === 'supabase' || mode === 'auto')) {
    const supabaseChannel = createSupabaseChannel({ sessionId, role, playerId, name, onStatus });
    if (supabaseChannel) return supabaseChannel;
  }

  if (mode !== 'supabase') {
    const localChannel = createLocalChannel({ sessionId, onStatus });
    if (localChannel) return localChannel;
  }

  onStatus?.({
    state: 'unavailable',
    mode,
    error: mode === 'supabase'
      ? 'Supabase transport is unavailable. Check env keys, network access, and dev proxy restart.'
      : 'No supported live transport is available.',
  });
  return null;
}
