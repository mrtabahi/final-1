-- Head administrator is identified by the authenticated Auth email, not editable profile metadata.
create or replace function public.is_head_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = (select auth.uid())
      and lower(coalesce(u.email, '')) = 'decodinghcm@gmail.com'
  );
$$;
revoke all on function public.is_head_admin() from public;
grant execute on function public.is_head_admin() to authenticated;

-- Only the head admin can change roles; never allow the head account to be demoted.
create or replace function public.guard_profile_role_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  head_id uuid;
begin
  select u.id into head_id
  from auth.users u
  where lower(coalesce(u.email, '')) = 'decodinghcm@gmail.com'
  limit 1;

  if new.role is distinct from old.role then
    if (select auth.uid()) is distinct from head_id then
      raise exception 'Only the head administrator can change account roles.'
        using errcode = '42501';
    end if;
    if old.id = head_id and new.role <> 'admin' then
      raise exception 'The head administrator account cannot be demoted.'
        using errcode = '42501';
    end if;
    if new.role not in ('admin','candidate') then
      raise exception 'Unsupported account role.'
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_profile_role_changes() from public, anon, authenticated;
drop trigger if exists guard_profile_role_changes on public.profiles;
create trigger guard_profile_role_changes
before update of role on public.profiles
for each row execute function public.guard_profile_role_changes();

-- Only the head admin may use broad profile write policy; other admins retain read access
-- through their existing profile policies, but cannot change roles because of the trigger.
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
for all to authenticated
using (public.is_current_user_admin())
with check (public.is_current_user_admin());

-- Existing candidate_permissions_admin_all already lets every admin grant/revoke feature flags.
