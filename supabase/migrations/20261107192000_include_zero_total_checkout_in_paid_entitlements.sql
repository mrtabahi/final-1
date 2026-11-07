-- Active subscription rows created from a successful paid or zero-total checkout,
-- or explicitly assigned by an administrator, must grant the plan entitlements.
-- A zero-price plan is not necessarily the Free tier: 100% coupon checkouts
-- and admin-issued complimentary plans are still valid memberships.
create or replace function public.has_active_paid_subscription()
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $function$
  select exists (
    select 1
    from public.user_subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    where s.user_id = auth.uid()
      and s.status = 'active'
      and coalesce(s.starts_at, now()) <= now()
      and coalesce(s.ends_at, 'infinity'::timestamptz) > now()
      and (
        coalesce(p.price_minor, 0) > 0
        or s.order_id is not null
        or s.created_by is not null
      )
  );
$function$;

create or replace function public.has_active_paid_membership(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public'
as $function$
  select exists (
    select 1
    from public.user_subscriptions us
    join public.subscription_plans sp on sp.id = us.plan_id
    where us.user_id = p_user_id
      and us.status = 'active'
      and (us.starts_at is null or us.starts_at <= now())
      and (us.ends_at is null or us.ends_at > now())
      and (
        coalesce(sp.price_minor, 0) > 0
        or us.order_id is not null
        or us.created_by is not null
      )
  );
$function$;

revoke all on function public.has_active_paid_membership(uuid) from public, anon;
grant execute on function public.has_active_paid_membership(uuid) to authenticated;
