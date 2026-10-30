REVOKE EXECUTE ON FUNCTION public.has_active_paid_subscription() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_active_paid_subscription() TO authenticated;
