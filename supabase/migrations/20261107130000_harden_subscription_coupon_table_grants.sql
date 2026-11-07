-- Supabase staging may grant broad default table privileges to authenticated.
-- RLS cannot prevent TRUNCATE, so explicitly remove all inherited table privileges.
revoke all on public.subscription_coupons from public, anon, authenticated;
grant select, insert, update on public.subscription_coupons to authenticated;
