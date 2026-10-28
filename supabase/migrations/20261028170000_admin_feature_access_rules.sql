-- Audited, admin-controlled paid/free rules for the public site and individual features.
create table if not exists public.feature_access_rules (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('site','menu','folder','test','feature')),
  resource_key text not null,
  is_free boolean not null default false,
  upgrade_message text not null default 'Upgrade your plan to unlock this content.',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(resource_type, resource_key)
);
alter table public.feature_access_rules enable row level security;
revoke all on public.feature_access_rules from anon, public;
grant select on public.feature_access_rules to anon, authenticated;
grant insert, update, delete on public.feature_access_rules to authenticated;
drop policy if exists "Access rules are readable" on public.feature_access_rules;
create policy "Access rules are readable" on public.feature_access_rules for select to anon, authenticated using (true);
drop policy if exists "Admins manage access rules" on public.feature_access_rules;
create policy "Admins manage access rules" on public.feature_access_rules for all to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'))
with check (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
create table if not exists public.feature_access_audit (
 id bigint generated always as identity primary key,
 rule_id uuid,
 resource_type text not null,
 resource_key text not null,
 old_is_free boolean,
 new_is_free boolean not null,
 changed_by uuid references auth.users(id) on delete set null,
 changed_at timestamptz not null default now()
);
alter table public.feature_access_audit enable row level security;
revoke all on public.feature_access_audit from anon, public, authenticated;
grant select on public.feature_access_audit to authenticated;
drop policy if exists "Admins read access audit" on public.feature_access_audit;
create policy "Admins read access audit" on public.feature_access_audit for select to authenticated
using (exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='admin'));
create or replace function public.audit_feature_access_rule()
returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp
as $$
begin
 insert into public.feature_access_audit(rule_id,resource_type,resource_key,old_is_free,new_is_free,changed_by)
 values(new.id,new.resource_type,new.resource_key,case when tg_op='UPDATE' then old.is_free else null end,new.is_free,auth.uid());
 new.updated_at:=now();
 new.updated_by:=auth.uid();
 return new;
end;
$$;
revoke all on function public.audit_feature_access_rule() from public, anon, authenticated;
drop trigger if exists feature_access_rules_audit on public.feature_access_rules;
create trigger feature_access_rules_audit before insert or update on public.feature_access_rules
for each row execute function public.audit_feature_access_rule();
