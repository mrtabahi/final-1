-- Access & monetization foundation.
-- Apply to a staging Supabase project first. This file is intentionally not auto-applied.
BEGIN;

-- Existing content remains accessible during rollout. New content defaults to paid.
ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'free';
ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'free';

-- Backfill legacy content as Free to avoid disrupting current users.
-- New rows created after this migration default to Paid.
ALTER TABLE public.folders ALTER COLUMN access_mode SET DEFAULT 'paid';
ALTER TABLE public.tests ALTER COLUMN access_mode SET DEFAULT 'paid';

ALTER TABLE public.folders DROP CONSTRAINT IF EXISTS folders_access_mode_check;
ALTER TABLE public.folders ADD CONSTRAINT folders_access_mode_check
  CHECK (access_mode IN ('inherit', 'free', 'paid'));
ALTER TABLE public.tests DROP CONSTRAINT IF EXISTS tests_access_mode_check;
ALTER TABLE public.tests ADD CONSTRAINT tests_access_mode_check
  CHECK (access_mode IN ('inherit', 'free', 'paid'));

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_minor bigint NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  duration_days integer NOT NULL DEFAULT 30 CHECK (duration_days > 0 AND duration_days <= 3650),
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('site', 'menu', 'submenu', 'folder', 'test', 'materials')),
  resource_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(plan_id, resource_type, resource_key)
);

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'cancelled', 'refunded')),
  starts_at timestamptz,
  ends_at timestamptz,
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.user_entitlement_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('site', 'menu', 'submenu', 'folder', 'test', 'materials')),
  resource_key text NOT NULL,
  access_mode text NOT NULL CHECK (access_mode IN ('free', 'paid', 'grant')),
  starts_at timestamptz,
  ends_at timestamptz,
  reason text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value bigint NOT NULL CHECK (discount_value > 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  applies_to text NOT NULL DEFAULT 'selected_plans' CHECK (applies_to IN ('selected_plans', 'all_plans')),
  starts_at timestamptz,
  ends_at timestamptz,
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  max_redemptions_per_user integer NOT NULL DEFAULT 1 CHECK (max_redemptions_per_user > 0),
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (discount_type <> 'percent' OR discount_value <= 100)
);

CREATE TABLE IF NOT EXISTS public.coupon_plan_eligibility (
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  PRIMARY KEY (coupon_id, plan_id)
);

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  coupon_id uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'free', 'failed', 'refunded', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (discount_minor <= subtotal_minor),
  CHECK (total_minor = subtotal_minor - discount_minor)
);

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_transaction_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  verified_at timestamptz,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_transaction_id)
);

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  discount_minor bigint NOT NULL CHECK (discount_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(coupon_id, order_id)
);

CREATE TABLE IF NOT EXISTS public.access_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL CHECK (resource_type IN ('site', 'menu', 'submenu', 'folder', 'test', 'materials')),
  resource_key text NOT NULL,
  access_mode text NOT NULL DEFAULT 'inherit' CHECK (access_mode IN ('inherit', 'free', 'paid', 'mixed')),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(resource_type, resource_key)
);

-- Immutable audit trail for access-mode changes on folders and tests.
CREATE TABLE IF NOT EXISTS public.access_policy_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  resource_type text NOT NULL CHECK (resource_type IN ('folder', 'test')),
  resource_id uuid NOT NULL,
  old_mode text,
  new_mode text NOT NULL CHECK (new_mode IN ('inherit', 'free', 'paid')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_policy_audit_resource_lookup
  ON public.access_policy_audit(resource_type, resource_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.audit_access_mode_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.access_mode IS NOT DISTINCT FROM NEW.access_mode THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.access_policy_audit(resource_type, resource_id, old_mode, new_mode, actor_user_id)
  VALUES (
    CASE WHEN TG_TABLE_NAME = 'folders' THEN 'folder' ELSE 'test' END,
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.access_mode END,
    NEW.access_mode,
    auth.uid()
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS folders_access_mode_audit ON public.folders;
CREATE TRIGGER folders_access_mode_audit
AFTER INSERT OR UPDATE ON public.folders
FOR EACH ROW EXECUTE FUNCTION public.audit_access_mode_change();

DROP TRIGGER IF EXISTS tests_access_mode_audit ON public.tests;
CREATE TRIGGER tests_access_mode_audit
AFTER INSERT OR UPDATE ON public.tests
FOR EACH ROW EXECUTE FUNCTION public.audit_access_mode_change();

REVOKE ALL ON FUNCTION public.audit_access_mode_change() FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS user_subscriptions_active_lookup
  ON public.user_subscriptions(user_id, status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS plan_entitlements_resource_lookup
  ON public.plan_entitlements(resource_type, resource_key, plan_id);
CREATE INDEX IF NOT EXISTS user_overrides_resource_lookup
  ON public.user_entitlement_overrides(user_id, resource_type, resource_key, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS orders_user_created_lookup
  ON public.orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coupon_redemptions_user_lookup
  ON public.coupon_redemptions(coupon_id, user_id);

-- All billing/entitlement tables are server-managed. No direct browser writes.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'subscription_plans','plan_entitlements','user_subscriptions',
    'user_entitlement_overrides','coupons','coupon_plan_eligibility',
    'orders','payment_transactions','coupon_redemptions','access_policies','access_policy_audit'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- Admin UI can read/edit only the access_mode field through existing admin-only table policies.
-- Keep existing table-level policies intact during the first rollout; access enforcement must
-- be completed in the passage-delivery path before any paid item is switched to Paid in production.


-- Ensure the existing admin-only CRUD policies recognize the explicit head_admin role too.
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'head_admin')
  );
$function$;

-- Resolve effective access on the server. This function is also used by the
-- typing-result Edge Function; callers must fail closed if it errors.
CREATE OR REPLACE FUNCTION public.can_access_test(p_test_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $
DECLARE
  v_test public.tests%ROWTYPE;
  v_folder public.folders%ROWTYPE;
  v_mode text;
  v_override text;
  v_plan_ids uuid[];
  v_now timestamptz := now();
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;
  -- Prevent authenticated callers from probing another user's entitlement state.
  -- The trusted Edge Function uses the service_role JWT and may pass its verified user ID.
  IF p_user_id IS DISTINCT FROM auth.uid()
     AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RETURN false;
  END IF;
  SELECT * INTO v_test FROM public.tests WHERE id = p_test_id AND active = true;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_test.folder_id IS NOT NULL THEN
    SELECT * INTO v_folder FROM public.folders WHERE id = v_test.folder_id AND active = true;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;

  -- Even administrators cannot start or submit tests in disabled folders.
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_user_id AND p.role IN ('admin', 'head_admin')) THEN
    RETURN true;
  END IF;

  v_mode := CASE
    WHEN v_test.access_mode <> 'inherit' THEN v_test.access_mode
    ELSE COALESCE(v_folder.access_mode, 'inherit')
  END;
  IF v_mode = 'inherit' THEN
    SELECT ap.access_mode INTO v_mode
    FROM public.access_policies ap
    WHERE ap.resource_type = 'site' AND ap.resource_key = 'site';
    v_mode := COALESCE(v_mode, 'free');
    IF v_mode = 'mixed' OR v_mode = 'inherit' THEN v_mode := 'free'; END IF;
  END IF;

  -- A test-specific override takes precedence over a folder-level override.
  SELECT o.access_mode INTO v_override
  FROM public.user_entitlement_overrides o
  WHERE o.user_id = p_user_id
    AND o.resource_type = 'test'
    AND o.resource_key = p_test_id::text
    AND (o.starts_at IS NULL OR o.starts_at <= v_now)
    AND (o.ends_at IS NULL OR o.ends_at > v_now)
  ORDER BY o.created_at DESC LIMIT 1;
  IF FOUND THEN
    IF v_override IN ('free', 'grant') THEN RETURN true; END IF;
    IF v_override = 'paid' THEN v_mode := 'paid'; END IF;
  ELSIF v_test.folder_id IS NOT NULL THEN
    SELECT o.access_mode INTO v_override
    FROM public.user_entitlement_overrides o
    WHERE o.user_id = p_user_id
      AND o.resource_type = 'folder'
      AND o.resource_key = v_test.folder_id::text
      AND (o.starts_at IS NULL OR o.starts_at <= v_now)
      AND (o.ends_at IS NULL OR o.ends_at > v_now)
    ORDER BY o.created_at DESC LIMIT 1;
    IF FOUND THEN
      IF v_override IN ('free', 'grant') THEN RETURN true; END IF;
      IF v_override = 'paid' THEN v_mode := 'paid'; END IF;
    END IF;
  END IF;

  IF v_mode = 'free' THEN RETURN true; END IF;
  IF v_mode <> 'paid' THEN RETURN false; END IF;

  SELECT array_agg(us.plan_id) INTO v_plan_ids
  FROM public.user_subscriptions us
  WHERE us.user_id = p_user_id
    AND us.status = 'active'
    AND (us.starts_at IS NULL OR us.starts_at <= v_now)
    AND (us.ends_at IS NULL OR us.ends_at > v_now);

  IF v_plan_ids IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.plan_entitlements pe
    WHERE pe.plan_id = ANY(v_plan_ids)
      AND (
        (pe.resource_type = 'test' AND pe.resource_key = p_test_id::text)
        OR (v_test.folder_id IS NOT NULL AND pe.resource_type = 'folder' AND pe.resource_key = v_test.folder_id::text)
        OR (pe.resource_type = 'site' AND pe.resource_key = 'site')
      )
  );
END;
$;

REVOKE ALL ON FUNCTION public.can_access_test(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_test(uuid, uuid) TO authenticated, service_role;

-- Replace the broad candidate read policy. Admin/staff policies remain in place.
DROP POLICY IF EXISTS tests_candidate_select ON public.tests;
CREATE POLICY tests_candidate_select ON public.tests
  FOR SELECT TO authenticated
  USING (active = true AND public.can_access_test(id, auth.uid()));


COMMIT;
