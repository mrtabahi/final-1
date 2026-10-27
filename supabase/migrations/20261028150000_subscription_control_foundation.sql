-- Subscription control foundation: plans, entitlements and account membership.
-- Public users can read active plan cards and their own subscription only.
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  price_minor bigint not null default 0 check (price_minor >= 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  duration_days integer not null default 30 check (duration_days between 1 and 3650),
  is_active boolean not null default false,
  tagline text not null default '',
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.subscription_plans add column if not exists tagline text not null default '';
alter table public.subscription_plans add column if not exists features jsonb not null default '[]'::jsonb;
alter table public.subscription_plans add column if not exists is_featured boolean not null default false;
alter table public.subscription_plans add column if not exists sort_order integer not null default 0;
alter table public.subscription_plans enable row level security;
drop policy if exists "Active plans are public" on public.subscription_plans;
create policy "Active plans are public" on public.subscription_plans for select to anon, authenticated using (is_active = true or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));
drop policy if exists "Admins manage subscription plans" on public.subscription_plans;
create policy "Admins manage subscription plans" on public.subscription_plans for all to authenticated using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')) with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));
grant select on public.subscription_plans to anon, authenticated;
grant insert, update, delete on public.subscription_plans to authenticated;

create table if not exists public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  resource_type text not null check (resource_type in ('site','menu','submenu','folder','test','materials')),
  resource_key text not null,
  created_at timestamptz not null default now(),
  unique(plan_id, resource_type, resource_key)
);
alter table public.plan_entitlements enable row level security;
drop policy if exists "Plan entitlements visible for active plans" on public.plan_entitlements;
create policy "Plan entitlements visible for active plans" on public.plan_entitlements for select to anon, authenticated using (exists (select 1 from public.subscription_plans sp where sp.id = plan_id and (sp.is_active = true or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'))));
drop policy if exists "Admins manage plan entitlements" on public.plan_entitlements;
create policy "Admins manage plan entitlements" on public.plan_entitlements for all to authenticated using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')) with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));
grant select on public.plan_entitlements to anon, authenticated;
grant insert, update, delete on public.plan_entitlements to authenticated;

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','active','expired','cancelled','refunded')),
  starts_at timestamptz,
  ends_at timestamptz,
  order_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_subscriptions enable row level security;
drop policy if exists "Candidates read own subscriptions" on public.user_subscriptions;
create policy "Candidates read own subscriptions" on public.user_subscriptions for select to authenticated using (user_id = (select auth.uid()) or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));
drop policy if exists "Admins manage subscriptions" on public.user_subscriptions;
create policy "Admins manage subscriptions" on public.user_subscriptions for all to authenticated using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')) with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));
grant select on public.user_subscriptions to authenticated;
grant insert, update, delete on public.user_subscriptions to authenticated;

create index if not exists subscription_plans_active_sort_idx on public.subscription_plans(is_active, sort_order);
create index if not exists user_subscriptions_user_status_idx on public.user_subscriptions(user_id, status, ends_at);
