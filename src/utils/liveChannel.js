import {
  getLiveChannelName,
  getLiveTransportMode,
  supportsLocalLiveTransport,
  supportsSupabaseLiveTransport,
} from './liveTransport.js';
import { getSupabaseClient, getSupabaseConfig } from './supabaseClient.js';
import { ensureLiveUser, persistLivePayload } from './liveSupabaseData.js';

const DEV_PROXY_BASE = '/__supabase';

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
      if (realtimeChannel) client.removeChannel(realtimeChannel);
    },
  };

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
        // Try proxy fallback for browser fetch errors
        if ((error.message || '').toLowerCase().includes('failed to fetch')) {
          try {
            const proxyResponse = await fetch(`${DEV_PROXY_BASE}/rest/v1/live_events`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: getSupabaseConfig().anonKey,
                Authorization: `Bearer ${getSupabaseConfig().anonKey}`,
                Prefer: 'return=minimal',
              },
              body: JSON.stringify(envelope),
            });
            if (!proxyResponse.ok) {
              onStatus?.({ state: 'error', mode: 'supabase', error: `Live event failed (HTTP ${proxyResponse.status})` });
            }
          } catch (proxyError) {
            onStatus?.({ state: 'error', mode: 'supabase', error: error.message || 'Failed to write live event.' });
          }
        } else {
          onStatus?.({ state: 'error', mode: 'supabase', error: error.message || 'Failed to write live event.' });
        }
      }
    } catch (error) {
      onStatus?.({ state: 'error', mode: 'supabase', error: error?.message || 'Failed to write live event.' });
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

    realtimeChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        isReady = true;
        onStatus?.({ state: 'connected', mode: 'supabase' });
        while (queue.length > 0) {
          const next = queue.shift();
          void publishEvent(next);
        }
      }
      if (status === 'CHANNEL_ERROR') {
        onStatus?.({ state: 'error', mode: 'supabase', error: 'Supabase realtime channel error.' });
      }
      if (status === 'TIMED_OUT') {
        onStatus?.({ state: 'error', mode: 'supabase', error: 'Supabase realtime channel timed out.' });
      }
      if (status === 'CLOSED' && !isClosed) {
        onStatus?.({ state: 'disconnected', mode: 'supabase' });
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
      ? 'Supabase transport is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
      : 'No supported live transport is available.',
  });
  return null;
}
