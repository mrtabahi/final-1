alter table public.folders add column if not exists thumbnail_url text;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('folder-thumbnails','folder-thumbnails',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "folder_thumbnails_admin_upload" on storage.objects;
create policy "folder_thumbnails_admin_upload" on storage.objects for insert to authenticated with check (bucket_id='folder-thumbnails' and public.is_current_user_admin());
drop policy if exists "folder_thumbnails_admin_update" on storage.objects;
create policy "folder_thumbnails_admin_update" on storage.objects for update to authenticated using (bucket_id='folder-thumbnails' and public.is_current_user_admin()) with check (bucket_id='folder-thumbnails' and public.is_current_user_admin());
drop policy if exists "folder_thumbnails_admin_delete" on storage.objects;
create policy "folder_thumbnails_admin_delete" on storage.objects for delete to authenticated using (bucket_id='folder-thumbnails' and public.is_current_user_admin());
