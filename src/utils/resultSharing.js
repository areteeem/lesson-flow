import { ensureSession } from './accountAuth';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

export async function createResultShareLink(resultPayload, sourceSubmissionId = null) {
  const now = Date.now();
  if (!isSupabaseConfigured()) return { ok: false, reason: 'unconfigured', updatedAt: now };

  const user = await ensureSession();
  if (!user?.id || user.isAnonymous) return { ok: false, reason: 'auth_required', updatedAt: now };

  const client = getSupabaseClient();
  const row = {
    share_id: crypto.randomUUID(),
    owner_user_id: user.id,
    source_submission_id: sourceSubmissionId,
    result_payload: resultPayload,
    is_active: true,
    updated_at: new Date(now).toISOString(),
  };

  try {
    const { data, error } = await client
      .from('result_shares')
      .insert(row)
      .select('share_id')
      .single();

    if (error || !data?.share_id) {
      return { ok: false, reason: error?.message || 'Failed to create result share', updatedAt: now };
    }

    return {
      ok: true,
      shareId: data.share_id,
      shareUrl: `${window.location.origin}/result/${encodeURIComponent(data.share_id)}`,
      updatedAt: now,
    };
  } catch (error) {
    return { ok: false, reason: error?.message || 'Failed to create result share', updatedAt: now };
  }
}

export async function fetchResultShare(shareId) {
  const now = Date.now();
  if (!isSupabaseConfigured()) return { ok: false, reason: 'unconfigured', updatedAt: now };
  const cleanId = String(shareId || '').trim();
  if (!cleanId) return { ok: false, reason: 'invalid_share_id', updatedAt: now };

  const client = getSupabaseClient();
  try {
    const { data, error } = await client
      .from('result_shares')
      .select('share_id,result_payload,is_active,expires_at')
      .eq('share_id', cleanId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) return { ok: false, reason: error.message || 'Failed to load shared result', updatedAt: now };
    if (!data?.result_payload) return { ok: false, reason: 'not_found', updatedAt: now };
    if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return { ok: false, reason: 'expired', updatedAt: now };

    return { ok: true, payload: data.result_payload, updatedAt: now };
  } catch (error) {
    return { ok: false, reason: error?.message || 'Failed to load shared result', updatedAt: now };
  }
}
