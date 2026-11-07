-- Preserve candidate-only checkout while remaining compatible with legacy production plans.
-- Existing production access is based on active paid membership and feature_access_rules;
-- plan_entitlements is currently empty in production and must not block plan purchases.

create or replace function public.preview_subscription_coupon(
  p_plan_id uuid,
  p_coupon_code text
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_plan public.subscription_plans%rowtype;
  v_coupon public.subscription_coupons%rowtype;
  v_code text := upper(trim(coalesce(p_coupon_code, '')));
  v_total_count bigint;
  v_user_count bigint;
  v_discount bigint;
begin
  if v_user_id is null then raise exception 'Sign in is required.'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'candidate') then
    raise exception 'Candidate sign-in required.';
  end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$' then raise exception 'Enter a valid coupon code.'; end if;

  select * into v_plan from public.subscription_plans
  where id = p_plan_id and is_active = true;
  if not found then raise exception 'This plan is unavailable.'; end if;
  if v_plan.price_minor <= 0 then raise exception 'Coupons apply only to paid plans.'; end if;

  select * into v_coupon from public.subscription_coupons
  where code = v_code and is_active = true;
  if not found then raise exception 'This coupon code is invalid or inactive.'; end if;
  if v_coupon.starts_at > now() or (v_coupon.ends_at is not null and v_coupon.ends_at <= now()) then
    raise exception 'This coupon is not currently valid.';
  end if;
  if cardinality(v_coupon.plan_ids) > 0 and not (v_plan.id = any(v_coupon.plan_ids)) then
    raise exception 'This coupon is not valid for the selected plan.';
  end if;
  if v_plan.price_minor < v_coupon.min_subtotal_minor then
    raise exception 'This plan does not meet the coupon minimum purchase amount.';
  end if;

  select count(*) into v_total_count from public.orders o
  where o.coupon_id = v_coupon.id
    and (o.status in ('paid','free') or (o.status = 'pending' and o.expires_at > now()));
  if v_coupon.max_redemptions is not null and v_total_count >= v_coupon.max_redemptions then
    raise exception 'This coupon has reached its redemption limit.';
  end if;

  select count(*) into v_user_count from public.orders o
  where o.coupon_id = v_coupon.id and o.user_id = v_user_id
    and (o.status in ('paid','free') or (o.status = 'pending' and o.expires_at > now()));
  if v_coupon.max_redemptions_per_user is not null and v_user_count >= v_coupon.max_redemptions_per_user then
    raise exception 'You have reached this coupon’s usage limit.';
  end if;

  if v_coupon.discount_type = 'percentage' then
    v_discount := floor(v_plan.price_minor::numeric * v_coupon.discount_value / 100)::bigint;
  else
    v_discount := least(v_plan.price_minor, v_coupon.discount_value);
  end if;
  if v_coupon.max_discount_minor is not null then
    v_discount := least(v_discount, v_coupon.max_discount_minor);
  end if;
  v_discount := least(v_plan.price_minor, greatest(0, v_discount));

  return jsonb_build_object(
    'valid', true,
    'code', v_coupon.code,
    'discount_type', v_coupon.discount_type,
    'subtotal_minor', v_plan.price_minor,
    'discount_minor', v_discount,
    'total_minor', greatest(0, v_plan.price_minor - v_discount),
    'currency', v_plan.currency
  );
end;
$function$;


revoke all on function public.preview_subscription_coupon(uuid,text) from public, anon;
grant execute on function public.preview_subscription_coupon(uuid,text) to authenticated;

create or replace function public.create_checkout_order(
  p_plan_id uuid,
  p_coupon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_plan public.subscription_plans%rowtype;
  v_coupon public.subscription_coupons%rowtype;
  v_order public.orders%rowtype;
  v_now timestamptz := now();
  v_total_count bigint;
  v_user_count bigint;
  v_fixed_end timestamptz;
  v_code text := upper(trim(coalesce(p_coupon_code, '')));
  v_coupon_id uuid := null;
  v_discount bigint := 0;
  v_total bigint;
begin
  if v_user_id is null then raise exception 'Sign in is required.'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.role = 'candidate') then
    raise exception 'Candidate sign-in required.';
  end if;
  if length(v_code) > 40 then raise exception 'Invalid coupon code.'; end if;

  select * into v_plan
  from public.subscription_plans
  where id = p_plan_id and is_active = true
  for update;

  if not found then raise exception 'This plan is unavailable.'; end if;
  if v_plan.currency <> 'INR' then raise exception 'Only INR plans are currently supported.'; end if;

  if v_plan.expiry_mode = 'fixed_date' then
    if v_plan.fixed_expiry_date is null then raise exception 'This plan has an invalid expiry configuration.'; end if;
    v_fixed_end := ((v_plan.fixed_expiry_date + 1)::timestamp at time zone 'Asia/Kolkata') - interval '1 microsecond';
    if v_fixed_end <= v_now then raise exception 'This plan has expired and is no longer available for purchase.'; end if;
  end if;

  select count(*) into v_total_count
  from public.orders o
  where o.plan_id = v_plan.id
    and (o.status in ('paid', 'free') or (o.status = 'pending' and o.expires_at > v_now));
  if v_plan.purchase_limit_total is not null and v_total_count >= v_plan.purchase_limit_total then
    raise exception 'This plan has reached its purchase limit.';
  end if;

  select count(*) into v_user_count
  from public.orders o
  where o.plan_id = v_plan.id and o.user_id = v_user_id
    and (o.status in ('paid', 'free') or (o.status = 'pending' and o.expires_at > v_now));
  if v_plan.purchase_limit_per_user is not null and v_user_count >= v_plan.purchase_limit_per_user then
    raise exception 'You have reached the purchase limit for this plan.';
  end if;

  if v_code <> '' then
    if v_plan.price_minor <= 0 then raise exception 'Coupons apply only to paid plans.'; end if;
    if v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$' then raise exception 'Enter a valid coupon code.'; end if;

    select * into v_coupon from public.subscription_coupons
    where code = v_code and is_active = true
    for update;
    if not found then raise exception 'This coupon code is invalid or inactive.'; end if;
    if v_coupon.starts_at > v_now or (v_coupon.ends_at is not null and v_coupon.ends_at <= v_now) then
      raise exception 'This coupon is not currently valid.';
    end if;
    if cardinality(v_coupon.plan_ids) > 0 and not (v_plan.id = any(v_coupon.plan_ids)) then
      raise exception 'This coupon is not valid for the selected plan.';
    end if;
    if v_plan.price_minor < v_coupon.min_subtotal_minor then
      raise exception 'This plan does not meet the coupon minimum purchase amount.';
    end if;

    select count(*) into v_total_count from public.orders o
    where o.coupon_id = v_coupon.id
      and (o.status in ('paid','free') or (o.status = 'pending' and o.expires_at > v_now));
    if v_coupon.max_redemptions is not null and v_total_count >= v_coupon.max_redemptions then
      raise exception 'This coupon has reached its redemption limit.';
    end if;

    select count(*) into v_user_count from public.orders o
    where o.coupon_id = v_coupon.id and o.user_id = v_user_id
      and (o.status in ('paid','free') or (o.status = 'pending' and o.expires_at > v_now));
    if v_coupon.max_redemptions_per_user is not null and v_user_count >= v_coupon.max_redemptions_per_user then
      raise exception 'You have reached this coupon’s usage limit.';
    end if;

    if v_coupon.discount_type = 'percentage' then
      v_discount := floor(v_plan.price_minor::numeric * v_coupon.discount_value / 100)::bigint;
    else
      v_discount := least(v_plan.price_minor, v_coupon.discount_value);
    end if;
    if v_coupon.max_discount_minor is not null then
      v_discount := least(v_discount, v_coupon.max_discount_minor);
    end if;
    v_discount := least(v_plan.price_minor, greatest(0, v_discount));
    v_coupon_id := v_coupon.id;
  end if;

  v_total := greatest(0, v_plan.price_minor - v_discount);

  insert into public.orders(
    user_id, plan_id, coupon_id, currency, subtotal_minor, discount_minor, total_minor,
    duration_days, status, expires_at, expiry_mode, fixed_expiry_date
  )
  values(
    v_user_id, v_plan.id, v_coupon_id, v_plan.currency, v_plan.price_minor, v_discount, v_total,
    v_plan.duration_days,
    case when v_total = 0 then 'free' else 'pending' end,
    case
      when v_total = 0 then null
      when v_plan.expiry_mode = 'fixed_date' then least(v_now + interval '30 minutes', v_fixed_end)
      else v_now + interval '30 minutes'
    end,
    v_plan.expiry_mode,
    case when v_plan.expiry_mode = 'fixed_date' then v_plan.fixed_expiry_date else null end
  )
  returning * into v_order;

  insert into public.order_status_audit(order_id, event_type, new_state, actor_user_id)
  values(v_order.id, 'created', to_jsonb(v_order), v_user_id);

  if v_total = 0 then
    insert into public.user_subscriptions(
      user_id, plan_id, status, starts_at, ends_at, order_id, admin_note
    )
    values(
      v_user_id, v_plan.id, 'active', v_now,
      case
        when v_order.expiry_mode = 'fixed_date'
          then ((v_order.fixed_expiry_date + 1)::timestamp at time zone 'Asia/Kolkata') - interval '1 microsecond'
        else v_now + make_interval(days => v_order.duration_days)
      end,
      v_order.id, case when v_coupon_id is null then 'Free plan checkout' else 'Coupon-covered checkout' end
    );
  end if;

  return jsonb_build_object(
    'order_id', v_order.id,
    'plan_id', v_plan.id,
    'plan_name', v_plan.name,
    'status', v_order.status,
    'subtotal_minor', v_order.subtotal_minor,
    'discount_minor', v_order.discount_minor,
    'total_minor', v_order.total_minor,
    'coupon_code', case when v_coupon_id is null then null else v_coupon.code end,
    'currency', v_order.currency,
    'purchase_limit_total', v_plan.purchase_limit_total,
    'purchase_limit_per_user', v_plan.purchase_limit_per_user
  );
end;
$function$;


revoke all on function public.create_checkout_order(uuid,text) from public, anon;
grant execute on function public.create_checkout_order(uuid,text) to authenticated;
