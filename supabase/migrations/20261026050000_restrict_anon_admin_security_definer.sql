BEGIN;

-- These helpers are admin-only; signed-in clients retain EXECUTE after auth.
REVOKE EXECUTE ON FUNCTION public.admin_get_candidate_emails(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_candidate_permission(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_head_admin() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_get_candidate_emails(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_candidate_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_head_admin() TO authenticated;

COMMIT;
