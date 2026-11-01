-- Brain always keeps at least one admin (code review, Nov 1 2026).
-- The accounts function checked "more than one admin?" and then deleted, in two steps. Two admins
-- removing each other at the same moment could both pass the check and leave zero accounts, which
-- reopens first-run setup to any visitor. This trigger makes the check and the delete one step:
-- removals wait their turn on a lock, then recount, so the last admin can never be removed.
-- It fires for every removal path (accounts function, dashboard, SQL), because deleting the auth
-- user cascades to the profile. Safe to apply twice.
-- Rollback: drop trigger if exists profiles_keep_last_admin on public.profiles;
--           drop function if exists private.keep_last_admin();

create or replace function private.keep_last_admin() returns trigger
language plpgsql volatile security definer set search_path = '' as $$
begin
  if old.role <> 'admin' then return old; end if;
  -- One removal at a time; the count below then sees any removal that finished while we waited.
  perform pg_advisory_xact_lock(hashtext('brain:keep_last_admin'));
  if (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'Brain needs at least one admin.' using errcode = 'P0001';
  end if;
  return old;
end $$;
revoke all on function private.keep_last_admin() from public, anon, authenticated;

drop trigger if exists profiles_keep_last_admin on public.profiles;
create trigger profiles_keep_last_admin
  before delete on public.profiles
  for each row execute function private.keep_last_admin();
