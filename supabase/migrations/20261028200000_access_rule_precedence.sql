-- Root website rule is the top-level override. Authorization always uses the caller's JWT, never a caller-supplied user ID.
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
  v_uid uuid := auth.uid();
begin
  if v_uid is not null and exists(select 1 from public.profiles p where p.id=v_uid and p.role='admin') then return true; end if;
  if v_uid is not null and public.has_active_paid_membership(v_uid) then return true; end if;
  select r.is_free into v_site_free from public.feature_access_rules r where r.resource_type='site' and r.resource_key='*';
  if found then return coalesce(v_site_free,false); end if;
  select t.folder_id into v_folder_id from public.tests t where t.id=p_test_id and t.active=true;
  if not found then return false; end if;
  select r.is_free into v_test_free from public.feature_access_rules r where r.resource_type='test' and r.resource_key=p_test_id::text;
  if found then return coalesce(v_test_free,false); end if;
  if v_folder_id is not null then
    select r.is_free into v_folder_free from public.feature_access_rules r where r.resource_type='folder' and r.resource_key=v_folder_id::text;
    if found then return coalesce(v_folder_free,false); end if;
  end if;
  return false;
end;
$$;

create or replace function public.can_access_material(p_material_id uuid,p_user_id uuid default auth.uid())
returns boolean
language plpgsql stable security definer
set search_path=pg_catalog,public
as $$
declare v_free boolean; v_uid uuid := auth.uid();
begin
  if v_uid is not null and exists(select 1 from public.profiles p where p.id=v_uid and p.role='admin') then return true; end if;
  if v_uid is not null and public.has_active_paid_membership(v_uid) then return true; end if;
  select r.is_free into v_free from public.feature_access_rules r where r.resource_type='site' and r.resource_key='*';
  if found then return coalesce(v_free,false); end if;
  select r.is_free into v_free from public.feature_access_rules r where r.resource_type='feature' and r.resource_key=p_material_id::text;
  if found then return coalesce(v_free,false); end if;
  return false;
end;
$$;
revoke all on function public.has_active_paid_membership(uuid) from authenticated;
