import { getSessionUser } from './accountAuth';
import { loadAppSettings } from './appSettings';
import { buildAccountSnapshot, applyAccountSnapshot, getActiveAccountScopeId } from './accountStorage';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

const ACCOUNT_SYNC_STATUS_KEY = 'lesson-flow-account-sync-status';

function safeWriteStatus(status) {
  try {
    localStorage.setItem(ACCOUNT_SYNC_STATUS_KEY, JSON.stringify(status));
  } catch {
    // Ignore storage failures.
  }
}

export function readAccountSyncStatus() {
  try {
    const raw = localStorage.getItem(ACCOUNT_SYNC_STATUS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function isCloudSyncEnabled() {
  const settings = loadAppSettings();
  return settings.cloudSyncEnabled !== false;
}

export function getAccountSyncAvailability() {
  const user = getSessionUser();

  if (!user?.id) {
    return { available: false, reason: 'no_session' };
  }
  if (user.isAnonymous) {
    return { available: false, reason: 'anonymous_account' };
  }
  if (!isCloudSyncEnabled()) {
    return { available: false, reason: 'cloud_sync_disabled' };
  }
  if (!isSupabaseConfigured()) {
    return { available: false, reason: 'supabase_unconfigured' };
  }
  const client = getSupabaseClient();
  if (!client) {
    return { available: false, reason: 'client_unavailable' };
  }

  return { available: true, reason: 'ready' };
}

function normalizeDomainEnvelope(envelope, defaultValue) {
  if (envelope && typeof envelope === 'object' && Object.prototype.hasOwnProperty.call(envelope, 'data')) {
    return {
      data: envelope.data ?? defaultValue,
      updatedAt: Number(envelope.updatedAt || 0),
    };
  }
  if (typeof envelope === 'undefined') {
    return {
      data: defaultValue,
      updatedAt: 0,
    };
  }
  return {
    data: envelope,
    updatedAt: 0,
  };
}

function mergeSnapshots(localSnapshot, remoteSnapshot) {
  const defaults = {
    lessons: [],
    sessions: [],
    folders: [],
    students: [],
    settings: {},
  };

  const mergedDomains = {};
  Object.entries(defaults).forEach(([domain, fallback]) => {
    const localEnvelope = normalizeDomainEnvelope(localSnapshot?.domains?.[domain], fallback);
    const remoteEnvelope = normalizeDomainEnvelope(remoteSnapshot?.domains?.[domain], fallback);
    mergedDomains[domain] = remoteEnvelope.updatedAt > localEnvelope.updatedAt ? remoteEnvelope : localEnvelope;
  });

  return {
    version: 1,
    scopeId: localSnapshot?.scopeId || remoteSnapshot?.scopeId || getActiveAccountScopeId(),
    updatedAt: Date.now(),
    domains: mergedDomains,
  };
}

export async function pullAccountSnapshotFromCloud() {
  const now = Date.now();
  const availability = getAccountSyncAvailability();
  const user = getSessionUser();

  if (!availability.available) {
    const status = {
      state: 'unavailable',
      reason: availability.reason,
      updatedAt: now,
    };
    safeWriteStatus(status);
    return status;
  }

  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('account_snapshots')
      .select('payload, updated_at, client_updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      const failed = {
        state: 'error',
        reason: error.message || 'Failed to load account snapshot',
        updatedAt: now,
      };
      safeWriteStatus(failed);
      return failed;
    }

    if (!data?.payload) {
      const empty = {
        state: 'empty',
        updatedAt: now,
      };
      safeWriteStatus(empty);
      return empty;
    }

    applyAccountSnapshot(data.payload, { scopeId: getActiveAccountScopeId() });

    const ok = {
      state: 'pulled',
      updatedAt: now,
      remoteUpdatedAt: data.updated_at || data.client_updated_at || null,
    };
    safeWriteStatus(ok);
    return ok;
  } catch (error) {
    const failed = {
      state: 'error',
      reason: error?.message || 'Failed to pull account snapshot',
      updatedAt: now,
    };
    safeWriteStatus(failed);
    return failed;
  }
}

export async function pushAccountSnapshotToCloud(meta = {}) {
  const now = Date.now();
  const availability = getAccountSyncAvailability();
  const user = getSessionUser();

  if (!availability.available) {
    const status = {
      state: 'unavailable',
      reason: availability.reason,
      updatedAt: now,
      source: meta.source || 'unknown',
    };
    safeWriteStatus(status);
    return status;
  }

  try {
    const client = getSupabaseClient();
    const payload = buildAccountSnapshot(getActiveAccountScopeId());
    const row = {
      user_id: user.id,
      payload,
      client_updated_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };

    const { error } = await client.from('account_snapshots').upsert(row, { onConflict: 'user_id' });

    if (error) {
      const failed = {
        state: 'error',
        reason: error.message || 'Failed to push account snapshot',
        updatedAt: now,
        source: meta.source || 'unknown',
      };
      safeWriteStatus(failed);
      return failed;
    }

    const ok = {
      state: 'pushed',
      updatedAt: now,
      source: meta.source || 'unknown',
    };
    safeWriteStatus(ok);
    return ok;
  } catch (error) {
    const failed = {
      state: 'error',
      reason: error?.message || 'Failed to push account snapshot',
      updatedAt: now,
      source: meta.source || 'unknown',
    };
    safeWriteStatus(failed);
    return failed;
  }
}

export async function syncAccountDataBidirectional(meta = {}) {
  const now = Date.now();
  const availability = getAccountSyncAvailability();
  const user = getSessionUser();

  if (!availability.available) {
    const status = {
      state: 'unavailable',
      reason: availability.reason,
      updatedAt: now,
      source: meta.source || 'unknown',
    };
    safeWriteStatus(status);
    return status;
  }

  try {
    const client = getSupabaseClient();
    const scopeId = getActiveAccountScopeId();
    const localSnapshot = buildAccountSnapshot(scopeId);

    const { data, error } = await client
      .from('account_snapshots')
      .select('payload, updated_at, client_updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      const failed = {
        state: 'error',
        reason: error.message || 'Failed to fetch account snapshot',
        updatedAt: now,
        source: meta.source || 'unknown',
      };
      safeWriteStatus(failed);
      return failed;
    }

    const merged = mergeSnapshots(localSnapshot, data?.payload || null);
    applyAccountSnapshot(merged, { scopeId });

    const row = {
      user_id: user.id,
      payload: merged,
      client_updated_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };

    const { error: saveError } = await client.from('account_snapshots').upsert(row, { onConflict: 'user_id' });
    if (saveError) {
      const failed = {
        state: 'error',
        reason: saveError.message || 'Failed to save merged account snapshot',
        updatedAt: now,
        source: meta.source || 'unknown',
      };
      safeWriteStatus(failed);
      return failed;
    }

    const ok = {
      state: 'synced',
      updatedAt: now,
      source: meta.source || 'unknown',
    };
    safeWriteStatus(ok);
    return ok;
  } catch (error) {
    const failed = {
      state: 'error',
      reason: error?.message || 'Account sync failed',
      updatedAt: now,
      source: meta.source || 'unknown',
    };
    safeWriteStatus(failed);
    return failed;
  }
}
