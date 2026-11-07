-- Prevent candidate direct-ID access to tests inside unpublished folders.
-- Preserve existing test activation and entitlement checks; folderless tests remain eligible.
create or replace function public.get_test_for_candidate(p_test_id uuid)
returns setof public.tests
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $function$
  select t.*
  from public.tests t
  where t.id = p_test_id
    and t.active = true
    and (
      t.folder_id is null
      or exists (
        select 1
        from public.folders f
        where f.id = t.folder_id
          and f.active = true
      )
    )
    and public.can_access_test(t.id, auth.uid());
$function$;

comment on function public.get_test_for_candidate(uuid) is
  'Returns only active tests in active folders (or folderless tests) that the candidate is entitled to access.';
