-- Defense in depth: subscription rows must never be directly accessible to anonymous clients.
revoke all on table public.user_subscriptions from anon, public;
grant select, insert, update, delete on table public.user_subscriptions to authenticated;
revoke insert, update, delete on table public.subscription_plans from anon, public;
revoke insert, update, delete on table public.plan_entitlements from anon, public;
