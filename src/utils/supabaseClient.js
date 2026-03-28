import { createClient } from '@supabase/supabase-js';

let client = null;

export function getSupabaseConfig() {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  const host = url
    ? (() => {
      try {
        return new URL(url).host;
      } catch {
        return '';
      }
    })()
    : '';
  return { url, anonKey, host };
}

export function isSupabaseConfigured() {
  const { url, anonKey } = getSupabaseConfig();
  return Boolean(url) && Boolean(anonKey);
}

export function getSupabaseClient() {
  if (client) return client;
  if (!isSupabaseConfigured()) return null;

  const { url, anonKey } = getSupabaseConfig();

  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return client;
}
