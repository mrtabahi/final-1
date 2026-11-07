-- Plan purchase caps and calendar-based expiry.
-- Capacity is reserved by live pending checkouts and consumed by paid/free orders.
alter table public.subscription_plans
  add column if not exists purchase_limit_total integer,
  add column if not exists purchase_limit_per_user integer,
  add column if not exists expiry_mode text not null default 'duration',
  add column if not exists fixed_expiry_date date;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_purchase_limit_total_check,
  add constraint subscription_plans_purchase_limit_total_check
    check (purchase_limit_total is null or purchase_limit_total between 1 and 10000000),
  drop constraint if exists subscription_plans_purchase_limit_per_user_check,
  add constraint subscription_plans_purchase_limit_per_user_check
    check (purchase_limit_per_user is null or purchase_limit_per_user between 1 and 1000000),
  drop constraint if exists subscription_plans_expiry_mode_check,
  add constraint subscription_plans_expiry_mode_check
    check (expiry_mode in ('duration', 'fixed_date')),
  drop constraint if exists subscription_plans_expiry_configuration_check,
  add constraint subscription_plans_expiry_configuration_check
    check (
      (expiry_mode = 'duration' and fixed_expiry_date is null)
      or (expiry_mode = 'fixed_date' and fixed_expiry_date is not null)
    );

alter table public.orders
  add column if not exists expiry_mode text not null default 'duration',
  add column if not exists fixed_expiry_date date;

alter table public.orders
  drop constraint if exists orders_expiry_mode_check,
  add constraint orders_expiry_mode_check
    check (expiry_mode in ('duration', 'fixed_date'));

create index if not exists orders_plan_capacity_idx
  on public.orders(plan_id, status, expires_at);
create index if not exists orders_user_plan_capacity_idx
  on public.orders(user_id, plan_id, status, expires_at);

-- Serialize checkout attempts on the plan row so simultaneous requests cannot oversell.
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
  v_order public.orders%rowtype;
  v_now timestamptz := now();
  v_total_count bigint;
  v_user_count bigint;
  v_fixed_end timestamptz;
begin
  if v_user_id is null then raise exception 'Sign in is required.'; end if;
  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    raise exception 'Coupons are not enabled for checkout yet.';
  end if;

  select * into v_plan
  from public.subscription_plans
  where id = p_plan_id and is_active = true
  for update;

  if not found then raise exception 'This plan is unavailable.'; end if;
  if v_plan.currency <> 'INR' then raise exception 'Only INR plans are currently supported.'; end if;

  if v_plan.expiry_mode = 'fixed_date' then
    if v_plan.fixed_expiry_date is null then raise exception 'This plan has an invalid expiry configuration.'; end if;
    v_fixed_end := ((v_plan.fixed_expiry_date + 1)::timestamp at time zone 'Asia/Kolkata') - interval '1 microsecond';
    if v_fixed_end <= v_now then
      raise exception 'This plan has expired and is no longer available for purchase.';
    end if;
  end if;

  -- Paid/free orders are completed purchases. A non-expired pending order reserves
  -- one slot while checkout is in progress, preventing concurrent overselling.
  select count(*) into v_total_count
  from public.orders o
  where o.plan_id = v_plan.id
    and (
      o.status in ('paid', 'free')
      or (o.status = 'pending' and o.expires_at > v_now)
    );

  if v_plan.purchase_limit_total is not null
     and v_total_count >= v_plan.purchase_limit_total then
    raise exception 'This plan has reached its purchase limit.';
  end if;

  select count(*) into v_user_count
  from public.orders o
  where o.plan_id = v_plan.id
    and o.user_id = v_user_id
    and (
      o.status in ('paid', 'free')
      or (o.status = 'pending' and o.expires_at > v_now)
    );

  if v_plan.purchase_limit_per_user is not null
     and v_user_count >= v_plan.purchase_limit_per_user then
    raise exception 'You have reached the purchase limit for this plan.';
  end if;

  insert into public.orders(
    user_id, plan_id, currency, subtotal_minor, discount_minor, total_minor,
    duration_days, status, expires_at, expiry_mode, fixed_expiry_date
  )
  values(
    v_user_id, v_plan.id, v_plan.currency, v_plan.price_minor, 0, v_plan.price_minor,
    v_plan.duration_days,
    case when v_plan.price_minor = 0 then 'free' else 'pending' end,
    case
      when v_plan.price_minor = 0 then null
      when v_plan.expiry_mode = 'fixed_date' then least(v_now + interval '30 minutes', v_fixed_end)
      else v_now + interval '30 minutes'
    end,
    v_plan.expiry_mode,
    case when v_plan.expiry_mode = 'fixed_date' then v_plan.fixed_expiry_date else null end
  )
  returning * into v_order;

  insert into public.order_status_audit(order_id, event_type, new_state, actor_user_id)
  values(v_order.id, 'created', to_jsonb(v_order), v_user_id);

  if v_plan.price_minor = 0 then
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
      v_order.id, 'Free plan checkout'
    );
  end if;

  return jsonb_build_object(
    'order_id', v_order.id,
    'plan_id', v_plan.id,
    'plan_name', v_plan.name,
    'status', v_order.status,
    'total_minor', v_order.total_minor,
    'currency', v_order.currency,
    'purchase_limit_total', v_plan.purchase_limit_total,
    'purchase_limit_per_user', v_plan.purchase_limit_per_user
  );
end;
$function$;

-- The verified-payment RPC already inserts the membership from the order snapshot.
-- This trigger applies the snapshotted fixed date (or the current plan setting for
-- admin grants) without changing the payment verification pipeline.
create or replace function public.apply_subscription_plan_expiry()
returns trigger
language plpgsql
set search_path = 'pg_catalog', 'public', 'pg_temp'
as $function$
declare
  v_expiry_mode text;
  v_fixed_expiry_date date;
begin
  if new.order_id is not null then
    select o.expiry_mode, o.fixed_expiry_date
      into v_expiry_mode, v_fixed_expiry_date
    from public.orders o
    where o.id = new.order_id;
    if not found then raise exception 'Order not found for subscription activation.'; end if;
  else
    select p.expiry_mode, p.fixed_expiry_date
      into v_expiry_mode, v_fixed_expiry_date
    from public.subscription_plans p
    where p.id = new.plan_id;
  end if;

  if v_expiry_mode = 'fixed_date' then
    if v_fixed_expiry_date is null then
      raise exception 'Fixed expiry date is missing for this plan.';
    end if;
    new.ends_at := ((v_fixed_expiry_date + 1)::timestamp at time zone 'Asia/Kolkata') - interval '1 microsecond';
  end if;
  return new;
end;
$function$;

drop trigger if exists user_subscriptions_apply_plan_expiry on public.user_subscriptions;
create trigger user_subscriptions_apply_plan_expiry
before insert on public.user_subscriptions
for each row execute function public.apply_subscription_plan_expiry();

revoke all on function public.apply_subscription_plan_expiry() from public, anon, authenticated;
