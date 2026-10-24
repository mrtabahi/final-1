create or replace function public.admin_get_candidate_emails(p_user_ids uuid[] default null)
returns table(user_id uuid, email text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id as user_id, u.email::text as email
  from auth.users u
  join public.profiles p on p.id = u.id
  where p.role = 'candidate'
    and (p_user_ids is null or u.id = any(p_user_ids))
    and exists (
      select 1 from public.profiles caller
      where caller.id = (select auth.uid())
        and caller.role = 'admin'
    );
$$;

revoke all on function public.admin_get_candidate_emails(uuid[]) from public;
grant execute on function public.admin_get_candidate_emails(uuid[]) to authenticated;
