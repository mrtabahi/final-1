-- Restrict direct anonymous access to admin content tables and security-definer helpers.
-- Authenticated access remains protected by the existing RLS policies and function-level admin checks.

REVOKE ALL ON TABLE public.folders, public.tests FROM anon;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.sync_verified_phone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_verified_phone() TO authenticated;

-- Trigger/event-trigger functions are invoked by PostgreSQL, not as client RPC endpoints.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
