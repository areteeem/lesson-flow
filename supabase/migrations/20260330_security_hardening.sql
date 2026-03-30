-- Security hardening migration for cloud sync and live transport tables.
-- Apply after base schema and live tables migrations.

-- 1) Scope lesson drafts to authenticated owner.
alter table if exists public.lesson_drafts
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists lesson_drafts_user_updated_idx
  on public.lesson_drafts (user_id, updated_at desc);

alter table if exists public.lesson_drafts enable row level security;

drop policy if exists "lesson_drafts_select_anon" on public.lesson_drafts;
drop policy if exists "lesson_drafts_insert_anon" on public.lesson_drafts;
drop policy if exists "lesson_drafts_update_anon" on public.lesson_drafts;
drop policy if exists "lesson_drafts_select_auth" on public.lesson_drafts;
drop policy if exists "lesson_drafts_insert_auth" on public.lesson_drafts;
drop policy if exists "lesson_drafts_update_auth" on public.lesson_drafts;

create policy "lesson_drafts_select_auth"
on public.lesson_drafts
for select
to authenticated
using (user_id = auth.uid() or user_id is null);

create policy "lesson_drafts_insert_auth"
on public.lesson_drafts
for insert
to authenticated
with check (user_id = auth.uid());

create policy "lesson_drafts_update_auth"
on public.lesson_drafts
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- 2) Require authenticated users for live collaboration tables.
-- Anonymous participants should use Supabase anonymous auth, which maps to authenticated role.

alter table if exists public.live_users enable row level security;
alter table if exists public.live_sessions enable row level security;
alter table if exists public.live_participants enable row level security;
alter table if exists public.live_events enable row level security;
alter table if exists public.live_responses enable row level security;
alter table if exists public.live_manual_scores enable row level security;

drop policy if exists "live_users_rw" on public.live_users;
drop policy if exists "live_users_select_anon" on public.live_users;
drop policy if exists "live_users_insert_anon" on public.live_users;
drop policy if exists "live_users_update_anon" on public.live_users;

create policy "live_users_rw_auth"
on public.live_users
for all
to authenticated
using (true)
with check (true);

drop policy if exists "live_sessions_rw" on public.live_sessions;
drop policy if exists "live_sessions_select_anon" on public.live_sessions;
drop policy if exists "live_sessions_insert_anon" on public.live_sessions;
drop policy if exists "live_sessions_update_anon" on public.live_sessions;

create policy "live_sessions_rw_auth"
on public.live_sessions
for all
to authenticated
using (true)
with check (true);

drop policy if exists "live_participants_rw" on public.live_participants;
drop policy if exists "live_participants_select_anon" on public.live_participants;
drop policy if exists "live_participants_insert_anon" on public.live_participants;
drop policy if exists "live_participants_update_anon" on public.live_participants;

create policy "live_participants_rw_auth"
on public.live_participants
for all
to authenticated
using (true)
with check (true);

drop policy if exists "live_events_rw" on public.live_events;
drop policy if exists "live_events_select_anon" on public.live_events;
drop policy if exists "live_events_insert_anon" on public.live_events;

create policy "live_events_rw_auth"
on public.live_events
for all
to authenticated
using (true)
with check (true);

drop policy if exists "live_responses_rw" on public.live_responses;
drop policy if exists "live_responses_select_anon" on public.live_responses;
drop policy if exists "live_responses_insert_anon" on public.live_responses;
drop policy if exists "live_responses_update_anon" on public.live_responses;

create policy "live_responses_rw_auth"
on public.live_responses
for all
to authenticated
using (true)
with check (true);

drop policy if exists "live_manual_scores_rw" on public.live_manual_scores;
drop policy if exists "live_manual_scores_select_anon" on public.live_manual_scores;
drop policy if exists "live_manual_scores_insert_anon" on public.live_manual_scores;
drop policy if exists "live_manual_scores_update_anon" on public.live_manual_scores;
drop policy if exists "live_manual_scores_delete_anon" on public.live_manual_scores;

create policy "live_manual_scores_rw_auth"
on public.live_manual_scores
for all
to authenticated
using (true)
with check (true);
