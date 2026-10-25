create table if not exists public.site_access_settings (
  id integer primary key default 1 check (id = 1),
  registration_enabled boolean not null default true,
  registration_paused_message text not null default 'New account creation is temporarily paused. Please try again later.',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
insert into public.site_access_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.candidate_login_messages (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.candidate_activity_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  user_agent text,
  last_page_path text,
  created_at timestamptz not null default now()
);
create index if not exists candidate_activity_sessions_user_started_idx
  on public.candidate_activity_sessions(user_id, started_at desc);
create index if not exists candidate_activity_sessions_last_seen_idx
  on public.candidate_activity_sessions(last_seen_at desc);

alter table public.site_access_settings enable row level security;
alter table public.candidate_login_messages enable row level security;
alter table public.candidate_activity_sessions enable row level security;

drop policy if exists site_access_settings_public_read on public.site_access_settings;
create policy site_access_settings_public_read on public.site_access_settings
  for select to anon, authenticated using (true);
drop policy if exists site_access_settings_admin_update on public.site_access_settings;
create policy site_access_settings_admin_update on public.site_access_settings
  for all to authenticated using (is_current_user_admin()) with check (is_current_user_admin());

drop policy if exists candidate_login_messages_self_read on public.candidate_login_messages;
create policy candidate_login_messages_self_read on public.candidate_login_messages
  for select to authenticated using (user_id = (select auth.uid()) or is_current_user_admin());
drop policy if exists candidate_login_messages_admin_manage on public.candidate_login_messages;
create policy candidate_login_messages_admin_manage on public.candidate_login_messages
  for all to authenticated using (is_current_user_admin()) with check (is_current_user_admin());

drop policy if exists candidate_activity_sessions_self_insert on public.candidate_activity_sessions;
create policy candidate_activity_sessions_self_insert on public.candidate_activity_sessions
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists candidate_activity_sessions_self_update on public.candidate_activity_sessions;
create policy candidate_activity_sessions_self_update on public.candidate_activity_sessions
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists candidate_activity_sessions_read_self_or_admin on public.candidate_activity_sessions;
create policy candidate_activity_sessions_read_self_or_admin on public.candidate_activity_sessions
  for select to authenticated using (user_id = (select auth.uid()) or is_current_user_admin());