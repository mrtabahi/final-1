-- Access & monetization foundation.
-- Apply to a staging Supabase project first. This file is intentionally not auto-applied.
BEGIN;

-- Existing content remains accessible during rollout. New content defaults to paid.
ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'paid';
ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'paid';

UPDATE public.folders SET access_mode = 'free' WHERE access_mode IS NULL OR access_mode = 'paid';
UPDATE public.tests SET access_mode = 'free' WHERE access_mode IS NULL OR access_mode = 'paid';

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
    'orders','payment_transactions','coupon_redemptions','access_policies'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

-- Admin UI can read/edit only the access_mode field through existing admin-only table policies.
-- Keep existing table-level policies intact during the first rollout; access enforcement must
-- be completed in the passage-delivery path before any paid item is switched to Paid in production.

COMMIT;
