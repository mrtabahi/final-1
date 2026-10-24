alter table public.tests add column if not exists sort_order integer;
with ranked as (select id, row_number() over (partition by folder_id order by created_at desc nulls last, id) - 1 as new_order from public.tests)
update public.tests as t set sort_order = ranked.new_order from ranked where t.id = ranked.id and t.sort_order is null;
create index if not exists tests_folder_sort_order_idx on public.tests (folder_id, sort_order, created_at);
