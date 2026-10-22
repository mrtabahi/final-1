create table if not exists public.study_materials (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(trim(title)) between 2 and 160),
 description text not null default '',
 telegram_url text not null check (telegram_url ~ '^https://(t\.me|telegram\.me)/[^[:space:]]+$'),
 material_type text not null default 'pdf' check (material_type in ('pdf','combined_pdf','study_pack')),
 active boolean not null default true,
 sort_order integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.study_materials enable row level security;
grant select on public.study_materials to authenticated;
grant insert,update,delete on public.study_materials to authenticated;
drop policy if exists study_materials_candidate_select on public.study_materials;
create policy study_materials_candidate_select on public.study_materials for select to authenticated using (active=true);
drop policy if exists study_materials_admin_all on public.study_materials;
create policy study_materials_admin_all on public.study_materials for all to authenticated using (public.is_current_user_admin()) with check (public.is_current_user_admin());
