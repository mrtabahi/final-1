-- Direct PDF uploads, pinned ordering, and private download access.
begin;

alter table public.study_materials
  add column if not exists storage_path text,
  add column if not exists pinned boolean not null default false;

alter table public.study_materials
  alter column telegram_url drop not null;

alter table public.study_materials
  drop constraint if exists study_materials_telegram_url_check;
alter table public.study_materials
  add constraint study_materials_source_check
  check (
    storage_path is not null
    or telegram_url ~ '^https://(t\\.me|telegram\\.me)/[^[:space:]]+$'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-pdfs', 'study-pdfs', false, 20971520, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload study PDFs" on storage.objects;
create policy "Admins upload study PDFs"
on storage.objects for insert to authenticated
with check (bucket_id = 'study-pdfs' and public.is_current_user_admin());

drop policy if exists "Admins replace study PDFs" on storage.objects;
create policy "Admins replace study PDFs"
on storage.objects for update to authenticated
using (bucket_id = 'study-pdfs' and public.is_current_user_admin())
with check (bucket_id = 'study-pdfs' and public.is_current_user_admin());

drop policy if exists "Admins delete study PDFs" on storage.objects;
create policy "Admins delete study PDFs"
on storage.objects for delete to authenticated
using (bucket_id = 'study-pdfs' and public.is_current_user_admin());

drop policy if exists "Eligible candidates download study PDFs" on storage.objects;
create policy "Eligible candidates download study PDFs"
on storage.objects for select to authenticated
using (
  bucket_id = 'study-pdfs'
  and exists (
    select 1
    from public.study_materials sm
    where sm.storage_path = name
      and sm.active = true
      and public.can_access_material(sm.id, (select auth.uid()))
  )
);

drop function if exists public.list_material_catalog();
create function public.list_material_catalog()
returns table (
  id uuid,
  title text,
  description text,
  material_type text,
  created_at timestamptz,
  pinned boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select sm.id, sm.title, sm.description, sm.material_type, sm.created_at, sm.pinned
  from public.study_materials sm
  where sm.active = true
  order by sm.pinned desc, sm.sort_order asc, sm.created_at desc;
$function$;

revoke all on function public.list_material_catalog() from public, anon;
grant execute on function public.list_material_catalog() to authenticated;

commit;