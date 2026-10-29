-- Public experience controls: admin-managed landing page and public-site audio.
create table if not exists public.site_experience_settings (
  id integer primary key default 1 check (id = 1),
  landing_page text not null default 'home' check (landing_page in ('home','login','typing-test')),
  audio_url text,
  audio_loop boolean not null default true,
  audio_enabled boolean not null default false,
  audio_for_logged_in boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.site_experience_settings (id) values (1) on conflict (id) do nothing;
alter table public.site_experience_settings enable row level security;
drop policy if exists "Public can read site experience settings" on public.site_experience_settings;
create policy "Public can read site experience settings" on public.site_experience_settings for select to anon, authenticated using (true);
drop policy if exists "Admins manage site experience settings" on public.site_experience_settings;
create policy "Admins manage site experience settings" on public.site_experience_settings for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
