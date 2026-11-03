-- Brain live feed, PR 1 of the live-flow plan (Nov 2 2026): public.task_events.
-- Step details only: who wrote it, which agent handed to which, word count, status, time.
-- No prompts, no keys, no free text: every column is typed and capped by a check below.
-- Read: admins only (RLS). Write: only the task-events Edge Function (service role). The page never
-- inserts directly, so authenticated/anon get no insert/update/delete grant and no write policy.
-- Safe to apply twice.
--
-- Undo (down), run by the Director only if this must be rolled back:
--   do $$ begin if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
--     and schemaname = 'public' and tablename = 'task_events') then
--     alter publication supabase_realtime drop table public.task_events; end if; end $$;
--   drop function if exists public.prune_task_events();
--   drop table if exists public.task_events;
-- The table only holds step metadata, so dropping it loses no user data.

create table if not exists public.task_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  task_id text not null check (task_id ~ '^[A-Za-z0-9_-]{1,24}$'),
  step text not null check (step ~ '^[a-z][a-z0-9_-]{0,23}$'),
  from_agent text not null check (from_agent in
    ('grokbot','grok','claude','xcode','gemini','cursor','copilot','chatgpt','perplexity','muse')),
  to_agent text not null check (to_agent in
    ('grokbot','grok','claude','xcode','gemini','cursor','copilot','chatgpt','perplexity','muse')),
  words integer not null default 0 check (words between 0 and 100000),
  status text not null check (status in ('start','handoff','done','error'))
);
create index if not exists task_events_created_at_idx on public.task_events (created_at desc);
create index if not exists task_events_created_by_idx on public.task_events (created_by);

-- Deny-all by default: RLS on, every grant removed, then only what is needed is added back.
alter table public.task_events enable row level security;
revoke all on table public.task_events from public, anon, authenticated;
grant select on table public.task_events to authenticated;
grant select, insert, delete on table public.task_events to service_role;

drop policy if exists "admins read task events" on public.task_events;
create policy "admins read task events" on public.task_events
  for select to authenticated using ((select private.is_admin()));
-- No insert/update/delete policy for anyone: the Edge Function writes with the service role.

-- 7-day retention (M confirmed Nov 2). Called by the Edge Function after each insert; service role only.
create or replace function public.prune_task_events() returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.task_events where created_at < now() - interval '7 days';
$$;
revoke all on function public.prune_task_events() from public, anon, authenticated;
grant execute on function public.prune_task_events() to service_role;

-- Live updates (PR 3) use Postgres Changes on this table, which follow the RLS rule above.
-- Never a public broadcast channel. Only added when the Supabase publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                     and schemaname = 'public' and tablename = 'task_events') then
    alter publication supabase_realtime add table public.task_events;
  end if;
end $$;
