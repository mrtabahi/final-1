-- Limited, per-candidate management permissions. Never elevate profiles.role.
create table if not exists public.candidate_permissions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  permissions jsonb not null default '{}'::jsonb,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidate_permissions_object check (jsonb_typeof(permissions) = 'object')
);
alter table public.candidate_permissions enable row level security;
drop policy if exists candidate_permissions_admin_all on public.candidate_permissions;
create policy candidate_permissions_admin_all on public.candidate_permissions for all to authenticated
  using (public.is_current_user_admin()) with check (public.is_current_user_admin());
drop policy if exists candidate_permissions_self_select on public.candidate_permissions;
create policy candidate_permissions_self_select on public.candidate_permissions for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on function public.has_candidate_permission(text) from public;
create or replace function public.has_candidate_permission(permission_key text)
returns boolean language sql stable security definer set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles p
    join public.candidate_permissions cp on cp.user_id = p.id
    where p.id = (select auth.uid()) and p.role = 'candidate'
      and coalesce(cp.permissions ->> permission_key, 'false') = 'true'
  );
$$;
grant execute on function public.has_candidate_permission(text) to authenticated;
grant select, insert, update, delete on public.candidate_permissions to authenticated;
drop policy if exists folders_staff_manage on public.folders;
create policy folders_staff_manage on public.folders for all to authenticated
  using (public.has_candidate_permission('folder_tests')) with check (public.has_candidate_permission('folder_tests'));
drop policy if exists tests_staff_manage on public.tests;
create policy tests_staff_manage on public.tests for all to authenticated
  using (public.has_candidate_permission('folder_tests')) with check (public.has_candidate_permission('folder_tests'));
drop policy if exists attempts_staff_select on public.attempts;
create policy attempts_staff_select on public.attempts for select to authenticated
  using (public.has_candidate_permission('results_attempts'));
drop policy if exists study_materials_staff_manage on public.study_materials;
create policy study_materials_staff_manage on public.study_materials for all to authenticated
  using (public.has_candidate_permission('study_materials')) with check (public.has_candidate_permission('study_materials'));
drop policy if exists site_announcements_staff_manage on public.site_announcements;
create policy site_announcements_staff_manage on public.site_announcements for all to authenticated
  using (public.has_candidate_permission('website_content')) with check (public.has_candidate_permission('website_content'));
drop policy if exists ad_settings_staff_update on public.ad_settings;
create policy ad_settings_staff_update on public.ad_settings for update to authenticated
  using (public.has_candidate_permission('website_settings')) with check (public.has_candidate_permission('website_settings'));
