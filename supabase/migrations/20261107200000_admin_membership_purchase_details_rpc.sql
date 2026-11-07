-- Admin-only membership history: resolve purchaser email from Auth and
-- purchase timestamp/status/amount from the linked order (not membership dates).
create or replace function public.admin_recent_memberships()
returns table (
  membership_id uuid,
  user_id uuid,
  candidate_name text,
  candidate_email text,
  plan_name text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  membership_created_at timestamptz,
  order_created_at timestamptz,
  order_status text,
  order_total_minor bigint,
  order_currency text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return query
  select us.id, us.user_id, coalesce(pr.full_name, 'Candidate')::text,
         au.email::text, sp.name::text, us.status::text, us.starts_at,
         us.ends_at, us.created_at, o.created_at, o.status::text,
         o.total_minor, o.currency::text
  from public.user_subscriptions us
  left join public.profiles pr on pr.id = us.user_id
  left join auth.users au on au.id = us.user_id
  left join public.subscription_plans sp on sp.id = us.plan_id
  left join public.orders o on o.id = us.order_id
  order by us.created_at desc
  limit 100;
end;
$function$;

revoke all on function public.admin_recent_memberships() from public, anon;
grant execute on function public.admin_recent_memberships() to authenticated;
