-- Enforce premium test passage access in Postgres, not only in browser JavaScript.
create or replace function public.has_active_paid_membership(p_user_id uuid default auth.uid())
returns boolean
language sql stable security definer
set search_path=pg_catalog,public
as $$
  select exists (
    select 1
    from public.user_subscriptions us
    join public.subscription_plans sp on sp.id=us.plan_id
    where us.user_id=p_user_id
      and us.status='active'
      and sp.price_minor>0
      and (us.starts_at is null or us.starts_at<=now())
      and (us.ends_at is null or us.ends_at>now())
  );
$$;
revoke all on function public.has_active_paid_membership(uuid) from public,anon;
grant execute on function public.has_active_paid_membership(uuid) to authenticated;

create or replace function public.can_access_test(p_test_id uuid, p_user_id uuid default auth.uid())
returns boolean
language plpgsql stable security definer
set search_path=pg_catalog,public
as $$
declare
  v_folder_id uuid;
  v_test_free boolean;
  v_folder_free boolean;
  v_site_free boolean;
begin
  if p_user_id is not null and exists(select 1 from public.profiles p where p.id=p_user_id and p.role='admin') then
    return true;
  end if;
  if p_user_id is not null and public.has_active_paid_membership(p_user_id) then
    return true;
  end if;
  select t.folder_id into v_folder_id from public.tests t where t.id=p_test_id and t.active=true;
  if not found then return false; end if;
  select r.is_free into v_test_free from public.feature_access_rules r where r.resource_type='test' and r.resource_key=p_test_id::text;
  if found then return coalesce(v_test_free,false); end if;
  if v_folder_id is not null then
    select r.is_free into v_folder_free from public.feature_access_rules r where r.resource_type='folder' and r.resource_key=v_folder_id::text;
    if found then return coalesce(v_folder_free,false); end if;
  end if;
  select r.is_free into v_site_free from public.feature_access_rules r where r.resource_type='site' and r.resource_key='*';
  if found then return coalesce(v_site_free,false); end if;
  return false;
end;
$$;
revoke all on function public.can_access_test(uuid,uuid) from public,anon;
grant execute on function public.can_access_test(uuid,uuid) to authenticated;

create or replace function public.list_test_catalog(p_folder_id uuid default null)
returns table(id uuid,title text,language text,duration_minutes integer,target_wpm numeric,min_accuracy numeric,folder_id uuid,mode text,active boolean)
language sql stable security definer
set search_path=pg_catalog,public
as $$
  select t.id,t.title,t.language,t.duration_minutes,t.target_wpm,t.min_accuracy,t.folder_id,t.mode,t.active
  from public.tests t
  where t.active=true and (p_folder_id is null or t.folder_id=p_folder_id)
    and (t.folder_id is null or exists(select 1 from public.folders f where f.id=t.folder_id and f.active=true))
  order by t.sort_order asc nulls first,t.created_at desc;
$$;
revoke all on function public.list_test_catalog(uuid) from public,anon;
grant execute on function public.list_test_catalog(uuid) to authenticated;

create or replace function public.get_test_for_candidate(p_test_id uuid)
returns setof public.tests
language sql stable security definer
set search_path=pg_catalog,public
as $$
  select t.* from public.tests t
  where t.id=p_test_id and t.active=true and public.can_access_test(t.id,auth.uid());
$$;
revoke all on function public.get_test_for_candidate(uuid) from public,anon;
grant execute on function public.get_test_for_candidate(uuid) to authenticated;

drop policy if exists tests_candidate_select on public.tests;
create policy tests_candidate_select on public.tests for select to authenticated
using (is_current_user_admin() or public.can_access_test(id,auth.uid()));


-- Material metadata is visible to signed-in candidates; the outbound URL is returned only after authorization.
create or replace function public.can_access_material(p_material_id uuid,p_user_id uuid default auth.uid())
returns boolean
language plpgsql stable security definer
set search_path=pg_catalog,public
as $$
declare v_free boolean;
begin
  if p_user_id is not null and exists(select 1 from public.profiles p where p.id=p_user_id and p.role='admin') then return true; end if;
  if p_user_id is not null and public.has_active_paid_membership(p_user_id) then return true; end if;
  select r.is_free into v_free from public.feature_access_rules r where r.resource_type='feature' and r.resource_key=p_material_id::text;
  if found then return coalesce(v_free,false); end if;
  return false;
end;
$$;
revoke all on function public.can_access_material(uuid,uuid) from public,anon;
grant execute on function public.can_access_material(uuid,uuid) to authenticated;

create or replace function public.list_material_catalog()
returns table(id uuid,title text,description text,material_type text,created_at timestamptz)
language sql stable security definer
set search_path=pg_catalog,public
as $$
  select sm.id,sm.title,sm.description,sm.material_type,sm.created_at
  from public.study_materials sm where sm.active=true
  order by sm.sort_order asc,sm.created_at desc;
$$;
revoke all on function public.list_material_catalog() from public,anon;
grant execute on function public.list_material_catalog() to authenticated;

create or replace function public.get_material_link(p_material_id uuid)
returns text
language sql stable security definer
set search_path=pg_catalog,public
as $$
  select sm.telegram_url from public.study_materials sm
  where sm.id=p_material_id and sm.active=true and public.can_access_material(sm.id,auth.uid());
$$;
revoke all on function public.get_material_link(uuid) from public,anon;
grant execute on function public.get_material_link(uuid) to authenticated;

drop policy if exists study_materials_candidate_select on public.study_materials;
create policy study_materials_candidate_select on public.study_materials for select to authenticated
using (is_current_user_admin() or public.can_access_material(id,auth.uid()));
