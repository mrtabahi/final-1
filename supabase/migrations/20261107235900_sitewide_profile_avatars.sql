-- Site-wide candidate profile avatars: public display URL, owner-only upload/update/delete.
alter table public.profiles add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists profile_avatars_owner_select on storage.objects;
create policy profile_avatars_owner_select on storage.objects
for select to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists profile_avatars_owner_insert on storage.objects;
create policy profile_avatars_owner_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists profile_avatars_owner_update on storage.objects;
create policy profile_avatars_owner_update on storage.objects
for update to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists profile_avatars_owner_delete on storage.objects;
create policy profile_avatars_owner_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

alter table public.public_leaderboard_attempts
  add column if not exists user_id uuid,
  add column if not exists avatar_url text;

update public.public_leaderboard_attempts p
set user_id = a.user_id,
    avatar_url = pr.avatar_url
from public.attempts a
left join public.profiles pr on pr.id = a.user_id
where p.id = a.id;

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
      (id,user_id,avatar_url,candidate_name,language,duration_seconds,created_at,gross_wpm,net_wpm,accuracy,test_name)
    values
      (new.id,new.user_id,v_avatar_url,new.candidate_name,new.language,new.duration_seconds,new.created_at,new.gross_wpm,new.net_wpm,new.accuracy,coalesce(v_test_name,'-'))
    on conflict (id) do update set
      user_id=excluded.user_id,
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
      (id,user_id,avatar_url,candidate_name,language,duration_seconds,created_at,gross_wpm,net_wpm,accuracy,test_name)
    select a.id,a.user_id,p.avatar_url,a.candidate_name,a.language,a.duration_seconds,a.created_at,a.gross_wpm,a.net_wpm,a.accuracy,new.title
    from public.attempts a
    left join public.profiles p on p.id = a.user_id
    where a.test_id = new.id
    on conflict (id) do update set
      user_id=excluded.user_id,
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
    update public.public_leaderboard_attempts
    set avatar_url = new.avatar_url
    where user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_profile_avatar_to_public_leaderboard() from public, anon, authenticated;
drop trigger if exists profiles_sync_public_leaderboard_avatar on public.profiles;
create trigger profiles_sync_public_leaderboard_avatar
after update of avatar_url on public.profiles
for each row execute function public.sync_profile_avatar_to_public_leaderboard();

-- Refresh existing projection rows with the owning profile's avatar.
update public.public_leaderboard_attempts p
set user_id = a.user_id,
    avatar_url = pr.avatar_url
from public.attempts a
left join public.profiles pr on pr.id = a.user_id
where p.id = a.id;
