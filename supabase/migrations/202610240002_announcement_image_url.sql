-- Optional artwork for homepage announcements.
alter table public.site_announcements
  add column if not exists image_url text;
