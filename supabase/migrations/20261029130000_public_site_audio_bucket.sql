-- Public background audio bucket. Only admins may upload/replace; visitors can stream public audio.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('public-site-audio','public-site-audio',true,10485760,array['audio/mpeg','audio/mp3','audio/ogg','audio/wav','audio/webm','audio/aac','audio/mp4'])
on conflict (id) do update set public=true,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Public can read site background audio" on storage.objects;
create policy "Public can read site background audio" on storage.objects for select to anon,authenticated using (bucket_id='public-site-audio');
drop policy if exists "Admins can upload site background audio" on storage.objects;
create policy "Admins can upload site background audio" on storage.objects for insert to authenticated with check (bucket_id='public-site-audio' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
drop policy if exists "Admins can replace site background audio" on storage.objects;
create policy "Admins can replace site background audio" on storage.objects for update to authenticated using (bucket_id='public-site-audio' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin')) with check (bucket_id='public-site-audio' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
