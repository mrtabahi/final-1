-- PDF library: direct PDF uploads, free/paid access, pinning and secure downloads.
alter table public.study_materials
  alter column telegram_url drop not null,
  add column if not exists storage_path text,
  add column if not exists file_name text,
  add column if not exists file_size_bytes bigint,
  add column if not exists is_free boolean not null default false,
  add column if not exists pinned boolean not null default false;

alter table public.study_materials
  drop constraint if exists study_materials_source_check;
alter table public.study_materials
  add constraint study_materials_source_check
  check (
    (storage_path is not null and char_length(trim(storage_path)) > 0)
    or
    (telegram_url is not null and telegram_url ~ '^https://(t[.]me|telegram[.]me)/[^[:space:]]+$')
  );

create index if not exists study_materials_public_order_idx
  on public.study_materials (active desc, pinned desc, sort_order asc, created_at desc);

-- Private bucket: files are never anonymously readable. Signed URLs are issued only
-- after the authenticated user's access is checked by can_access_material().
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('study-materials','study-materials',false,52428800,array['application/pdf'])
on conflict (id) do update
set public=false,file_size_limit=52428800,allowed_mime_types=array['application/pdf'];

drop policy if exists "study_materials_file_admin_insert" on storage.objects;
create policy "study_materials_file_admin_insert"
on storage.objects for insert to authenticated
with check (bucket_id='study-materials' and public.is_current_user_admin());

drop policy if exists "study_materials_file_admin_update" on storage.objects;
create policy "study_materials_file_admin_update"
on storage.objects for update to authenticated
using (bucket_id='study-materials' and public.is_current_user_admin())
with check (bucket_id='study-materials' and public.is_current_user_admin());

drop policy if exists "study_materials_file_admin_delete" on storage.objects;
create policy "study_materials_file_admin_delete"
on storage.objects for delete to authenticated
using (bucket_id='study-materials' and public.is_current_user_admin());

drop policy if exists "study_materials_file_authorized_read" on storage.objects;
create policy "study_materials_file_authorized_read"
on storage.objects for select to authenticated
using (
  bucket_id='study-materials'
  and exists (
    select 1 from public.study_materials sm
    where sm.storage_path=storage.objects.name
      and sm.active=true
      and public.can_access_material(sm.id,auth.uid())
  )
);

create or replace function public.can_access_material(p_material_id uuid,p_user_id uuid default auth.uid())
returns boolean
language plpgsql stable security definer
set search_path=pg_catalog,public
as $$
declare v_free boolean;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then return false; end if;
  if public.is_current_user_admin() then return true; end if;
  select sm.is_free into v_free
  from public.study_materials sm
  where sm.id=p_material_id and sm.active=true;
  if not found then return false; end if;
  if coalesce(v_free,false) then return true; end if;
  return coalesce(public.has_active_paid_subscription(),false);
end;
$$;
revoke all on function public.can_access_material(uuid,uuid) from public,anon;
grant execute on function public.can_access_material(uuid,uuid) to authenticated;

drop function if exists public.list_material_catalog();
create function public.list_material_catalog()
returns table(
  id uuid,title text,description text,material_type text,created_at timestamptz,
  is_free boolean,pinned boolean,has_file boolean
)
language sql stable security definer
set search_path=pg_catalog,public
as $$
  select sm.id,sm.title,sm.description,sm.material_type,sm.created_at,
         sm.is_free,sm.pinned,(sm.storage_path is not null)
  from public.study_materials sm
  where sm.active=true
  order by sm.is_pinned desc,sm.sort_order asc,sm.created_at desc;
$$;
revoke all on function public.list_material_catalog() from public,anon;
grant execute on function public.list_material_catalog() to authenticated;

create or replace function public.get_material_link(p_material_id uuid)
returns text
language sql stable security definer
set search_path=pg_catalog,public
as $$
  select coalesce(sm.storage_path,sm.telegram_url)
  from public.study_materials sm
  where sm.id=p_material_id and sm.active=true
    and public.can_access_material(sm.id,auth.uid());
$$;
revoke all on function public.get_material_link(uuid) from public,anon;
grant execute on function public.get_material_link(uuid) to authenticated;

drop policy if exists study_materials_candidate_select on public.study_materials;
create policy study_materials_candidate_select on public.study_materials for select to authenticated
using (is_current_user_admin() or (active=true and public.can_access_material(id,auth.uid())));
