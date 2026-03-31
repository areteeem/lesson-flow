-- Lesson sharing links (read-only preview + make-copy)
-- Apply after security/account migrations.

create extension if not exists pgcrypto;

create table if not exists public.lesson_shares (
  share_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null,
  lesson_title text not null default 'Untitled lesson',
  lesson_payload jsonb not null,
  is_active boolean not null default true,
  expires_at timestamptz,
  access_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, lesson_id)
);

create index if not exists lesson_shares_owner_updated_idx
  on public.lesson_shares (owner_user_id, updated_at desc);

create index if not exists lesson_shares_public_lookup_idx
  on public.lesson_shares (share_id, is_active, expires_at);

alter table public.lesson_shares enable row level security;

drop policy if exists "lesson_shares_select_public" on public.lesson_shares;
drop policy if exists "lesson_shares_insert_owner" on public.lesson_shares;
drop policy if exists "lesson_shares_update_owner" on public.lesson_shares;
drop policy if exists "lesson_shares_delete_owner" on public.lesson_shares;

create policy "lesson_shares_select_public"
on public.lesson_shares
for select
to anon, authenticated
using (
  is_active = true
  and (expires_at is null or expires_at > now())
);

create policy "lesson_shares_insert_owner"
on public.lesson_shares
for insert
to authenticated
with check (
  auth.uid() = owner_user_id
);

create policy "lesson_shares_update_owner"
on public.lesson_shares
for update
to authenticated
using (
  auth.uid() = owner_user_id
)
with check (
  auth.uid() = owner_user_id
);

create policy "lesson_shares_delete_owner"
on public.lesson_shares
for delete
to authenticated
using (
  auth.uid() = owner_user_id
);
