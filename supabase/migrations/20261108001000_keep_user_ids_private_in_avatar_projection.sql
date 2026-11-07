-- Keep internal account UUIDs private while maintaining public leaderboard avatar URLs.
alter table public.public_leaderboard_attempts
  drop column if exists user_id;

create or replace function public.sync_public_leaderboard_attempt_projection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_test_name text := '-';
  v_enabled boolean := true;
  v_avatar_url text;
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

  select p.avatar_url into v_avatar_url
  from public.profiles p where p.id = new.user_id;

  if v_enabled then
    insert into public.public_leaderboard_attempts
      (id,avatar_url,candidate_name,language,duration_seconds,created_at,gross_wpm,net_wpm,accuracy,test_name)
    values
      (new.id,v_avatar_url,new.candidate_name,new.language,new.duration_seconds,new.created_at,new.gross_wpm,new.net_wpm,new.accuracy,coalesce(v_test_name,'-'))
    on conflict (id) do update set
      avatar_url=excluded.avatar_url,
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

create or replace function public.sync_public_leaderboard_test_projection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.leaderboard_enabled then
    insert into public.public_leaderboard_attempts
      (id,avatar_url,candidate_name,language,duration_seconds,created_at,gross_wpm,net_wpm,accuracy,test_name)
    select a.id,p.avatar_url,a.candidate_name,a.language,a.duration_seconds,a.created_at,a.gross_wpm,a.net_wpm,a.accuracy,new.title
    from public.attempts a
    left join public.profiles p on p.id = a.user_id
    where a.test_id = new.id
    on conflict (id) do update set
      avatar_url=excluded.avatar_url,
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

create or replace function public.sync_profile_avatar_to_public_leaderboard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.avatar_url is distinct from old.avatar_url then
    update public.public_leaderboard_attempts p
    set avatar_url = new.avatar_url
    from public.attempts a
    where p.id = a.id
      and a.user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_profile_avatar_to_public_leaderboard() from public, anon, authenticated;

update public.public_leaderboard_attempts p
set avatar_url = pr.avatar_url
from public.attempts a
left join public.profiles pr on pr.id = a.user_id
where p.id = a.id;
