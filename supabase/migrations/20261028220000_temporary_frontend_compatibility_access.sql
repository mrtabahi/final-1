-- Temporary compatibility policy while the matching frontend bundle is awaiting production deployment.
-- Protected RPCs remain installed. Reapply strict candidate policies after the new frontend is live.
drop policy if exists tests_candidate_select on public.tests;
create policy tests_candidate_select on public.tests for select to authenticated using (active=true);

drop policy if exists study_materials_candidate_select on public.study_materials;
create policy study_materials_candidate_select on public.study_materials for select to authenticated using (active=true);
