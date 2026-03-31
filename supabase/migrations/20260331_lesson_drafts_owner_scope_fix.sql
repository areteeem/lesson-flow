-- Fix lesson_drafts ownership conflicts and RLS update failures.
-- Addresses: "new row violates row-level security policy (USING expression)" during cloud upsert.

-- 1) Ensure owner and compression columns exist for current client payload shape.
alter table if exists public.lesson_drafts
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table if exists public.lesson_drafts
  add column if not exists payload_compressed text;

alter table if exists public.lesson_drafts
  add column if not exists payload_encoding text;

-- 2) Remove global lesson_id primary key (legacy) and use owner-scoped uniqueness.
--    This allows two users to keep drafts with the same lesson_id safely.
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'lesson_drafts'
      and constraint_type = 'PRIMARY KEY'
      and constraint_name = 'lesson_drafts_pkey'
  ) then
    alter table public.lesson_drafts drop constraint lesson_drafts_pkey;
  end if;
exception
  when undefined_table then
    null;
end
$$;

drop index if exists lesson_drafts_user_lesson_uniq;

create unique index if not exists lesson_drafts_user_lesson_uniq
  on public.lesson_drafts (user_id, lesson_id);

create index if not exists lesson_drafts_lesson_id_idx
  on public.lesson_drafts (lesson_id);

create index if not exists lesson_drafts_user_updated_idx
  on public.lesson_drafts (user_id, updated_at desc);

-- 3) Enforce authenticated owner scope while allowing one-time claim of legacy null-owner rows.
alter table if exists public.lesson_drafts enable row level security;

drop policy if exists "lesson_drafts_select_anon" on public.lesson_drafts;
drop policy if exists "lesson_drafts_insert_anon" on public.lesson_drafts;
drop policy if exists "lesson_drafts_update_anon" on public.lesson_drafts;
drop policy if exists "lesson_drafts_select_auth" on public.lesson_drafts;
drop policy if exists "lesson_drafts_insert_auth" on public.lesson_drafts;
drop policy if exists "lesson_drafts_update_auth" on public.lesson_drafts;
drop policy if exists "lesson_drafts_delete_auth" on public.lesson_drafts;

create policy "lesson_drafts_select_auth"
on public.lesson_drafts
for select
to authenticated
using (user_id = auth.uid());

create policy "lesson_drafts_insert_auth"
on public.lesson_drafts
for insert
to authenticated
with check (user_id = auth.uid());

create policy "lesson_drafts_update_auth"
on public.lesson_drafts
for update
to authenticated
using (user_id = auth.uid() or user_id is null)
with check (user_id = auth.uid());

create policy "lesson_drafts_delete_auth"
on public.lesson_drafts
for delete
to authenticated
using (user_id = auth.uid());
