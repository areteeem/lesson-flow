import { getSupabaseClient } from './supabaseClient';

const SESSION_USER_KEY = 'lf_session_user';
const listeners = new Set();

function notifySessionUserChanged(user) {
  listeners.forEach((listener) => {
    try {
      listener(user);
    } catch {
      // Ignore subscriber errors so one listener cannot block others.
    }
  });
}

function toSessionUser(user, fallback = {}) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email || fallback.email || null,
    isAnonymous: Boolean(user.is_anonymous || fallback.isAnonymous),
    createdAt: user.created_at || fallback.createdAt || new Date().toISOString(),
    lastSignIn: new Date().toISOString(),
  };
}

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

  notifySessionUserChanged(user || null);
}

export function subscribeSessionUser(listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
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

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Please enter a valid email address' };
  }
  if (!password || password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }

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

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Please enter a valid email address' };
  }
  if (!password || password.length < 1) {
    return { ok: false, error: 'Please enter your password' };
  }

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

export async function signUpWithEmail(email, password) {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Please enter a valid email address' };
  }
  if (!password || password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }

  try {
    const { data, error } = await client.auth.signUp({
      email,
      password,
    });

    if (error) {
      return { ok: false, error: error.message || 'Sign up failed' };
    }

    const signedUser = data?.user;
    if (signedUser) {
      const user = toSessionUser(signedUser, { isAnonymous: false });
      setSessionUser(user);
      return {
        ok: true,
        user,
        pendingVerification: !data?.session,
      };
    }

    return {
      ok: true,
      user: null,
      pendingVerification: true,
    };
  } catch (error) {
    return { ok: false, error: error?.message || 'Sign up failed' };
  }
}

export async function requestPasswordReset(email) {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase not configured' };

  try {
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/` : undefined;
    const { error } = await client.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
    if (error) {
      return { ok: false, error: error.message || 'Password reset failed' };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Password reset failed' };
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
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data } = await client.auth.getUser();
      if (data?.user) {
        const existing = getSessionUser();
        const resolved = toSessionUser(data.user, existing || {});
        setSessionUser(resolved);
        return resolved;
      }
    } catch {
      // Ignore auth.getUser failures and continue fallback flow.
    }
  }

  let user = getSessionUser();

  if (!user) {
    user = await createAnonymousSession();
  }

  return user;
}

export async function hydrateSessionUser() {
  const client = getSupabaseClient();
  if (!client) {
    return getSessionUser();
  }

  try {
    const { data } = await client.auth.getUser();
    if (data?.user) {
      const existing = getSessionUser();
      const resolved = toSessionUser(data.user, existing || {});
      setSessionUser(resolved);
      return resolved;
    }
  } catch {
    // Ignore auth hydration failures.
  }

  setSessionUser(null);
  return null;
}
