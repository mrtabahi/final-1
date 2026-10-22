-- Production fix: restore authenticated admin CRUD permissions for folders/tests.
-- Run this in the Supabase SQL Editor for project nuqfmjgkyfychhwzwnfl.
-- This does not grant access to anon/public users; the RLS predicate still requires profiles.role = 'admin'.
BEGIN;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;
REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.folders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tests TO authenticated;

DROP POLICY IF EXISTS folders_admin_all ON public.folders;
CREATE POLICY folders_admin_all
  ON public.folders
  FOR ALL
  TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS tests_admin_all ON public.tests;
CREATE POLICY tests_admin_all
  ON public.tests
  FOR ALL
  TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

COMMIT;

-- Verification after running:
-- SELECT id, role FROM public.profiles WHERE id = auth.uid();
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename IN ('folders', 'tests');
