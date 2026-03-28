-- lesson-flow live backend schema for Supabase
-- Apply in Supabase SQL editor.

create table if not exists public.live_users (
  user_id text primary key,
  display_name text not null default 'Student',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.live_sessions (
  session_id text primary key,
  host_player_id text,
  phase text not null default 'lobby',
  current_index integer not null default 0,
  lesson_payload jsonb,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  last_sync_at timestamptz not null default now()
);

create table if not exists public.live_participants (
  session_id text not null,
  player_id text not null,
  role text not null default 'student',
  name text not null default 'Student',
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (session_id, player_id)
);

create table if not exists public.live_events (
  id bigint generated always as identity primary key,
  session_id text not null,
  event_type text not null,
  payload jsonb not null,
  sender_client_id text,
  sender_player_id text,
  created_at timestamptz not null default now()
);

create index if not exists live_events_session_created_idx on public.live_events (session_id, created_at desc);

create table if not exists public.live_responses (
  session_id text not null,
  player_id text not null,
  block_id text not null,
  result_payload jsonb,
  updated_at timestamptz not null default now(),
  primary key (session_id, player_id, block_id)
);

create table if not exists public.live_manual_scores (
  session_id text not null,
  player_id text not null,
  block_id text not null,
  points numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (session_id, player_id, block_id)
);

-- Keep old events from growing forever. Optional scheduled job can trim rows.

alter table public.live_users enable row level security;
alter table public.live_sessions enable row level security;
alter table public.live_participants enable row level security;
alter table public.live_events enable row level security;
alter table public.live_responses enable row level security;
alter table public.live_manual_scores enable row level security;

-- Demo policies: allow anon/authenticated read/write for live classroom usage.
-- Tighten these policies before production deployment.

drop policy if exists "live_users_rw" on public.live_users;
create policy "live_users_rw" on public.live_users
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "live_sessions_rw" on public.live_sessions;
create policy "live_sessions_rw" on public.live_sessions
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "live_participants_rw" on public.live_participants;
create policy "live_participants_rw" on public.live_participants
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "live_events_rw" on public.live_events;
create policy "live_events_rw" on public.live_events
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "live_responses_rw" on public.live_responses;
create policy "live_responses_rw" on public.live_responses
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "live_manual_scores_rw" on public.live_manual_scores;
create policy "live_manual_scores_rw" on public.live_manual_scores
for all
to anon, authenticated
using (true)
with check (true);
