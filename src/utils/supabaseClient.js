import { createClient } from '@supabase/supabase-js';

let client = null;

export function isSupabaseConfigured() {
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  return Boolean(url) && Boolean(anonKey);
}

export function getSupabaseClient() {
  if (client) return client;
  if (!isSupabaseConfigured()) return null;

  const url = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  return client;
}
