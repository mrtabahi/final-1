-- Secure subscription coupon engine.
-- Coupon eligibility and usage limits are enforced inside the checkout transaction.
create table if not exists public.subscription_coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_type text not null check (discount_type in ('percentage','fixed')),
  discount_value bigint not null,
  min_subtotal_minor bigint not null default 0 check (min_subtotal_minor >= 0),
  max_discount_minor bigint,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  max_redemptions integer,
  max_redemptions_per_user integer,
  plan_ids uuid[] not null default '{}'::uuid[],
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_coupons_code_format check (code = upper(trim(code)) and code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
  constraint subscription_coupons_discount_value_check check (
    (discount_type = 'percentage' and discount_value between 1 and 100)
    or (discount_type = 'fixed' and discount_value between 1 and 100000000000)
  ),
  constraint subscription_coupons_max_discount_check check (max_discount_minor is null or max_discount_minor > 0),
  constraint subscription_coupons_validity_check check (ends_at is null or ends_at > starts_at),
  constraint subscription_coupons_max_redemptions_check check (max_redemptions is null or max_redemptions between 1 and 10000000),
  constraint subscription_coupons_user_redemptions_check check (max_redemptions_per_user is null or max_redemptions_per_user between 1 and 1000000)
);

create unique index if not exists subscription_coupons_code_uidx
  on public.subscription_coupons(code);
create index if not exists subscription_coupons_active_window_idx
  on public.subscription_coupons(is_active, starts_at, ends_at);

alter table public.subscription_coupons enable row level security;
drop policy if exists "Admins read subscription coupons" on public.subscription_coupons;
create policy "Admins read subscription coupons" on public.subscription_coupons
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));
drop policy if exists "Admins create subscription coupons" on public.subscription_coupons;
create policy "Admins create subscription coupons" on public.subscription_coupons
  for insert to authenticated
  with check (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
    and (created_by is null or created_by = (select auth.uid()))
  );
drop policy if exists "Admins update subscription coupons" on public.subscription_coupons;
create policy "Admins update subscription coupons" on public.subscription_coupons
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));
-- Remove permissive default grants first; RLS does not protect TRUNCATE.
revoke all on public.subscription_coupons from public, anon, authenticated;
grant select, insert, update on public.subscription_coupons to authenticated;

-- Do not silently reinterpret legacy coupon references from the older coupon engine.
do $coupon_fk_guard$
begin
  if exists (select 1 from public.orders where coupon_id is not null) then
    raise exception 'Cannot switch orders.coupon_id to subscription_coupons while legacy coupon references exist.';
  end if;
end;
$coupon_fk_guard$;

-- Staging may have an unused FK to the legacy public.coupons table; keep that table intact.
alter table public.orders drop constraint if exists orders_coupon_id_fkey;
alter table public.orders
  add constraint orders_coupon_id_fkey
  foreign key (coupon_id) references public.subscription_coupons(id) on delete restrict;
create index if not exists orders_coupon_usage_idx
  on public.orders(coupon_id, status, expires_at);
create index if not exists orders_coupon_user_usage_idx
  on public.orders(coupon_id, user_id, status, expires_at);

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
