create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.guard_registration_enabled()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_enabled boolean;
  v_message text;
begin
  select registration_enabled, registration_paused_message
    into v_enabled, v_message
  from public.site_access_settings
  where id = 1;

  if coalesce(v_enabled, true) = false then
    raise exception using
      errcode = 'P0001',
      message = coalesce(nullif(v_message, ''), 'New account creation is temporarily paused. Please try again later.');
  end if;

  return new;
end;
$$;

revoke all on function private.guard_registration_enabled() from public, anon, authenticated;

drop trigger if exists enforce_registration_enabled on auth.users;
create trigger enforce_registration_enabled
before insert on auth.users
for each row execute function private.guard_registration_enabled();