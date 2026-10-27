document.addEventListener('DOMContentLoaded', async () => {
 const $=id=>document.getElementById(id), loading=$('entitlements-loading'), app=$('entitlements-app'), status=$('entitlements-status');
 const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 let candidates=[],folders=[],tests=[],overrides=[],saving=false;
 const setStatus=(m,k='')=>{status.textContent=m;status.className='access-status'+(k?' is-'+k:'');};
 if(typeof AuthManager==='undefined'||!supabaseClient){loading.innerHTML='<strong>Admin dependencies unavailable</strong><span>Check js/config.js and js/auth.js.</span>';return;}
 let auth;try{auth=await AuthManager.requireAdminGuard();}catch(e){console.error(e);location.href='login.html';return;}
 if(!auth?.ok&&!(auth?.user&&auth?.profile))return;
 if(!auth?.user||!auth?.profile||!['admin','head_admin'].includes(String(auth.profile.role||'').toLowerCase())){loading.innerHTML='<strong>Administrator access required</strong><span>This area is restricted to authorized administrators.</span>';return;}
 $('entitlements-admin-name').textContent=auth.profile.full_name||auth.user.email||'Administrator';$('entitlements-admin-email').textContent=auth.user.email||auth.profile.email||'';$('entitlements-avatar').textContent=($('entitlements-admin-name').textContent.trim()[0]||'A').toUpperCase();
 loading.hidden=true;loading.style.display='none';app.hidden=false;app.style.display='grid';
 $('entitlements-logout').addEventListener('click',async()=>{ $('entitlements-logout').disabled=true;try{await AuthManager.logout();}catch(e){$('entitlements-logout').disabled=false;setStatus(e.message||'Could not sign out.','error');}});
 $('entitlements-refresh').addEventListener('click',load);$('entitlements-new').addEventListener('click',()=>openForm());$('entitlements-cancel').addEventListener('click',closeForm);$('entitlements-type').addEventListener('change',renderResourceOptions);$('entitlements-form').addEventListener('submit',saveOverride);
 async function load(){
  if(saving)return;setStatus('Loading candidates, resources and overrides…');
  try{
   const [candidateRes,folderRes,testRes,overrideRes]=await Promise.all([
    supabaseClient.from('profiles').select('id,full_name,email,role').eq('role','candidate').order('full_name').limit(1000),
    supabaseClient.from('folders').select('id,name,active').order('name'),
    supabaseClient.from('tests').select('id,title,folder_id,active').order('title'),
    supabaseClient.rpc('admin_list_user_entitlement_overrides')
   ]);
   for(const r of [candidateRes,folderRes,testRes,overrideRes])if(r.error)throw r.error;
   candidates=candidateRes.data||[];folders=folderRes.data||[];tests=testRes.data||[];overrides=overrideRes.data||[];
   renderCandidates();renderOverrides();renderResourceOptions();
   setStatus('Overrides loaded. All changes are audited.', 'success');
  }catch(e){console.error('Entitlement load failed',e);$('entitlements-list').innerHTML='<div class="admin-empty">Could not load overrides. Confirm the migration is applied to staging and admin RLS/RPC permissions are configured.</div>';setStatus(e.message||'Unable to load overrides.','error');}
 }
 function renderCandidates(selected=''){
  $('entitlements-user').innerHTML='<option value="">Choose a candidate…</option>'+candidates.map(c=>'<option value="'+esc(c.id)+'" '+(selected===c.id?'selected':'')+'>'+esc(c.full_name||'Unnamed candidate')+' · '+esc(c.email||c.id)+'</option>').join('');
 }
 function renderResourceOptions(selected=''){
  const type=$('entitlements-type').value, rows=type==='folder'?folders:tests;
  $('entitlements-resource').innerHTML='<option value="">Choose a resource…</option>'+rows.map(r=>'<option value="'+esc(r.id)+'" '+(selected===r.id?'selected':'')+'>'+esc(type==='folder'?r.name:r.title)+(r.active?'':' (inactive)')+'</option>').join('');
 }
 function activeNow(o){const now=Date.now();return (!o.starts_at||new Date(o.starts_at).getTime()<=now)&&(!o.ends_at||new Date(o.ends_at).getTime()>now);}
 function renderOverrides(){
  $('entitlements-count').textContent=overrides.length;$('entitlements-active-count').textContent=overrides.filter(activeNow).length;$('entitlements-expired-count').textContent=overrides.filter(o=>!activeNow(o)).length;
  if(!overrides.length){$('entitlements-list').innerHTML='<div class="admin-empty">No manual overrides yet.</div>';return;}
  $('entitlements-list').innerHTML=overrides.map(o=>{
   const resource=(o.resource_type==='folder'?folders:tests).find(r=>r.id===o.resource_key), resourceName=resource?(o.resource_type==='folder'?resource.name:resource.title):o.resource_key;
   const active=activeNow(o),mode=o.access_mode==='grant'?'Grant access':o.access_mode==='free'?'Treat as Free':'Require Paid';
   const period=(o.starts_at?new Date(o.starts_at).toLocaleString():'Immediately')+' → '+(o.ends_at?new Date(o.ends_at).toLocaleString():'No expiry');
   return '<article class="entitlement-card"><div class="entitlement-card-head"><div><h3>'+esc(o.user_name||'Candidate')+' · '+esc(o.user_email||o.user_id)+'</h3><p>'+esc(o.resource_type.toUpperCase())+': '+esc(resourceName)+'</p></div><div class="entitlement-actions"><span class="entitlement-chip '+(active?'active':'')+'">'+(active?'Active':'Expired / revoked')+'</span><button class="admin-btn admin-btn-secondary" type="button" data-edit-override="'+esc(o.id)+'">Edit</button>'+(active?'<button class="admin-btn admin-btn-secondary" type="button" data-revoke-override="'+esc(o.id)+'">Revoke</button>':'')+'</div></div><div class="entitlement-meta"><strong>'+esc(mode)+'</strong><span>·</span><span>'+esc(period)+'</span><span>·</span><span>Reason: '+esc(o.reason||'—')+'</span></div></article>';
  }).join('');
  $('entitlements-list').querySelectorAll('[data-edit-override]').forEach(b=>b.addEventListener('click',()=>editOverride(b.dataset.editOverride)));
  $('entitlements-list').querySelectorAll('[data-revoke-override]').forEach(b=>b.addEventListener('click',()=>revokeOverride(b.dataset.revokeOverride)));
 }
 function localInput(value){if(!value)return'';const d=new Date(value),local=new Date(d.getTime()-d.getTimezoneOffset()*60000);return local.toISOString().slice(0,16);}
 function openForm(o=null){
  $('entitlements-form').reset();$('entitlements-id').value=o?.id||'';$('entitlements-form-title').textContent=o?'Edit entitlement override':'Create entitlement override';
  renderCandidates(o?.user_id||'');$('entitlements-type').value=o?.resource_type||'test';renderResourceOptions(o?.resource_key||'');$('entitlements-mode').value=o?.access_mode||'grant';
  $('entitlements-starts').value=localInput(o?.starts_at);$('entitlements-ends').value=localInput(o?.ends_at);$('entitlements-reason').value=o?.reason||'';
  $('entitlements-form-panel').hidden=false;$('entitlements-form-panel').scrollIntoView({behavior:'smooth',block:'start'});
 }
 function closeForm(){$('entitlements-form-panel').hidden=true;}
 async function editOverride(id){const o=overrides.find(x=>x.id===id);if(o)openForm(o);}
 async function saveOverride(event){
  event.preventDefault();if(saving)return;
  const starts=$('entitlements-starts').value,ends=$('entitlements-ends').value;
  if(starts&&ends&&new Date(ends)<=new Date(starts)){setStatus('End date must be after start date.','error');return;}
  const reason=$('entitlements-reason').value.trim();if(!reason||reason.length>500){setStatus('Enter a reason of at most 500 characters.','error');return;}
  saving=true;$('entitlements-save').disabled=true;$('entitlements-save').textContent='Saving…';setStatus('Saving override and audit event…');
  try{
   const result=await supabaseClient.rpc('admin_save_user_entitlement_override',{p_id:$('entitlements-id').value||null,p_user_id:$('entitlements-user').value,p_resource_type:$('entitlements-type').value,p_resource_key:$('entitlements-resource').value,p_access_mode:$('entitlements-mode').value,p_starts_at:starts?new Date(starts).toISOString():null,p_ends_at:ends?new Date(ends).toISOString():null,p_reason:reason});
   if(result.error)throw result.error;closeForm();await load();setStatus('Override saved and audit logged.','success');
  }catch(e){console.error(e);setStatus(e.message||'Unable to save override.','error');}
  finally{saving=false;$('entitlements-save').disabled=false;$('entitlements-save').textContent='Save override';}
 }
 async function revokeOverride(id){
  if(!confirm('Revoke this entitlement override now? This action is audited.'))return;
  try{const result=await supabaseClient.rpc('admin_revoke_user_entitlement_override',{p_id:id});if(result.error)throw result.error;await load();setStatus('Override revoked and audit logged.','success');}
  catch(e){setStatus(e.message||'Unable to revoke override.','error');}
 }
 await load();
});