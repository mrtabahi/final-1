-- Restore database-level entitlement checks after the temporary frontend compatibility policy.
-- The deployed frontend uses list_test_catalog/get_test_for_candidate and
-- list_material_catalog/get_material_link, so catalog metadata remains available
-- through the intended RPCs while protected rows and URLs stay gated.

drop policy if exists tests_candidate_select on public.tests;
create policy tests_candidate_select
  on public.tests
  for select
  to authenticated
  using (public.is_current_user_admin() or public.can_access_test(id, auth.uid()));

drop policy if exists study_materials_candidate_select on public.study_materials;
create policy study_materials_candidate_select
  on public.study_materials
  for select
  to authenticated
  using (public.is_current_user_admin() or public.can_access_material(id, auth.uid()));
