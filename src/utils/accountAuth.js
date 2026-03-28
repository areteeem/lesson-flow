import { getSupabaseClient } from './supabaseClient';

const SESSION_USER_KEY = 'lf_session_user';

export function getSessionUser() {
  try {
    const stored = localStorage.getItem(SESSION_USER_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Continue if parsing fails
  }
  return null;
}

export function setSessionUser(user) {
  try {
    if (user) {
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_USER_KEY);
    }
  } catch {
    // Ignore storage write failures
  }
}

export async function createAnonymousSession() {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data?.user) {
      console.warn('Anonymous auth failed:', error?.message);
      return null;
    }

    const user = {
      id: data.user.id,
      email: data.user.email,
      isAnonymous: true,
      createdAt: data.user.created_at || new Date().toISOString(),
      lastSignIn: new Date().toISOString(),
    };

    setSessionUser(user);
    return user;
  } catch (error) {
    console.warn('Failed to create anonymous session:', error?.message);
    return null;
  }
}

export async function upgradeToEmailAccount(email, password) {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };

  const currentUser = getSessionUser();
  if (!currentUser?.isAnonymous) {
    return { ok: false, error: 'Not in anonymous session' };
  }

  try {
    // Update anonymous user email and password
    const { error } = await client.auth.updateUser({
      email,
      password,
    });

    if (error) {
      return { ok: false, error: error.message };
    }

    const updated = {
      ...currentUser,
      email,
      isAnonymous: false,
      upgradedAt: new Date().toISOString(),
    };
    setSessionUser(updated);

    return { ok: true, user: updated };
  } catch (error) {
    return { ok: false, error: error?.message || 'Upgrade failed' };
  }
}

export async function signInWithEmail(email, password) {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.user) {
      return { ok: false, error: error?.message || 'Sign in failed' };
    }

    const user = {
      id: data.user.id,
      email: data.user.email,
      isAnonymous: false,
      lastSignIn: new Date().toISOString(),
    };

    setSessionUser(user);
    return { ok: true, user };
  } catch (error) {
    return { ok: false, error: error?.message || 'Sign in failed' };
  }
}

export async function signOut() {
  const client = getSupabaseClient();
  if (!client) {
    setSessionUser(null);
    return { ok: true };
  }

  try {
    await client.auth.signOut();
    setSessionUser(null);
    return { ok: true };
  } catch (error) {
    setSessionUser(null);
    return { ok: true };
  }
}

export async function ensureSession() {
  let user = getSessionUser();

  if (!user) {
    user = await createAnonymousSession();
  }

  return user;
}
