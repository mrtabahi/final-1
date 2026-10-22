-- Security hardening migration for Supabase.
-- Apply in Supabase SQL Editor after reviewing against the current production schema.
BEGIN;

-- SECURITY DEFINER avoids recursive RLS checks when admin policies inspect profiles.
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;
REVOKE ALL ON FUNCTION public.is_current_user_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- Users may edit ordinary profile details, but cannot self-assign roles or mark
-- their own phone as verified. Role/verification changes go through trusted RPCs.
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
CREATE POLICY profiles_admin_all
ON public.profiles FOR ALL TO authenticated
USING (public.is_current_user_admin())
WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS folders_admin_all ON public.folders;
CREATE POLICY folders_admin_all ON public.folders FOR ALL TO authenticated
USING (public.is_current_user_admin())
WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS tests_admin_all ON public.tests;
CREATE POLICY tests_admin_all ON public.tests FOR ALL TO authenticated
USING (public.is_current_user_admin())
WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS attempts_admin_select ON public.attempts;
CREATE POLICY attempts_admin_select ON public.attempts FOR SELECT TO authenticated
USING (public.is_current_user_admin());

-- Restrict profile column updates for the browser role. Existing table-level
-- UPDATE grants are removed first so they cannot override the column allowlist.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (full_name, email, phone) ON public.profiles TO authenticated;

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx
  ON public.admin_audit_logs (created_at DESC);
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_audit_logs_admin_select ON public.admin_audit_logs;
CREATE POLICY admin_audit_logs_admin_select ON public.admin_audit_logs
  FOR SELECT TO authenticated USING (public.is_current_user_admin());
REVOKE ALL ON public.admin_audit_logs FROM anon, authenticated;
GRANT SELECT ON public.admin_audit_logs TO authenticated;

-- Phone verification status is derived from Supabase Auth, never accepted from
-- a client-supplied boolean.
CREATE OR REPLACE FUNCTION public.sync_verified_phone()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_phone text;
  v_confirmed_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT phone, phone_confirmed_at
    INTO v_phone, v_confirmed_at
  FROM auth.users
  WHERE id = v_user_id;

  IF v_confirmed_at IS NULL OR v_phone IS NULL OR length(trim(v_phone)) = 0 THEN
    RAISE EXCEPTION 'Phone number has not been verified by Supabase Auth';
  END IF;

  UPDATE public.profiles
  SET phone = v_phone, phone_verified = true
  WHERE id = v_user_id;

  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_verified_phone() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_verified_phone() TO authenticated;

-- Role changes are privileged, auditable, and never allowed via direct UPDATE.
CREATE OR REPLACE FUNCTION public.admin_set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admin permission required';
  END IF;
  IF p_role NOT IN ('candidate', 'admin') THEN
    RAISE EXCEPTION 'Unsupported role';
  END IF;
  IF p_user_id = auth.uid() AND p_role <> 'admin' THEN
    RAISE EXCEPTION 'Admins cannot remove their own admin role';
  END IF;

  UPDATE public.profiles SET role = p_role WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;

  INSERT INTO public.admin_audit_logs(actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'user.role_changed', 'profile', p_user_id::text,
          jsonb_build_object('new_role', p_role));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;

COMMIT;
