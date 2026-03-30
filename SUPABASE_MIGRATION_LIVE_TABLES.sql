-- Live Mode Tables for Real-time Collaboration
-- Run this in Supabase SQL Editor

-- 0. Cloud Lesson Drafts table (Editor autosave/cloud sync)
create table if not exists public.lesson_drafts (
  lesson_id text primary key,
  title text not null default 'Untitled Lesson',
  payload jsonb not null,
  client_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.lesson_drafts enable row level security;

drop policy if exists "lesson_drafts_select_anon" on public.lesson_drafts;
drop policy if exists "lesson_drafts_insert_anon" on public.lesson_drafts;
drop policy if exists "lesson_drafts_update_anon" on public.lesson_drafts;

create policy "lesson_drafts_select_anon"
on public.lesson_drafts
for select
to anon
using (true);

create policy "lesson_drafts_insert_anon"
on public.lesson_drafts
for insert
to anon
with check (true);

create policy "lesson_drafts_update_anon"
on public.lesson_drafts
for update
to anon
using (true)
with check (true);

-- 0.1 Account snapshots table (cross-device account sync)
create table if not exists public.account_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  client_updated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.account_snapshots enable row level security;

drop policy if exists "account_snapshots_select_own" on public.account_snapshots;
drop policy if exists "account_snapshots_insert_own" on public.account_snapshots;
drop policy if exists "account_snapshots_update_own" on public.account_snapshots;

create policy "account_snapshots_select_own"
on public.account_snapshots
for select
to authenticated
using (auth.uid() = user_id);

create policy "account_snapshots_insert_own"
on public.account_snapshots
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "account_snapshots_update_own"
on public.account_snapshots
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- 1. Live Users table
create table if not exists public.live_users (
  user_id text primary key,
  display_name text not null default 'Student',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.live_users enable row level security;

drop policy if exists "live_users_select_anon" on public.live_users;
drop policy if exists "live_users_insert_anon" on public.live_users;
drop policy if exists "live_users_update_anon" on public.live_users;

create policy "live_users_select_anon"
on public.live_users
for select
to anon
using (true);

create policy "live_users_insert_anon"
on public.live_users
for insert
to anon
with check (true);

create policy "live_users_update_anon"
on public.live_users
for update
to anon
using (true)
with check (true);

-- 2. Live Sessions table
create table if not exists public.live_sessions (
  session_id text primary key,
  host_player_id text,
  phase text not null default 'lobby', -- lobby, running, finished
  current_index integer not null default 0,
  lesson_payload jsonb,
  revision integer not null default 0,
  last_sync_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.live_sessions enable row level security;

drop policy if exists "live_sessions_select_anon" on public.live_sessions;
drop policy if exists "live_sessions_insert_anon" on public.live_sessions;
drop policy if exists "live_sessions_update_anon" on public.live_sessions;

create policy "live_sessions_select_anon"
on public.live_sessions
for select
to anon
using (true);

create policy "live_sessions_insert_anon"
on public.live_sessions
for insert
to anon
with check (true);

create policy "live_sessions_update_anon"
on public.live_sessions
for update
to anon
using (true)
with check (true);

-- 3. Live Participants table
create table if not exists public.live_participants (
  session_id text not null,
  player_id text not null,
  role text not null default 'student', -- host, student
  name text not null default 'Student',
  status text not null default 'active', -- active, left
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (session_id, player_id),
  foreign key (session_id) references public.live_sessions(session_id) on delete cascade
);

alter table public.live_participants enable row level security;

drop policy if exists "live_participants_select_anon" on public.live_participants;
drop policy if exists "live_participants_insert_anon" on public.live_participants;
drop policy if exists "live_participants_update_anon" on public.live_participants;

create policy "live_participants_select_anon"
on public.live_participants
for select
to anon
using (true);

create policy "live_participants_insert_anon"
on public.live_participants
for insert
to anon
with check (true);

create policy "live_participants_update_anon"
on public.live_participants
for update
to anon
using (true)
with check (true);

-- 4. Live Events table (for realtime)
create table if not exists public.live_events (
  id bigserial primary key,
  session_id text not null,
  event_type text not null default 'event',
  payload jsonb,
  sender_client_id text,
  sender_player_id text,
  created_at timestamptz not null default now(),
  foreign key (session_id) references public.live_sessions(session_id) on delete cascade
);

create index if not exists idx_live_events_session on public.live_events(session_id);
create index if not exists idx_live_events_created on public.live_events(created_at);

alter table public.live_events enable row level security;

drop policy if exists "live_events_select_anon" on public.live_events;
drop policy if exists "live_events_insert_anon" on public.live_events;

create policy "live_events_select_anon"
on public.live_events
for select
to anon
using (true);

create policy "live_events_insert_anon"
on public.live_events
for insert
to anon
with check (true);

-- 5. Live Responses table
create table if not exists public.live_responses (
  session_id text not null,
  player_id text not null,
  block_id text not null,
  result_payload jsonb,
  updated_at timestamptz not null default now(),
  primary key (session_id, player_id, block_id),
  foreign key (session_id) references public.live_sessions(session_id) on delete cascade
);

alter table public.live_responses enable row level security;

drop policy if exists "live_responses_select_anon" on public.live_responses;
drop policy if exists "live_responses_insert_anon" on public.live_responses;
drop policy if exists "live_responses_update_anon" on public.live_responses;

create policy "live_responses_select_anon"
on public.live_responses
for select
to anon
using (true);

create policy "live_responses_insert_anon"
on public.live_responses
for insert
to anon
with check (true);

create policy "live_responses_update_anon"
on public.live_responses
for update
to anon
using (true)
with check (true);

-- 6. Live Manual Scores table
create table if not exists public.live_manual_scores (
  session_id text not null,
  player_id text not null,
  block_id text not null,
  points numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (session_id, player_id, block_id),
  foreign key (session_id) references public.live_sessions(session_id) on delete cascade
);

alter table public.live_manual_scores enable row level security;

drop policy if exists "live_manual_scores_select_anon" on public.live_manual_scores;
drop policy if exists "live_manual_scores_insert_anon" on public.live_manual_scores;
drop policy if exists "live_manual_scores_update_anon" on public.live_manual_scores;
drop policy if exists "live_manual_scores_delete_anon" on public.live_manual_scores;

create policy "live_manual_scores_select_anon"
on public.live_manual_scores
for select
to anon
using (true);

create policy "live_manual_scores_insert_anon"
on public.live_manual_scores
for insert
to anon
with check (true);

create policy "live_manual_scores_update_anon"
on public.live_manual_scores
for update
to anon
using (true)
with check (true);

create policy "live_manual_scores_delete_anon"
on public.live_manual_scores
for delete
to anon
using (true);

-- Enable Realtime for live_events table
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'live_events'
  ) then
    alter publication supabase_realtime add table public.live_events;
  end if;
end
$$;
