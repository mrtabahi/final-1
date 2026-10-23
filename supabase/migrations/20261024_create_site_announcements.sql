-- Homepage notices, timed offers and admin-managed promotional content
create table if not exists public.site_announcements (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 body text not null default '',
 content_type text not null default 'notice' check (content_type in ('notice','offer','announcement','event','maintenance','featured')),
 theme text not null default 'aurora' check (theme in ('aurora','gold','blue','rose','green')),
 cta_label text,
 cta_url text,
 starts_at timestamptz,
 ends_at timestamptz,
 is_active boolean not null default true,
 is_public boolean not null default true,
 sort_order integer not null default 0,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.site_announcements enable row level security;
drop policy if exists "Public can read active site announcements" on public.site_announcements;
create policy "Public can read active site announcements" on public.site_announcements for select to anon, authenticated using (is_active = true and is_public = true);
drop policy if exists "Admins can manage site announcements" on public.site_announcements;
create policy "Admins can manage site announcements" on public.site_announcements for all to authenticated using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create index if not exists site_announcements_public_sort on public.site_announcements (is_active, is_public, sort_order, starts_at, ends_at);
