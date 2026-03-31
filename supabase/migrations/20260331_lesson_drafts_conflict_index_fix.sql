-- Fix ON CONFLICT(user_id, lesson_id) failures on lesson_drafts.
-- Postgres cannot infer a partial unique index for this upsert target.

-- Remove old partial index shape if present.
drop index if exists public.lesson_drafts_user_lesson_uniq;

-- Recreate as non-partial so ON CONFLICT(user_id, lesson_id) can use it.
create unique index if not exists lesson_drafts_user_lesson_uniq
  on public.lesson_drafts (user_id, lesson_id);
