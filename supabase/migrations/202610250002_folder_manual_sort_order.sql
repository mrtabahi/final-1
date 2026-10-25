-- Persist manual ordering for admin test folders.
alter table public.folders
  add column if not exists sort_order integer;

with ranked as (
  select id, row_number() over (
    order by created_at asc nulls last, id
  ) - 1 as position
  from public.folders
)
update public.folders f
set sort_order = ranked.position
from ranked
where f.id = ranked.id
  and f.sort_order is null;

create index if not exists folders_sort_order_idx
  on public.folders (sort_order asc, created_at asc);
