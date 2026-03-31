-- Compressed payload support for cloud lesson drafts.
-- Client stores both payload (jsonb) and compressed string for server-side pipelines.

alter table if exists public.lesson_drafts
  add column if not exists payload_compressed text;

alter table if exists public.lesson_drafts
  add column if not exists payload_encoding text;
