-- Candidate profile avatar support.
-- Apply only after reviewing in the linked development/staging Supabase project.
begin;

alter table public.profiles
  add column if not exists avatar_path text;

-- A profile can reference only an object stored in that same user's folder.
alter table public.profiles
  drop constraint if exists profiles_avatar_path_owner_check;
alter table public.profiles
  add constraint profiles_avatar_path_owner_check
  check (avatar_path is null or avatar_path like id::text || '/%');

-- Public read is intentional: a profile photo is a public identity image shown
-- beside public leaderboard names. Writes remain owner-folder restricted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 2097152,
        array['image/webp'])
on conflict (id) do update
set public = true,
    file_size_limit = 2097152,
    allowed_mime_types = excluded.allowed_mime_types;

-- Public reads are provided by the public bucket; no object-list policy is granted.

drop policy if exists "Users upload their own profile avatar" on storage.objects;
create policy "Users upload their own profile avatar"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users delete their own profile avatar" on storage.objects;
create policy "Users delete their own profile avatar"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Preserve the existing profile column allowlist while allowing avatar_path.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, email, phone, avatar_path) on public.profiles to authenticated;

-- Extend the existing public leaderboard projection with only the avatar path.
-- The bucket contains public identity images; private profile columns stay private.
create or replace view public.public_leaderboard_attempts
with (security_barrier = true) as
select a.id, a.candidate_name, a.language, a.duration_seconds, a.created_at,
       a.gross_wpm, a.net_wpm, a.accuracy,
       coalesce(t.title, '-'::text) as test_name,
       p.avatar_path
from public.attempts a
left join public.tests t on t.id = a.test_id
left join public.profiles p on p.id = a.user_id
where coalesce(t.leaderboard_enabled, true) = true;

commit;
