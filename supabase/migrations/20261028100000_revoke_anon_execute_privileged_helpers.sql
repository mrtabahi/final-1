-- Remove explicit anonymous EXECUTE grants from privileged helpers.
-- These functions are intended for authenticated callers only; their bodies
-- still perform role/identity checks and authenticated access is preserved.
BEGIN;

REVOKE ALL ON FUNCTION public.admin_get_candidate_emails(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_candidate_emails(uuid[]) TO authenticated;

REVOKE ALL ON FUNCTION public.has_candidate_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_candidate_permission(text) TO authenticated;

REVOKE ALL ON FUNCTION public.is_head_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_head_admin() TO authenticated;

COMMIT;
