-- Account sync and grading analytics migration
-- Apply after core live tables. Safe to run multiple times.

create extension if not exists pgcrypto;

-- 1) Account-scoped snapshot store (used by accountCloudSync)
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

-- 2) Normalized grading sessions (teacher-owned)
create table if not exists public.grade_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_session_id text,
  lesson_id text,
  lesson_title text not null default 'Untitled Lesson',
  student_name text not null default 'Anonymous',
  score numeric(5,2) not null default 0,
  earned numeric(8,2) not null default 0,
  total numeric(8,2) not null default 0,
  completed_count integer not null default 0,
  correct_count integer not null default 0,
  occurred_at timestamptz not null default now(),
  result_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grade_sessions_user_occurred_idx on public.grade_sessions (user_id, occurred_at desc);
create index if not exists grade_sessions_user_student_idx on public.grade_sessions (user_id, student_name);
create index if not exists grade_sessions_user_lesson_idx on public.grade_sessions (user_id, lesson_title);
create unique index if not exists grade_sessions_user_local_session_uniq on public.grade_sessions (user_id, local_session_id) where local_session_id is not null;

alter table public.grade_sessions enable row level security;

drop policy if exists "grade_sessions_select_own" on public.grade_sessions;
drop policy if exists "grade_sessions_insert_own" on public.grade_sessions;
drop policy if exists "grade_sessions_update_own" on public.grade_sessions;
drop policy if exists "grade_sessions_delete_own" on public.grade_sessions;

create policy "grade_sessions_select_own"
on public.grade_sessions
for select
to authenticated
using (auth.uid() = user_id);

create policy "grade_sessions_insert_own"
on public.grade_sessions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "grade_sessions_update_own"
on public.grade_sessions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "grade_sessions_delete_own"
on public.grade_sessions
for delete
to authenticated
using (auth.uid() = user_id);

-- 3) Normalized grading entries per task/block
create table if not exists public.grade_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grade_session_id uuid not null references public.grade_sessions(id) on delete cascade,
  entry_index integer not null default 0,
  block_id text,
  label text not null default 'Untitled task',
  task_type text not null default 'unknown',
  correct boolean,
  score numeric(5,4) not null default 0,
  feedback text,
  result_payload jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists grade_entries_user_task_idx on public.grade_entries (user_id, task_type);
create index if not exists grade_entries_user_score_idx on public.grade_entries (user_id, score);
create index if not exists grade_entries_user_correct_idx on public.grade_entries (user_id, correct);
create index if not exists grade_entries_session_idx on public.grade_entries (grade_session_id, entry_index);

alter table public.grade_entries enable row level security;

drop policy if exists "grade_entries_select_own" on public.grade_entries;
drop policy if exists "grade_entries_insert_own" on public.grade_entries;
drop policy if exists "grade_entries_update_own" on public.grade_entries;
drop policy if exists "grade_entries_delete_own" on public.grade_entries;

create policy "grade_entries_select_own"
on public.grade_entries
for select
to authenticated
using (auth.uid() = user_id);

create policy "grade_entries_insert_own"
on public.grade_entries
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "grade_entries_update_own"
on public.grade_entries
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "grade_entries_delete_own"
on public.grade_entries
for delete
to authenticated
using (auth.uid() = user_id);

-- 4) Helpful view for quick by-question analytics.
create or replace view public.grade_question_analytics as
select
  user_id,
  task_type,
  label,
  count(*) as attempts,
  avg(score) as avg_score,
  avg(case when correct is true then 1 else 0 end) as accuracy,
  max(occurred_at) as last_seen_at
from public.grade_entries
group by user_id, task_type, label;
