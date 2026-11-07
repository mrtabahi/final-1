-- Replace the SECURITY DEFINER leaderboard view with a narrow, RLS-protected projection table.
-- The public surface remains limited to the exact fields consumed by leaderboard.js.
drop view if exists public.public_leaderboard_attempts;

create table if not exists public.public_leaderboard_attempts (
  id uuid primary key,
  candidate_name text not null,
  language text not null,
  duration_seconds integer not null,
  created_at timestamptz not null,
  gross_wpm numeric not null,
  net_wpm numeric not null,
  accuracy numeric not null,
  test_name text not null default '-'
);

alter table public.public_leaderboard_attempts enable row level security;
revoke all privileges on table public.public_leaderboard_attempts from public, anon, authenticated, service_role;
grant select on table public.public_leaderboard_attempts to anon, authenticated, service_role;
drop policy if exists public_leaderboard_projection_read on public.public_leaderboard_attempts;
create policy public_leaderboard_projection_read
  on public.public_leaderboard_attempts for select to anon, authenticated
  using (true);

create or replace function public.sync_public_leaderboard_attempt_projection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_test_name text := '-';
  v_enabled boolean := true;
begin
  if tg_op = 'DELETE' then
    delete from public.public_leaderboard_attempts where id = old.id;
    return old;
  end if;

  if new.test_id is not null then
    select t.title, coalesce(t.leaderboard_enabled, true)
      into v_test_name, v_enabled
      from public.tests t
      where t.id = new.test_id;
    if not found then
      v_test_name := '-';
      v_enabled := true;
    end if;
  end if;

  if v_enabled then
    insert into public.public_leaderboard_attempts
      (id,candidate_name,language,duration_seconds,created_at,gross_wpm,net_wpm,accuracy,test_name)
    values
      (new.id,new.candidate_name,new.language,new.duration_seconds,new.created_at,new.gross_wpm,new.net_wpm,new.accuracy,coalesce(v_test_name,'-'))
    on conflict (id) do update set
      candidate_name=excluded.candidate_name,
      language=excluded.language,
      duration_seconds=excluded.duration_seconds,
      created_at=excluded.created_at,
      gross_wpm=excluded.gross_wpm,
      net_wpm=excluded.net_wpm,
      accuracy=excluded.accuracy,
      test_name=excluded.test_name;
  else
    delete from public.public_leaderboard_attempts where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_public_leaderboard_attempt_projection() from public, anon, authenticated;

create or replace function public.sync_public_leaderboard_test_projection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.leaderboard_enabled then
    insert into public.public_leaderboard_attempts
      (id,candidate_name,language,duration_seconds,created_at,gross_wpm,net_wpm,accuracy,test_name)
    select a.id,a.candidate_name,a.language,a.duration_seconds,a.created_at,a.gross_wpm,a.net_wpm,a.accuracy,new.title
    from public.attempts a
    where a.test_id = new.id
    on conflict (id) do update set
      candidate_name=excluded.candidate_name,
      language=excluded.language,
      duration_seconds=excluded.duration_seconds,
      created_at=excluded.created_at,
      gross_wpm=excluded.gross_wpm,
      net_wpm=excluded.net_wpm,
      accuracy=excluded.accuracy,
      test_name=excluded.test_name;
  else
    delete from public.public_leaderboard_attempts p
    where p.id in (select a.id from public.attempts a where a.test_id = new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.sync_public_leaderboard_test_projection() from public, anon, authenticated;

drop trigger if exists attempts_sync_public_leaderboard_projection on public.attempts;
create trigger attempts_sync_public_leaderboard_projection
  after insert or update or delete on public.attempts
  for each row execute function public.sync_public_leaderboard_attempt_projection();

drop trigger if exists tests_sync_public_leaderboard_projection on public.tests;
create trigger tests_sync_public_leaderboard_projection
  after update of title, leaderboard_enabled on public.tests
  for each row execute function public.sync_public_leaderboard_test_projection();

insert into public.public_leaderboard_attempts
  (id,candidate_name,language,duration_seconds,created_at,gross_wpm,net_wpm,accuracy,test_name)
select a.id,a.candidate_name,a.language,a.duration_seconds,a.created_at,a.gross_wpm,a.net_wpm,a.accuracy,coalesce(t.title,'-')
from public.attempts a
left join public.tests t on t.id = a.test_id
where coalesce(t.leaderboard_enabled,true) = true
on conflict (id) do update set
  candidate_name=excluded.candidate_name,
  language=excluded.language,
  duration_seconds=excluded.duration_seconds,
  created_at=excluded.created_at,
  gross_wpm=excluded.gross_wpm,
  net_wpm=excluded.net_wpm,
  accuracy=excluded.accuracy,
  test_name=excluded.test_name;
