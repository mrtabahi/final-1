-- Prevent checkout or free activation of plans that grant no configured access.
-- The check is server-side so direct RPC calls cannot bypass the UI.
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

  -- Never accept payment or activate a zero-value plan with no configured access.
  IF NOT EXISTS (SELECT 1 FROM public.plan_entitlements WHERE plan_id = v_plan.id) THEN
    RAISE EXCEPTION 'Plan is unavailable until access entitlements are configured' USING ERRCODE = '22023';
  END IF;

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
