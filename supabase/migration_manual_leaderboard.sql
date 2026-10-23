create table if not exists public.manual_leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  candidate_name text not null,
  language text not null default '-',
  test_name text not null default '-',
  duration_seconds integer,
  gross_wpm numeric,
  net_wpm numeric not null default 0,
  accuracy numeric,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  is_manual boolean not null default true
);
alter table public.manual_leaderboard_entries enable row level security;
drop policy if exists "Public can read manual leaderboard entries" on public.manual_leaderboard_entries;
create policy "Public can read manual leaderboard entries" on public.manual_leaderboard_entries for select using (true);
drop policy if exists "Admins manage manual leaderboard entries" on public.manual_leaderboard_entries;
create policy "Admins manage manual leaderboard entries" on public.manual_leaderboard_entries for all
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'))
with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'));
