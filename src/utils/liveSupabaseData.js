import { getSupabaseClient } from './supabaseClient.js';

async function upsertParticipant(client, payload) {
  const row = {
    session_id: payload.sessionId,
    player_id: payload.playerId,
    role: payload.role || 'student',
    name: payload.name || 'Student',
    status: payload.status || 'active',
    last_seen_at: new Date().toISOString(),
  };
  await client.from('live_participants').upsert(row, { onConflict: 'session_id,player_id' });
}

async function upsertSessionSnapshot(client, payload) {
  const row = {
    session_id: payload.sessionId,
    host_player_id: payload.hostPlayerId || null,
    phase: payload.phase || 'lobby',
    current_index: Number(payload.currentIndex) || 0,
    lesson_payload: payload.lesson || null,
    revision: Number(payload.revision) || 0,
    last_sync_at: new Date().toISOString(),
  };
  await client.from('live_sessions').upsert(row, { onConflict: 'session_id' });
}

async function upsertResponse(client, payload) {
  const row = {
    session_id: payload.sessionId,
    player_id: payload.playerId,
    block_id: payload.blockId,
    result_payload: payload.result || null,
    updated_at: new Date().toISOString(),
  };
  await client.from('live_responses').upsert(row, { onConflict: 'session_id,player_id,block_id' });
}

async function upsertManualScore(client, payload) {
  const row = {
    session_id: payload.sessionId,
    player_id: payload.playerId,
    block_id: payload.blockId,
    points: Number(payload.points) || 0,
    updated_at: new Date().toISOString(),
  };
  await client.from('live_manual_scores').upsert(row, { onConflict: 'session_id,player_id,block_id' });
}

async function markParticipantLeft(client, payload) {
  await client
    .from('live_participants')
    .update({ status: 'left', last_seen_at: new Date().toISOString() })
    .eq('session_id', payload.sessionId)
    .eq('player_id', payload.playerId);
}

export async function ensureLiveUser({ playerId, name }) {
  const client = getSupabaseClient();
  if (!client || !playerId) return null;

  let userId = String(playerId);
  try {
    const current = await client.auth.getUser();
    if (!current?.data?.user) {
      const signedIn = await client.auth.signInAnonymously();
      if (signedIn?.data?.user?.id) userId = signedIn.data.user.id;
    } else if (current.data.user.id) {
      userId = current.data.user.id;
    }
  } catch {
    // Continue with local player id if anonymous auth is not enabled.
  }

  try {
    await client.from('live_users').upsert({
      user_id: userId,
      display_name: name || 'Student',
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch {
    // Keep live sync working even if profile write fails.
  }

  return userId;
}

export async function persistLivePayload(payload, role = 'student') {
  const client = getSupabaseClient();
  if (!client || !payload?.type || !payload?.sessionId) return;

  try {
    if (payload.type === 'join') {
      await upsertParticipant(client, {
        sessionId: payload.sessionId,
        playerId: payload.playerId,
        role: 'student',
        name: payload.name,
        status: 'active',
      });
      return;
    }

    if (payload.type === 'join_ack' && payload.playerId) {
      await upsertParticipant(client, {
        sessionId: payload.sessionId,
        playerId: payload.playerId,
        role: 'student',
        name: payload.name,
        status: 'active',
      });
      return;
    }

    if (payload.type === 'sync' && role === 'host') {
      await upsertSessionSnapshot(client, {
        sessionId: payload.sessionId,
        hostPlayerId: payload.playerId,
        phase: payload.phase,
        currentIndex: payload.currentIndex,
        lesson: payload.lesson,
        revision: payload.revision,
      });
      return;
    }

    if (payload.type === 'student_heartbeat' && payload.playerId) {
      await upsertParticipant(client, {
        sessionId: payload.sessionId,
        playerId: payload.playerId,
        role: 'student',
        name: payload.name,
        status: 'active',
      });
      return;
    }

    if (payload.type === 'response_update' && payload.playerId && payload.blockId) {
      await upsertResponse(client, payload);
      return;
    }

    if (payload.type === 'leave' && payload.playerId) {
      await markParticipantLeft(client, payload);
      return;
    }

    if (payload.type === 'host-exit') {
      await client
        .from('live_sessions')
        .update({ phase: 'finished', last_sync_at: new Date().toISOString() })
        .eq('session_id', payload.sessionId);
    }
  } catch {
    // Data persistence should never crash transport.
  }
}

export async function persistManualScore({ sessionId, playerId, blockId, points }) {
  const client = getSupabaseClient();
  if (!client || !sessionId || !playerId || !blockId) return;
  try {
    await upsertManualScore(client, { sessionId, playerId, blockId, points });
  } catch {
    // Keep host grading UI responsive even if write fails.
  }
}

export async function deleteManualScores({ sessionId, playerId, blockId }) {
  const client = getSupabaseClient();
  if (!client || !sessionId) return;

  try {
    let query = client
      .from('live_manual_scores')
      .delete()
      .eq('session_id', sessionId);

    if (playerId) query = query.eq('player_id', playerId);
    if (blockId) query = query.eq('block_id', blockId);

    await query;
  } catch {
    // Keep host grading UI responsive even if delete fails.
  }
}

export async function fetchManualScores(sessionId) {
  const client = getSupabaseClient();
  if (!client || !sessionId) return {};

  try {
    const { data, error } = await client
      .from('live_manual_scores')
      .select('player_id,block_id,points')
      .eq('session_id', sessionId);

    if (error || !Array.isArray(data)) return {};
    return data.reduce((acc, row) => {
      const playerId = String(row.player_id || '');
      const blockId = String(row.block_id || '');
      if (!playerId || !blockId) return acc;
      const points = Number(row.points);
      if (!Number.isFinite(points)) return acc;
      if (!acc[playerId]) acc[playerId] = {};
      acc[playerId][blockId] = points;
      return acc;
    }, {});
  } catch {
    return {};
  }
}

export async function fetchSessionResponses(sessionId) {
  const client = getSupabaseClient();
  if (!client || !sessionId) return {};

  try {
    const { data, error } = await client
      .from('live_responses')
      .select('player_id,block_id,result_payload,updated_at')
      .eq('session_id', sessionId);

    if (error || !Array.isArray(data)) return {};

    return data.reduce((acc, row) => {
      const playerId = String(row.player_id || '');
      const blockId = String(row.block_id || '');
      if (!playerId || !blockId) return acc;
      if (!acc[playerId]) acc[playerId] = {};
      acc[playerId][blockId] = {
        ...(row.result_payload || {}),
        savedAt: row.updated_at || null,
      };
      return acc;
    }, {});
  } catch {
    return {};
  }
}

export async function fetchStudentResponses(sessionId, playerId) {
  const client = getSupabaseClient();
  if (!client || !sessionId || !playerId) return {};

  try {
    const { data, error } = await client
      .from('live_responses')
      .select('block_id,result_payload,updated_at')
      .eq('session_id', sessionId)
      .eq('player_id', playerId);

    if (error || !Array.isArray(data)) return {};
    return data.reduce((acc, row) => {
      const blockId = String(row.block_id || '');
      if (!blockId) return acc;
      acc[blockId] = {
        ...(row.result_payload || {}),
        savedAt: row.updated_at || null,
      };
      return acc;
    }, {});
  } catch {
    return {};
  }
}
