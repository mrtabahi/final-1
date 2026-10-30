create or replace function public.has_active_paid_subscription()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    where s.user_id = auth.uid()
      and s.status = 'active'
      and coalesce(s.starts_at, now()) <= now()
      and coalesce(s.ends_at, 'infinity'::timestamptz) > now()
      and coalesce(p.price_minor, 0) > 0
  );
$$;
revoke all on function public.has_active_paid_subscription() from public;
grant execute on function public.has_active_paid_subscription() to authenticated;
