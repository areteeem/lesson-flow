-- Tighten live table RLS policies from fully permissive to session-scoped.
-- Users can only interact with sessions they participate in or host.

-- ============== live_sessions ==============
drop policy if exists "live_sessions_rw_auth" on public.live_sessions;

-- Anyone authenticated can create a session (as host)
create policy "live_sessions_insert"
on public.live_sessions for insert to authenticated
with check (true);

-- Read/update only sessions you host or participate in
create policy "live_sessions_select"
on public.live_sessions for select to authenticated
using (
  host_player_id = auth.uid()::text
  or exists (
    select 1 from public.live_participants p
    where p.session_id = live_sessions.session_id
      and p.player_id = auth.uid()::text
  )
);

create policy "live_sessions_update"
on public.live_sessions for update to authenticated
using (host_player_id = auth.uid()::text)
with check (host_player_id = auth.uid()::text);

-- ============== live_participants ==============
drop policy if exists "live_participants_rw_auth" on public.live_participants;

-- Students can insert themselves as participants
create policy "live_participants_insert"
on public.live_participants for insert to authenticated
with check (player_id = auth.uid()::text);

-- Participants and hosts can see who's in the session
create policy "live_participants_select"
on public.live_participants for select to authenticated
using (
  player_id = auth.uid()::text
  or exists (
    select 1 from public.live_sessions s
    where s.session_id = live_participants.session_id
      and s.host_player_id = auth.uid()::text
  )
);

-- Only self-update
create policy "live_participants_update"
on public.live_participants for update to authenticated
using (player_id = auth.uid()::text)
with check (player_id = auth.uid()::text);

-- ============== live_events ==============
drop policy if exists "live_events_rw_auth" on public.live_events;

-- Insert events only for sessions you participate in or host
create policy "live_events_insert"
on public.live_events for insert to authenticated
with check (
  exists (
    select 1 from public.live_participants p
    where p.session_id = live_events.session_id
      and p.player_id = auth.uid()::text
  )
  or exists (
    select 1 from public.live_sessions s
    where s.session_id = live_events.session_id
      and s.host_player_id = auth.uid()::text
  )
);

-- Read events only from your sessions
create policy "live_events_select"
on public.live_events for select to authenticated
using (
  exists (
    select 1 from public.live_participants p
    where p.session_id = live_events.session_id
      and p.player_id = auth.uid()::text
  )
  or exists (
    select 1 from public.live_sessions s
    where s.session_id = live_events.session_id
      and s.host_player_id = auth.uid()::text
  )
);

-- ============== live_responses ==============
drop policy if exists "live_responses_rw_auth" on public.live_responses;

-- Students insert/update their own responses
create policy "live_responses_upsert"
on public.live_responses for insert to authenticated
with check (player_id = auth.uid()::text);

create policy "live_responses_update"
on public.live_responses for update to authenticated
using (player_id = auth.uid()::text)
with check (player_id = auth.uid()::text);

-- Hosts and the responding student can read responses
create policy "live_responses_select"
on public.live_responses for select to authenticated
using (
  player_id = auth.uid()::text
  or exists (
    select 1 from public.live_sessions s
    where s.session_id = live_responses.session_id
      and s.host_player_id = auth.uid()::text
  )
);

-- ============== live_manual_scores ==============
drop policy if exists "live_manual_scores_rw_auth" on public.live_manual_scores;

-- Only hosts can insert/update/delete manual scores
create policy "live_manual_scores_write"
on public.live_manual_scores for insert to authenticated
with check (
  exists (
    select 1 from public.live_sessions s
    where s.session_id = live_manual_scores.session_id
      and s.host_player_id = auth.uid()::text
  )
);

create policy "live_manual_scores_update"
on public.live_manual_scores for update to authenticated
using (
  exists (
    select 1 from public.live_sessions s
    where s.session_id = live_manual_scores.session_id
      and s.host_player_id = auth.uid()::text
  )
);

create policy "live_manual_scores_delete"
on public.live_manual_scores for delete to authenticated
using (
  exists (
    select 1 from public.live_sessions s
    where s.session_id = live_manual_scores.session_id
      and s.host_player_id = auth.uid()::text
  )
);

-- Hosts and students can read scores for their sessions
create policy "live_manual_scores_select"
on public.live_manual_scores for select to authenticated
using (
  player_id = auth.uid()::text
  or exists (
    select 1 from public.live_sessions s
    where s.session_id = live_manual_scores.session_id
      and s.host_player_id = auth.uid()::text
  )
);

-- ============== live_users ==============
drop policy if exists "live_users_rw_auth" on public.live_users;

-- Users can only manage their own user record
create policy "live_users_insert"
on public.live_users for insert to authenticated
with check (user_id = auth.uid()::text);

create policy "live_users_select"
on public.live_users for select to authenticated
using (user_id = auth.uid()::text);

create policy "live_users_update"
on public.live_users for update to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);
