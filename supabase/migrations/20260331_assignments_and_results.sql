-- Assignment links, homework submissions, and result sharing
-- Apply after account and sharing migrations.

create extension if not exists pgcrypto;

create table if not exists public.lesson_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null,
  lesson_title text not null default 'Untitled lesson',
  lesson_payload jsonb not null,
  one_attempt_only boolean not null default true,
  allow_retry boolean not null default false,
  visibility_policy text not null default 'teacher_choice',
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, lesson_id)
);

create index if not exists lesson_assignments_owner_updated_idx
  on public.lesson_assignments (owner_user_id, updated_at desc);

create index if not exists lesson_assignments_public_lookup_idx
  on public.lesson_assignments (assignment_id, is_active, expires_at);

alter table public.lesson_assignments enable row level security;

drop policy if exists "lesson_assignments_select_public" on public.lesson_assignments;
drop policy if exists "lesson_assignments_insert_owner" on public.lesson_assignments;
drop policy if exists "lesson_assignments_update_owner" on public.lesson_assignments;
drop policy if exists "lesson_assignments_delete_owner" on public.lesson_assignments;

create policy "lesson_assignments_select_public"
on public.lesson_assignments
for select
to anon, authenticated
using (
  is_active = true
  and (expires_at is null or expires_at > now())
);

create policy "lesson_assignments_insert_owner"
on public.lesson_assignments
for insert
to authenticated
with check (auth.uid() = owner_user_id);

create policy "lesson_assignments_update_owner"
on public.lesson_assignments
for update
to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

create policy "lesson_assignments_delete_owner"
on public.lesson_assignments
for delete
to authenticated
using (auth.uid() = owner_user_id);

create table if not exists public.assignment_submissions (
  submission_id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.lesson_assignments(assignment_id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  student_name text not null default 'Student',
  attempt_fingerprint text not null,
  result_payload jsonb not null,
  interaction_payload jsonb not null default '{}'::jsonb,
  origin text not null default 'homework',
  submission_state text not null default 'awaiting_review',
  score numeric(5,2) not null default 0,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assignment_id, attempt_fingerprint)
);

create index if not exists assignment_submissions_assignment_idx
  on public.assignment_submissions (assignment_id, submitted_at desc);

create index if not exists assignment_submissions_state_idx
  on public.assignment_submissions (submission_state, submitted_at desc);

alter table public.assignment_submissions enable row level security;

drop policy if exists "assignment_submissions_insert_public" on public.assignment_submissions;
drop policy if exists "assignment_submissions_select_owner" on public.assignment_submissions;
drop policy if exists "assignment_submissions_update_owner" on public.assignment_submissions;

create policy "assignment_submissions_insert_public"
on public.assignment_submissions
for insert
to anon, authenticated
with check (true);

create policy "assignment_submissions_select_owner"
on public.assignment_submissions
for select
to authenticated
using (
  exists (
    select 1
    from public.lesson_assignments la
    where la.assignment_id = assignment_submissions.assignment_id
      and la.owner_user_id = auth.uid()
  )
);

create policy "assignment_submissions_update_owner"
on public.assignment_submissions
for update
to authenticated
using (
  exists (
    select 1
    from public.lesson_assignments la
    where la.assignment_id = assignment_submissions.assignment_id
      and la.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.lesson_assignments la
    where la.assignment_id = assignment_submissions.assignment_id
      and la.owner_user_id = auth.uid()
  )
);

create table if not exists public.result_shares (
  share_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_submission_id uuid references public.assignment_submissions(submission_id) on delete set null,
  result_payload jsonb not null,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists result_shares_owner_idx
  on public.result_shares (owner_user_id, updated_at desc);

alter table public.result_shares enable row level security;

drop policy if exists "result_shares_select_public" on public.result_shares;
drop policy if exists "result_shares_owner_write" on public.result_shares;

create policy "result_shares_select_public"
on public.result_shares
for select
to anon, authenticated
using (
  is_active = true
  and (expires_at is null or expires_at > now())
);

create policy "result_shares_owner_write"
on public.result_shares
for all
to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);
