-- BUNKER — Supabase schema. Run once in the SQL editor.
-- One row per room; the whole game state lives in `state` (jsonb).
-- `version` enables optimistic concurrency: clients update
-- "where version = <the version they read>" and retry on conflict.

create table if not exists public.rooms (
  code        text primary key check (code ~ '^[A-Z]{4}$'),
  state       jsonb       not null,
  version     integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.rooms enable row level security;

-- Casual party game: anyone with the public key may read / create / update rooms.
-- No deletes from clients.
drop policy if exists rooms_read   on public.rooms;
drop policy if exists rooms_create on public.rooms;
drop policy if exists rooms_update on public.rooms;
create policy rooms_read   on public.rooms for select to anon, authenticated using (true);
create policy rooms_create on public.rooms for insert to anon, authenticated with check (char_length(state::text) < 200000);
create policy rooms_update on public.rooms for update to anon, authenticated using (true) with check (char_length(state::text) < 200000);

grant select, insert, update on public.rooms to anon, authenticated;

-- push row updates to subscribers (Realtime → Postgres Changes)
do $$ begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null; end $$;

-- housekeeping: drop rooms idle for 2+ days (runs hourly if pg_cron is available)
create extension if not exists pg_cron;
select cron.schedule('bunker-cleanup', '17 * * * *',
  $c$delete from public.rooms where updated_at < now() - interval '2 days'$c$);
