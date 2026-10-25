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
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_note text NOT NULL DEFAULT '',
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
  provider text CHECK (provider IS NULL OR provider IN ('razorpay')),
  provider_order_id text,
  currency text NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3 AND currency !~ '[^A-Z]'),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  discount_minor bigint NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  duration_days integer NOT NULL DEFAULT 30 CHECK (duration_days > 0 AND duration_days <= 3650),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'free', 'failed', 'refunded', 'cancelled')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (discount_minor <= subtotal_minor),
  CHECK (total_minor = subtotal_minor - discount_minor)
);

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_subscriptions_order_id_fkey'
      AND conrelid = 'public.user_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.user_subscriptions
      ADD CONSTRAINT user_subscriptions_order_id_fkey
      FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
  END IF;
END;
$do$;
CREATE INDEX IF NOT EXISTS user_subscriptions_order_lookup
  ON public.user_subscriptions(order_id);

CREATE TABLE IF NOT EXISTS public.provider_webhook_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('razorpay')),
  provider_event_id text,
  event_type text NOT NULL,
  payload_sha256 text NOT NULL CHECK (length(payload_sha256) = 64 AND payload_sha256 !~ '[^a-f0-9]'),
  outcome text NOT NULL CHECK (outcome IN ('processed', 'ignored', 'duplicate')),
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS provider_webhook_events_processed_lookup
  ON public.provider_webhook_events(processed_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_transaction_id text,
  provider_refund_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL DEFAULT 'INR' CHECK (length(currency) = 3 AND currency !~ '[^A-Z]'),
  verified_at timestamptz,
  refunded_at timestamptz,
  refund_requested_at timestamptz,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  refund_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_transaction_id),
  UNIQUE(provider, provider_refund_id)
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
CREATE TABLE IF NOT EXISTS public.user_entitlement_override_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  override_id uuid REFERENCES public.user_entitlement_overrides(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'updated', 'revoked')),
  before_state jsonb,
  after_state jsonb,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_override_audit_lookup
  ON public.user_entitlement_override_audit(override_id, changed_at DESC);
CREATE TABLE IF NOT EXISTS public.user_subscription_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_id uuid REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'updated', 'cancelled', 'refunded')),
  before_state jsonb,
  after_state jsonb,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_subscription_audit_lookup
  ON public.user_subscription_audit(subscription_id, changed_at DESC);



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

CREATE OR REPLACE FUNCTION public.audit_user_entitlement_override_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_event text := CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END;
  v_before jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_before := jsonb_build_object(
      'user_id', OLD.user_id, 'resource_type', OLD.resource_type, 'resource_key', OLD.resource_key,
      'access_mode', OLD.access_mode, 'starts_at', OLD.starts_at, 'ends_at', OLD.ends_at, 'reason', OLD.reason
    );
    IF NEW.ends_at IS NOT NULL AND NEW.ends_at <= now()
       AND (OLD.ends_at IS NULL OR OLD.ends_at > now()) THEN
      v_event := 'revoked';
    END IF;
  END IF;
  INSERT INTO public.user_entitlement_override_audit(
    override_id, event_type, before_state, after_state, actor_user_id
  ) VALUES (
    NEW.id, v_event, v_before,
    jsonb_build_object(
      'user_id', NEW.user_id, 'resource_type', NEW.resource_type, 'resource_key', NEW.resource_key,
      'access_mode', NEW.access_mode, 'starts_at', NEW.starts_at, 'ends_at', NEW.ends_at, 'reason', NEW.reason
    ),
    auth.uid()
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS user_entitlement_override_audit_trigger ON public.user_entitlement_overrides;
CREATE TRIGGER user_entitlement_override_audit_trigger
AFTER INSERT OR UPDATE ON public.user_entitlement_overrides
FOR EACH ROW EXECUTE FUNCTION public.audit_user_entitlement_override_change();
REVOKE ALL ON FUNCTION public.audit_user_entitlement_override_change() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_event text := CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'status_changed' END;
  v_before jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
    v_before := jsonb_build_object(
      'status', OLD.status, 'total_minor', OLD.total_minor, 'currency', OLD.currency,
      'coupon_id', OLD.coupon_id, 'expires_at', OLD.expires_at
    );
  END IF;
  INSERT INTO public.order_status_audit(order_id, event_type, old_state, new_state, actor_user_id)
  VALUES (
    NEW.id, v_event, v_before,
    jsonb_build_object(
      'status', NEW.status, 'total_minor', NEW.total_minor, 'currency', NEW.currency,
      'coupon_id', NEW.coupon_id, 'expires_at', NEW.expires_at
    ),
    auth.uid()
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS order_status_audit_trigger ON public.orders;
CREATE TRIGGER order_status_audit_trigger
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.audit_order_status_change();
REVOKE ALL ON FUNCTION public.audit_order_status_change() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_user_subscription_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_event text := CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'updated' END;
  v_before jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_before := jsonb_build_object(
      'user_id', OLD.user_id, 'plan_id', OLD.plan_id, 'status', OLD.status,
      'starts_at', OLD.starts_at, 'ends_at', OLD.ends_at, 'admin_note', OLD.admin_note
    );
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN v_event := 'cancelled';
    ELSIF NEW.status = 'refunded' AND OLD.status <> 'refunded' THEN v_event := 'refunded';
    END IF;
  END IF;
  INSERT INTO public.user_subscription_audit(subscription_id, event_type, before_state, after_state, actor_user_id)
  VALUES (
    NEW.id, v_event, v_before,
    jsonb_build_object(
      'user_id', NEW.user_id, 'plan_id', NEW.plan_id, 'status', NEW.status,
      'starts_at', NEW.starts_at, 'ends_at', NEW.ends_at, 'admin_note', NEW.admin_note
    ),
    auth.uid()
  );
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS user_subscription_audit_trigger ON public.user_subscriptions;
CREATE TRIGGER user_subscription_audit_trigger
AFTER INSERT OR UPDATE ON public.user_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.audit_user_subscription_change();
REVOKE ALL ON FUNCTION public.audit_user_subscription_change() FROM PUBLIC, anon, authenticated;



CREATE INDEX IF NOT EXISTS user_subscriptions_active_lookup
  ON public.user_subscriptions(user_id, status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS plan_entitlements_resource_lookup
  ON public.plan_entitlements(resource_type, resource_key, plan_id);
CREATE INDEX IF NOT EXISTS user_overrides_resource_lookup
  ON public.user_entitlement_overrides(user_id, resource_type, resource_key, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS orders_user_created_lookup
  ON public.orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_pending_coupon_reservation_lookup
  ON public.orders(coupon_id, expires_at, user_id) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS orders_provider_order_unique
  ON public.orders(provider, provider_order_id)
  WHERE provider IS NOT NULL AND provider_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.order_status_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created', 'status_changed')),
  old_state jsonb,
  new_state jsonb NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_status_audit_lookup
  ON public.order_status_audit(order_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS coupon_redemptions_user_lookup
  ON public.coupon_redemptions(coupon_id, user_id);

-- All billing/entitlement tables are server-managed. No direct browser writes.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'subscription_plans','plan_entitlements','user_subscriptions',
    'user_entitlement_overrides','user_entitlement_override_audit','user_subscription_audit','order_status_audit','provider_webhook_events','coupons','coupon_plan_eligibility',
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

-- Narrow authenticated RPCs for admin plan management. Billing tables remain
-- inaccessible directly from browser clients; all writes go through these
-- role-checked SECURITY DEFINER functions.
-- Narrow authenticated RPCs for admin plan management. Billing tables remain
-- inaccessible directly from browser clients; all writes go through these
-- role-checked SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION public.admin_upsert_subscription_plan(
  p_id uuid,
  p_name text,
  p_description text,
  p_price_minor bigint,
  p_currency text,
  p_duration_days integer,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_plan public.subscription_plans%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) = 0 OR length(p_name) > 120 THEN
    RAISE EXCEPTION 'Plan name must be between 1 and 120 characters' USING ERRCODE = '22023';
  END IF;
  IF p_description IS NULL OR length(p_description) > 2000 THEN
    RAISE EXCEPTION 'Plan description is too long' USING ERRCODE = '22023';
  END IF;
  IF p_price_minor IS NULL OR p_price_minor < 0 THEN
    RAISE EXCEPTION 'Price must be a non-negative integer in minor currency units' USING ERRCODE = '22023';
  END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z][A-Z][A-Z]' OR length(p_currency) <> 3 THEN
    RAISE EXCEPTION 'Currency must be a three-letter uppercase code' USING ERRCODE = '22023';
  END IF;
  IF p_duration_days IS NULL OR p_duration_days < 1 OR p_duration_days > 3650 THEN
    RAISE EXCEPTION 'Duration must be between 1 and 3650 days' USING ERRCODE = '22023';
  END IF;
  IF p_is_active IS NULL THEN
    RAISE EXCEPTION 'Plan active status is required' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.subscription_plans(name, description, price_minor, currency, duration_days, is_active, created_by)
    VALUES (btrim(p_name), p_description, p_price_minor, p_currency, p_duration_days, p_is_active, auth.uid())
    RETURNING * INTO v_plan;
  ELSE
    UPDATE public.subscription_plans
    SET name = btrim(p_name), description = p_description, price_minor = p_price_minor,
        currency = p_currency, duration_days = p_duration_days, is_active = p_is_active,
        updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_plan;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Subscription plan not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', v_plan.id, 'name', v_plan.name, 'description', v_plan.description,
    'price_minor', v_plan.price_minor, 'currency', v_plan.currency,
    'duration_days', v_plan.duration_days, 'is_active', v_plan.is_active,
    'created_at', v_plan.created_at, 'updated_at', v_plan.updated_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_plan_entitlements(
  p_plan_id uuid,
  p_entitlements jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_plan_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Subscription plan not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_entitlements IS NULL OR jsonb_typeof(p_entitlements) <> 'array' THEN
    RAISE EXCEPTION 'Entitlements must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_entitlements) > 500 THEN
    RAISE EXCEPTION 'A plan may contain at most 500 entitlements' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_entitlements) AS e(resource_type text, resource_key text)
    WHERE e.resource_type IS NULL
       OR e.resource_type NOT IN ('site', 'menu', 'submenu', 'folder', 'test', 'materials')
       OR e.resource_key IS NULL
       OR length(btrim(e.resource_key)) = 0
       OR length(e.resource_key) > 200
  ) THEN
    RAISE EXCEPTION 'Each entitlement needs a valid resource_type and resource_key' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.plan_entitlements WHERE plan_id = p_plan_id;
  INSERT INTO public.plan_entitlements(plan_id, resource_type, resource_key)
  SELECT p_plan_id, e.resource_type, btrim(e.resource_key)
  FROM jsonb_to_recordset(p_entitlements) AS e(resource_type text, resource_key text);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_save_subscription_plan(
  p_id uuid,
  p_name text,
  p_description text,
  p_price_minor bigint,
  p_currency text,
  p_duration_days integer,
  p_is_active boolean,
  p_entitlements jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_plan jsonb;
  v_plan_id uuid;
  v_entitlement_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  v_plan := public.admin_upsert_subscription_plan(
    p_id, p_name, p_description, p_price_minor, p_currency, p_duration_days, p_is_active
  );
  v_plan_id := (v_plan->>'id')::uuid;
  v_entitlement_count := public.admin_set_plan_entitlements(v_plan_id, p_entitlements);
  RETURN v_plan || jsonb_build_object('entitlements_count', v_entitlement_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_subscription_plans()
RETURNS SETOF public.subscription_plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.subscription_plans ORDER BY created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_plan_entitlements(p_plan_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_plan_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE id = p_plan_id) THEN
    RAISE EXCEPTION 'Subscription plan not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('resource_type', pe.resource_type, 'resource_key', pe.resource_key)
                     ORDER BY pe.resource_type, pe.resource_key)
    FROM public.plan_entitlements pe WHERE pe.plan_id = p_plan_id
  ), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_upsert_subscription_plan(uuid, text, text, bigint, text, integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_plan_entitlements(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_save_subscription_plan(uuid, text, text, bigint, text, integer, boolean, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_subscription_plans() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_plan_entitlements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_subscription_plan(uuid, text, text, bigint, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_plan_entitlements(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_subscription_plan(uuid, text, text, bigint, text, integer, boolean, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_subscription_plans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_plan_entitlements(uuid) TO authenticated;

-- Coupon catalog management is also exposed only through role-checked RPCs.
CREATE OR REPLACE FUNCTION public.admin_list_coupons()
RETURNS SETOF public.coupons
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.coupons ORDER BY created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_coupon_plan_eligibility(p_coupon_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_coupon_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.coupons WHERE id = p_coupon_id) THEN
    RAISE EXCEPTION 'Coupon not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object('plan_id', cpe.plan_id) ORDER BY cpe.plan_id)
    FROM public.coupon_plan_eligibility cpe WHERE cpe.coupon_id = p_coupon_id
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_save_coupon(
  p_id uuid,
  p_code text,
  p_description text,
  p_discount_type text,
  p_discount_value bigint,
  p_currency text,
  p_applies_to text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_max_redemptions integer,
  p_max_redemptions_per_user integer,
  p_is_active boolean,
  p_plan_ids jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_coupon public.coupons%ROWTYPE;
  v_code text := upper(btrim(p_code));
  v_plan_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF v_code IS NULL OR length(v_code) < 3 OR length(v_code) > 40 OR v_code ~ '[^A-Z0-9_-]' THEN
    RAISE EXCEPTION 'Coupon code must be 3-40 letters, digits, hyphens or underscores' USING ERRCODE = '22023';
  END IF;
  IF p_description IS NULL OR length(p_description) > 2000 THEN
    RAISE EXCEPTION 'Coupon description is too long' USING ERRCODE = '22023';
  END IF;
  IF p_discount_type IS NULL OR p_discount_type NOT IN ('percent', 'fixed') OR p_discount_value IS NULL OR p_discount_value <= 0 THEN
    RAISE EXCEPTION 'Invalid coupon discount' USING ERRCODE = '22023';
  END IF;
  IF p_discount_type = 'percent' AND p_discount_value > 100 THEN
    RAISE EXCEPTION 'Percentage discount cannot exceed 100' USING ERRCODE = '22023';
  END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z][A-Z][A-Z]' OR length(p_currency) <> 3 THEN
    RAISE EXCEPTION 'Currency must be a three-letter uppercase code' USING ERRCODE = '22023';
  END IF;
  IF p_applies_to IS NULL OR p_applies_to NOT IN ('selected_plans', 'all_plans') THEN
    RAISE EXCEPTION 'Invalid coupon plan scope' USING ERRCODE = '22023';
  END IF;
  IF p_starts_at IS NOT NULL AND p_ends_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Coupon end time must be after its start time' USING ERRCODE = '22023';
  END IF;
  IF p_max_redemptions IS NOT NULL AND p_max_redemptions < 1 THEN
    RAISE EXCEPTION 'Maximum redemptions must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_max_redemptions_per_user IS NULL OR p_max_redemptions_per_user < 1 THEN
    RAISE EXCEPTION 'Per-user redemption limit must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_is_active IS NULL OR p_plan_ids IS NULL OR jsonb_typeof(p_plan_ids) <> 'array' OR jsonb_array_length(p_plan_ids) > 500 THEN
    RAISE EXCEPTION 'Invalid coupon status or plan list' USING ERRCODE = '22023';
  END IF;
  IF p_applies_to = 'selected_plans' AND jsonb_array_length(p_plan_ids) = 0 THEN
    RAISE EXCEPTION 'Choose at least one eligible plan' USING ERRCODE = '22023';
  END IF;
  SELECT count(DISTINCT x.plan_id) INTO v_plan_count
  FROM (SELECT value::uuid AS plan_id FROM jsonb_array_elements_text(p_plan_ids)) x
  JOIN public.subscription_plans sp ON sp.id = x.plan_id;
  IF p_applies_to = 'selected_plans' AND v_plan_count <> jsonb_array_length(p_plan_ids) THEN
    RAISE EXCEPTION 'One or more selected plans do not exist' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.coupons(code, description, discount_type, discount_value, currency, applies_to,
      starts_at, ends_at, max_redemptions, max_redemptions_per_user, is_active, created_by)
    VALUES (v_code, p_description, p_discount_type, p_discount_value, p_currency, p_applies_to,
      p_starts_at, p_ends_at, p_max_redemptions, p_max_redemptions_per_user, p_is_active, auth.uid())
    RETURNING * INTO v_coupon;
  ELSE
    UPDATE public.coupons SET code = v_code, description = p_description, discount_type = p_discount_type,
      discount_value = p_discount_value, currency = p_currency, applies_to = p_applies_to,
      starts_at = p_starts_at, ends_at = p_ends_at, max_redemptions = p_max_redemptions,
      max_redemptions_per_user = p_max_redemptions_per_user, is_active = p_is_active
    WHERE id = p_id RETURNING * INTO v_coupon;
    IF NOT FOUND THEN RAISE EXCEPTION 'Coupon not found' USING ERRCODE = 'P0002'; END IF;
  END IF;

  DELETE FROM public.coupon_plan_eligibility WHERE coupon_id = v_coupon.id;
  IF p_applies_to = 'selected_plans' THEN
    INSERT INTO public.coupon_plan_eligibility(coupon_id, plan_id)
    SELECT v_coupon.id, value::uuid FROM jsonb_array_elements_text(p_plan_ids);
  END IF;
  RETURN jsonb_build_object('id', v_coupon.id, 'code', v_coupon.code,
    'discount_type', v_coupon.discount_type, 'discount_value', v_coupon.discount_value,
    'currency', v_coupon.currency, 'applies_to', v_coupon.applies_to,
    'is_active', v_coupon.is_active);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_coupons() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_coupon_plan_eligibility(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_save_coupon(uuid, text, text, text, bigint, text, text, timestamptz, timestamptz, integer, integer, boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_coupons() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_coupon_plan_eligibility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_coupon(uuid, text, text, text, bigint, text, text, timestamptz, timestamptz, integer, integer, boolean, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_user_entitlement_overrides()
RETURNS TABLE(
  id uuid, user_id uuid, user_name text, user_email text, resource_type text,
  resource_key text, access_mode text, starts_at timestamptz, ends_at timestamptz,
  reason text, created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT o.id, o.user_id, p.full_name::text, p.email::text, o.resource_type, o.resource_key,
         o.access_mode, o.starts_at, o.ends_at, o.reason, o.created_at
  FROM public.user_entitlement_overrides o
  LEFT JOIN public.profiles p ON p.id = o.user_id
  ORDER BY o.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_save_user_entitlement_override(
  p_id uuid,
  p_user_id uuid,
  p_resource_type text,
  p_resource_key text,
  p_access_mode text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_id uuid;
  v_resource_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'candidate') THEN
    RAISE EXCEPTION 'Candidate profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_resource_type IS NULL OR p_resource_type NOT IN ('test', 'folder') THEN
    RAISE EXCEPTION 'Only test and folder overrides are currently supported' USING ERRCODE = '22023';
  END IF;
  IF p_resource_key IS NULL OR length(btrim(p_resource_key)) = 0 OR length(p_resource_key) > 200 THEN
    RAISE EXCEPTION 'Resource key is required' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_resource_id := p_resource_key::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Resource key must be a valid resource UUID' USING ERRCODE = '22023';
  END;
  IF p_resource_type = 'test' AND NOT EXISTS (SELECT 1 FROM public.tests WHERE id = v_resource_id) THEN
    RAISE EXCEPTION 'Test not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_resource_type = 'folder' AND NOT EXISTS (SELECT 1 FROM public.folders WHERE id = v_resource_id) THEN
    RAISE EXCEPTION 'Folder not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_access_mode IS NULL OR p_access_mode NOT IN ('free', 'paid', 'grant') THEN
    RAISE EXCEPTION 'Invalid override access mode' USING ERRCODE = '22023';
  END IF;
  IF p_ends_at IS NOT NULL AND p_starts_at IS NOT NULL AND p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'Override end time must be after its start time' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(p_reason) > 500 THEN
    RAISE EXCEPTION 'Reason must be 500 characters or fewer' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.user_entitlement_overrides(
      user_id, resource_type, resource_key, access_mode, starts_at, ends_at, reason, created_by
    ) VALUES (
      p_user_id, p_resource_type, v_resource_id::text, p_access_mode, p_starts_at, p_ends_at, btrim(p_reason), auth.uid()
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.user_entitlement_overrides
    SET user_id = p_user_id, resource_type = p_resource_type, resource_key = v_resource_id::text,
        access_mode = p_access_mode, starts_at = p_starts_at, ends_at = p_ends_at, reason = btrim(p_reason)
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Entitlement override not found' USING ERRCODE = 'P0002'; END IF;
  END IF;
  RETURN jsonb_build_object('id', v_id, 'user_id', p_user_id, 'resource_type', p_resource_type,
    'resource_key', v_resource_id::text, 'access_mode', p_access_mode, 'starts_at', p_starts_at,
    'ends_at', p_ends_at, 'reason', btrim(p_reason));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_revoke_user_entitlement_override(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.user_entitlement_overrides
  SET starts_at = CASE WHEN starts_at IS NULL OR starts_at >= now() THEN now() - interval '1 second' ELSE starts_at END,
      ends_at = now()
  WHERE id = p_id AND (ends_at IS NULL OR ends_at > now());
  IF NOT FOUND THEN RAISE EXCEPTION 'Active entitlement override not found' USING ERRCODE = 'P0002'; END IF;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_user_entitlement_overrides() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_save_user_entitlement_override(uuid, uuid, text, text, text, timestamptz, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_revoke_user_entitlement_override(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_user_entitlement_overrides() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_user_entitlement_override(uuid, uuid, text, text, text, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_user_entitlement_override(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_user_subscriptions()
RETURNS TABLE(
  id uuid, user_id uuid, user_name text, user_email text, plan_id uuid, plan_name text,
  status text, starts_at timestamptz, ends_at timestamptz, admin_note text, created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT us.id, us.user_id, p.full_name::text, p.email::text, us.plan_id, sp.name::text,
         us.status, us.starts_at, us.ends_at, us.admin_note, us.created_at
  FROM public.user_subscriptions us
  JOIN public.profiles p ON p.id = us.user_id
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  ORDER BY us.created_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_grant_user_subscription(
  p_user_id uuid,
  p_plan_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_admin_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_start timestamptz := COALESCE(p_starts_at, now());
  v_end timestamptz;
  v_sub public.user_subscriptions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'candidate') THEN
    RAISE EXCEPTION 'Candidate profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_plan_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE id = p_plan_id AND is_active = true) THEN
    RAISE EXCEPTION 'Active subscription plan not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_admin_note IS NULL OR length(btrim(p_admin_note)) = 0 OR length(p_admin_note) > 500 THEN
    RAISE EXCEPTION 'A reason of 1-500 characters is required for manual grants' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(p_ends_at, v_start + make_interval(days => sp.duration_days))
  INTO v_end FROM public.subscription_plans sp WHERE sp.id = p_plan_id;
  IF v_end <= v_start THEN
    RAISE EXCEPTION 'Subscription end time must be after start time' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.user_subscriptions(user_id, plan_id, status, starts_at, ends_at, created_by, admin_note)
  VALUES (p_user_id, p_plan_id, 'active', v_start, v_end, auth.uid(), btrim(p_admin_note))
  RETURNING * INTO v_sub;
  RETURN jsonb_build_object('id', v_sub.id, 'user_id', v_sub.user_id, 'plan_id', v_sub.plan_id,
    'status', v_sub.status, 'starts_at', v_sub.starts_at, 'ends_at', v_sub.ends_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_cancel_user_subscription(p_id uuid, p_admin_note text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_admin_note IS NULL OR length(btrim(p_admin_note)) = 0 OR length(p_admin_note) > 500 THEN
    RAISE EXCEPTION 'A cancellation reason of 1-500 characters is required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.user_subscriptions
  SET status = 'cancelled', admin_note = left(CASE WHEN admin_note = '' THEN '' ELSE admin_note || E'\n' END || btrim(p_admin_note), 500),
      updated_at = now()
  WHERE id = p_id AND status IN ('active', 'pending');
  IF NOT FOUND THEN RAISE EXCEPTION 'Active or pending subscription not found' USING ERRCODE = 'P0002'; END IF;
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_user_subscriptions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_grant_user_subscription(uuid, uuid, timestamptz, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_cancel_user_subscription(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_user_subscriptions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_user_subscription(uuid, uuid, timestamptz, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_user_subscription(uuid, text) TO authenticated;

-- Candidate checkout order creation is server-priced. Paid orders remain pending
-- until a provider-specific Edge Function verifies payment and calls the service RPC.
CREATE OR REPLACE FUNCTION public.create_checkout_order(p_plan_id uuid, p_coupon_code text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_plan public.subscription_plans%ROWTYPE;
  v_coupon public.coupons%ROWTYPE;
  v_coupon_id uuid;
  v_code text := NULLIF(upper(btrim(p_coupon_code)), '');
  v_discount bigint := 0;
  v_total bigint;
  v_now timestamptz := now();
  v_count bigint;
  v_order public.orders%ROWTYPE;
  v_subscription_id uuid;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND role = 'candidate') THEN
    RAISE EXCEPTION 'Candidate sign-in required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id AND is_active = true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active subscription plan not found' USING ERRCODE = 'P0002'; END IF;

  IF v_code IS NOT NULL THEN
    SELECT * INTO v_coupon FROM public.coupons WHERE code = v_code FOR UPDATE;
    IF NOT FOUND OR NOT v_coupon.is_active THEN RAISE EXCEPTION 'Coupon is invalid or inactive' USING ERRCODE = '22023'; END IF;
    IF v_coupon.starts_at IS NOT NULL AND v_coupon.starts_at > v_now THEN
      RAISE EXCEPTION 'Coupon is not active yet' USING ERRCODE = '22023';
    END IF;
    IF v_coupon.ends_at IS NOT NULL AND v_coupon.ends_at <= v_now THEN
      RAISE EXCEPTION 'Coupon has expired' USING ERRCODE = '22023';
    END IF;
    IF v_coupon.currency <> v_plan.currency THEN
      RAISE EXCEPTION 'Coupon currency does not match this plan' USING ERRCODE = '22023';
    END IF;
    IF v_coupon.applies_to = 'selected_plans' AND NOT EXISTS (
      SELECT 1 FROM public.coupon_plan_eligibility WHERE coupon_id = v_coupon.id AND plan_id = v_plan.id
    ) THEN
      RAISE EXCEPTION 'Coupon is not eligible for this plan' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_count FROM public.coupon_redemptions cr WHERE cr.coupon_id = v_coupon.id;
    v_count := v_count + (SELECT count(*) FROM public.orders o
      WHERE o.coupon_id = v_coupon.id AND o.status = 'pending' AND o.expires_at > v_now);
    IF v_coupon.max_redemptions IS NOT NULL AND v_count >= v_coupon.max_redemptions THEN
      RAISE EXCEPTION 'Coupon redemption limit reached' USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO v_count FROM public.coupon_redemptions cr
      WHERE cr.coupon_id = v_coupon.id AND cr.user_id = v_user_id;
    v_count := v_count + (SELECT count(*) FROM public.orders o
      WHERE o.coupon_id = v_coupon.id AND o.user_id = v_user_id AND o.status = 'pending' AND o.expires_at > v_now);
    IF v_count >= v_coupon.max_redemptions_per_user THEN
      RAISE EXCEPTION 'You have reached this coupon redemption limit' USING ERRCODE = '22023';
    END IF;
    v_coupon_id := v_coupon.id;
    IF v_coupon.discount_type = 'percent' THEN
      v_discount := round((v_plan.price_minor::numeric * v_coupon.discount_value) / 100)::bigint;
    ELSE
      v_discount := v_coupon.discount_value;
    END IF;
    v_discount := LEAST(v_plan.price_minor, v_discount);
  END IF;

  v_total := v_plan.price_minor - v_discount;
  INSERT INTO public.orders(
    user_id, plan_id, coupon_id, currency, subtotal_minor, discount_minor, total_minor,
    duration_days, status, expires_at
  ) VALUES (
    v_user_id, v_plan.id, v_coupon_id, v_plan.currency, v_plan.price_minor, v_discount, v_total,
    v_plan.duration_days, CASE WHEN v_total = 0 THEN 'free' ELSE 'pending' END,
    CASE WHEN v_total = 0 THEN NULL ELSE v_now + interval '15 minutes' END
  ) RETURNING * INTO v_order;

  IF v_total = 0 THEN
    INSERT INTO public.user_subscriptions(user_id, plan_id, status, starts_at, ends_at, order_id, admin_note)
    VALUES (v_user_id, v_plan.id, 'active', v_now, v_now + make_interval(days => v_order.duration_days),
      v_order.id, 'Zero-total checkout')
    RETURNING id INTO v_subscription_id;
    IF v_coupon_id IS NOT NULL THEN
      INSERT INTO public.coupon_redemptions(coupon_id, user_id, order_id, discount_minor)
      VALUES (v_coupon_id, v_user_id, v_order.id, v_discount);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order.id, 'plan_id', v_plan.id, 'plan_name', v_plan.name,
    'currency', v_order.currency, 'subtotal_minor', v_order.subtotal_minor,
    'discount_minor', v_order.discount_minor, 'total_minor', v_order.total_minor,
    'status', v_order.status, 'expires_at', v_order.expires_at,
    'subscription_id', v_subscription_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.service_record_late_payment_for_refund(
  p_order_id uuid,
  p_provider text,
  p_provider_transaction_id text,
  p_amount_minor bigint,
  p_currency text,
  p_provider_created_at timestamptz,
  p_verified_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_transaction_id uuid;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Trusted payment verifier required' USING ERRCODE = '42501';
  END IF;
  IF p_provider IS NULL OR length(btrim(p_provider)) = 0 OR p_provider_transaction_id IS NULL
     OR length(btrim(p_provider_transaction_id)) = 0 OR p_amount_minor IS NULL OR p_amount_minor < 0
     OR p_currency IS NULL OR p_provider_created_at IS NULL OR p_verified_payload IS NULL THEN
    RAISE EXCEPTION 'Invalid late payment payload' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002'; END IF;
  IF v_order.status = 'paid' THEN
    SELECT id INTO v_transaction_id FROM public.payment_transactions
    WHERE order_id = v_order.id AND provider = p_provider AND provider_transaction_id = p_provider_transaction_id
      AND status = 'succeeded';
    IF FOUND THEN RETURN jsonb_build_object('order_id', v_order.id, 'status', 'paid', 'needs_refund', true, 'idempotent', true); END IF;
    RAISE EXCEPTION 'Order is already paid by another transaction' USING ERRCODE = '23505';
  END IF;
  IF v_order.status <> 'pending' OR v_order.expires_at IS NULL OR p_provider_created_at <= v_order.expires_at THEN
    RAISE EXCEPTION 'Order is not an expired late-payment refund candidate' USING ERRCODE = '22023';
  END IF;
  IF p_amount_minor <> v_order.total_minor OR p_currency <> v_order.currency THEN
    RAISE EXCEPTION 'Verified payment amount or currency does not match order' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.payment_transactions(
    order_id, provider, provider_transaction_id, status, amount_minor, currency, verified_at, provider_payload
  ) VALUES (
    v_order.id, p_provider, btrim(p_provider_transaction_id), 'succeeded', p_amount_minor, p_currency, now(), p_verified_payload
  ) RETURNING id INTO v_transaction_id;
  UPDATE public.orders SET status = 'paid', updated_at = now() WHERE id = v_order.id;
  RETURN jsonb_build_object('order_id', v_order.id, 'status', 'paid', 'needs_refund', true, 'payment_transaction_id', v_transaction_id, 'idempotent', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.service_claim_late_refund(
  p_order_id uuid,
  p_provider text,
  p_provider_transaction_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Trusted payment verifier required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.payment_transactions
  SET refund_requested_at = now()
  WHERE order_id = p_order_id AND provider = p_provider
    AND provider_transaction_id = p_provider_transaction_id AND status = 'succeeded'
    AND provider_refund_id IS NULL
    AND (refund_requested_at IS NULL OR refund_requested_at < now() - interval '2 minutes');
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.service_record_late_payment_for_refund(uuid, text, text, bigint, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_record_late_payment_for_refund(uuid, text, text, bigint, text, timestamptz, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.service_claim_late_refund(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_claim_late_refund(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.service_mark_order_paid(
  p_order_id uuid,
  p_provider text,
  p_provider_transaction_id text,
  p_amount_minor bigint,
  p_currency text,
  p_provider_created_at timestamptz,
  p_verified_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_subscription_id uuid;
  v_transaction_id uuid;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Trusted payment verifier required' USING ERRCODE = '42501';
  END IF;
  IF p_provider IS NULL OR length(btrim(p_provider)) = 0 OR length(p_provider) > 80
     OR p_provider_transaction_id IS NULL OR length(btrim(p_provider_transaction_id)) = 0
     OR p_amount_minor IS NULL OR p_amount_minor < 0 OR p_currency IS NULL OR p_provider_created_at IS NULL OR p_verified_payload IS NULL THEN
    RAISE EXCEPTION 'Invalid verified payment payload' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002'; END IF;
  IF p_amount_minor <> v_order.total_minor OR p_currency <> v_order.currency THEN
    RAISE EXCEPTION 'Verified payment amount or currency does not match order' USING ERRCODE = '22023';
  END IF;
  IF v_order.status = 'paid' THEN
    SELECT id INTO v_transaction_id FROM public.payment_transactions
    WHERE order_id = v_order.id AND provider = p_provider AND provider_transaction_id = p_provider_transaction_id;
    IF FOUND THEN RETURN jsonb_build_object('order_id', v_order.id, 'status', 'paid', 'idempotent', true); END IF;
    RAISE EXCEPTION 'Order is already paid by another transaction' USING ERRCODE = '23505';
  END IF;
  IF v_order.status <> 'pending' THEN RAISE EXCEPTION 'Order is not awaiting payment' USING ERRCODE = '22023'; END IF;
  IF v_order.expires_at IS NOT NULL AND p_provider_created_at > v_order.expires_at THEN
    RAISE EXCEPTION 'Provider payment was created after checkout expiry; verified payment must be refunded' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.payment_transactions(
    order_id, provider, provider_transaction_id, status, amount_minor, currency, verified_at, provider_payload
  ) VALUES (
    v_order.id, btrim(p_provider), btrim(p_provider_transaction_id), 'succeeded',
    p_amount_minor, p_currency, now(), p_verified_payload
  ) RETURNING id INTO v_transaction_id;
  UPDATE public.orders SET status = 'paid', updated_at = now() WHERE id = v_order.id;
  INSERT INTO public.user_subscriptions(user_id, plan_id, status, starts_at, ends_at, order_id, admin_note)
  VALUES (v_order.user_id, v_order.plan_id, 'active', now(), now() + make_interval(days => v_order.duration_days),
    v_order.id, 'Verified payment')
  RETURNING id INTO v_subscription_id;
  IF v_order.coupon_id IS NOT NULL THEN
    INSERT INTO public.coupon_redemptions(coupon_id, user_id, order_id, discount_minor)
    VALUES (v_order.coupon_id, v_order.user_id, v_order.id, v_order.discount_minor);
  END IF;
  RETURN jsonb_build_object('order_id', v_order.id, 'status', 'paid', 'subscription_id', v_subscription_id,
    'payment_transaction_id', v_transaction_id, 'idempotent', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_checkout_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_checkout_order(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.service_mark_order_paid(uuid, text, text, bigint, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_mark_order_paid(uuid, text, text, bigint, text, timestamptz, jsonb) TO service_role;

-- Safe customer-facing catalog and self-service subscription/order overview.
CREATE OR REPLACE FUNCTION public.get_active_subscription_plans()
RETURNS TABLE(id uuid, name text, description text, price_minor bigint, currency text, duration_days integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT sp.id, sp.name, sp.description, sp.price_minor, sp.currency, sp.duration_days
  FROM public.subscription_plans sp
  WHERE sp.is_active = true
  ORDER BY sp.price_minor, sp.duration_days, sp.name;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_subscription_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign-in required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'subscriptions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', us.id, 'plan_id', us.plan_id, 'plan_name', sp.name, 'status', us.status,
        'starts_at', us.starts_at, 'ends_at', us.ends_at, 'created_at', us.created_at,
        'is_current', us.status = 'active' AND (us.starts_at IS NULL OR us.starts_at <= now())
          AND (us.ends_at IS NULL OR us.ends_at > now())
      ) ORDER BY us.created_at DESC)
      FROM public.user_subscriptions us
      JOIN public.subscription_plans sp ON sp.id = us.plan_id
      WHERE us.user_id = v_user_id
    ), '[]'::jsonb),
    'orders', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'plan_id', o.plan_id, 'plan_name', sp.name, 'currency', o.currency,
        'subtotal_minor', o.subtotal_minor, 'discount_minor', o.discount_minor,
        'total_minor', o.total_minor, 'status', o.status, 'created_at', o.created_at,
        'expires_at', o.expires_at,
        'checkout_expired', o.status = 'pending' AND o.expires_at IS NOT NULL AND o.expires_at <= now()
      ) ORDER BY o.created_at DESC)
      FROM public.orders o
      JOIN public.subscription_plans sp ON sp.id = o.plan_id
      WHERE o.user_id = v_user_id
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_active_subscription_plans() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_subscription_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_subscription_plans() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_subscription_overview() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_orders()
RETURNS TABLE(
  id uuid, user_id uuid, user_name text, user_email text, plan_name text, provider text, provider_order_id text, currency text,
  subtotal_minor bigint, discount_minor bigint, total_minor bigint, status text,
  expires_at timestamptz, created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT o.id, o.user_id, p.full_name::text, p.email::text, sp.name::text, o.provider, o.provider_order_id, o.currency,
         o.subtotal_minor, o.discount_minor, o.total_minor, o.status, o.expires_at, o.created_at
  FROM public.orders o
  JOIN public.profiles p ON p.id = o.user_id
  JOIN public.subscription_plans sp ON sp.id = o.plan_id
  ORDER BY o.created_at DESC LIMIT 1000;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_payment_transactions()
RETURNS TABLE(
  id uuid, order_id uuid, provider text, provider_transaction_id text, provider_refund_id text, status text,
  amount_minor bigint, currency text, verified_at timestamptz, refunded_at timestamptz, created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT pt.id, pt.order_id, pt.provider, pt.provider_transaction_id, pt.provider_refund_id, pt.status,
         pt.amount_minor, pt.currency, pt.verified_at, pt.refunded_at, pt.created_at
  FROM public.payment_transactions pt
  ORDER BY pt.created_at DESC LIMIT 1000;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_orders() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_payment_transactions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_orders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_payment_transactions() TO authenticated;

CREATE OR REPLACE FUNCTION public.service_mark_order_refunded(
  p_order_id uuid,
  p_provider text,
  p_provider_refund_id text,
  p_amount_minor bigint,
  p_currency text,
  p_verified_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_order public.orders%ROWTYPE;
  v_transaction_id uuid;
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Trusted payment verifier required' USING ERRCODE = '42501';
  END IF;
  IF p_provider IS NULL OR length(btrim(p_provider)) = 0 OR length(p_provider) > 80
     OR p_provider_refund_id IS NULL OR length(btrim(p_provider_refund_id)) = 0
     OR p_amount_minor IS NULL OR p_amount_minor < 0 OR p_currency IS NULL OR p_verified_payload IS NULL THEN
    RAISE EXCEPTION 'Invalid verified refund payload' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002'; END IF;
  IF p_amount_minor <> v_order.total_minor OR p_currency <> v_order.currency THEN
    RAISE EXCEPTION 'Refund amount or currency does not match the paid order' USING ERRCODE = '22023';
  END IF;
  IF v_order.status = 'refunded' THEN
    SELECT id INTO v_transaction_id FROM public.payment_transactions
    WHERE order_id = v_order.id AND provider = p_provider AND provider_refund_id = p_provider_refund_id;
    IF FOUND THEN RETURN jsonb_build_object('order_id', v_order.id, 'status', 'refunded', 'idempotent', true); END IF;
    RAISE EXCEPTION 'Order was already refunded by another transaction' USING ERRCODE = '23505';
  END IF;
  IF v_order.status <> 'paid' THEN RAISE EXCEPTION 'Only paid orders can be refunded' USING ERRCODE = '22023'; END IF;
  UPDATE public.payment_transactions
  SET status = 'refunded', provider_refund_id = btrim(p_provider_refund_id),
      refunded_at = now(), refund_payload = p_verified_payload
  WHERE order_id = v_order.id AND provider = p_provider AND status = 'succeeded'
    AND amount_minor = p_amount_minor AND currency = p_currency
  RETURNING id INTO v_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified payment transaction not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.orders SET status = 'refunded', updated_at = now() WHERE id = v_order.id;
  UPDATE public.user_subscriptions
  SET status = 'refunded', admin_note = left(CASE WHEN admin_note = '' THEN '' ELSE admin_note || E'\n' END || 'Verified provider refund', 500),
      updated_at = now()
  WHERE order_id = v_order.id AND status = 'active';
  RETURN jsonb_build_object('order_id', v_order.id, 'status', 'refunded', 'payment_transaction_id', v_transaction_id, 'idempotent', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.service_mark_order_refunded(uuid, text, text, bigint, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_mark_order_refunded(uuid, text, text, bigint, text, jsonb) TO service_role;

-- Resolve effective access on the server. This function is also used by the
-- typing-result Edge Function; callers must fail closed if it errors.
CREATE OR REPLACE FUNCTION public.can_access_test(p_test_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.can_access_test(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_test(uuid, uuid) TO authenticated, service_role;

-- Replace the broad candidate read policy. Admin/staff policies remain in place.
DROP POLICY IF EXISTS tests_candidate_select ON public.tests;
CREATE POLICY tests_candidate_select ON public.tests
  FOR SELECT TO authenticated
  USING (active = true AND public.can_access_test(id, auth.uid()));


COMMIT;
