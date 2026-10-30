-- Soft removal keeps the audit trail and prior attempts while denying account access.
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status in ('active','suspended','banned','removed'));

create or replace function public.admin_set_candidate_status(
  p_user_id uuid, p_status text, p_reason text default ''
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,auth
as $$
declare v_actor uuid:=auth.uid(); v_old_status text; v_role text;
begin
  if v_actor is null or not exists(select 1 from public.profiles p where p.id=v_actor and p.role='admin') then
    raise exception 'Administrator permission required' using errcode='42501';
  end if;
  if p_status not in ('active','suspended','banned','removed') then raise exception 'Invalid account status' using errcode='22023'; end if;
  if p_user_id=v_actor then raise exception 'You cannot change your own account status' using errcode='42501'; end if;
  select role,account_status into v_role,v_old_status from public.profiles where id=p_user_id for update;
  if not found then raise exception 'Candidate not found' using errcode='P0002'; end if;
  if v_role<>'candidate' then raise exception 'Only candidate accounts can be managed from this control' using errcode='42501'; end if;
  update public.profiles set account_status=p_status,account_status_reason=nullif(left(trim(coalesce(p_reason,'')),500),''),account_status_changed_at=now(),account_status_changed_by=v_actor,updated_at=now() where id=p_user_id;
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,details)
  values(v_actor,'candidate_account_status_changed','profile',p_user_id::text,jsonb_build_object('from',coalesce(v_old_status,'active'),'to',p_status,'reason',left(trim(coalesce(p_reason,'')),500)));
  return jsonb_build_object('user_id',p_user_id,'old_status',coalesce(v_old_status,'active'),'new_status',p_status);
end; $$;
revoke all on function public.admin_set_candidate_status(uuid,text,text) from public,anon;
grant execute on function public.admin_set_candidate_status(uuid,text,text) to authenticated;