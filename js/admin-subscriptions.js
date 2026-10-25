document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),loading=$('subs-loading'),app=$('subs-app'),status=$('subs-status');
 const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 let candidates=[],plans=[],subs=[],saving=false;
 const setStatus=(m,k='')=>{status.textContent=m;status.className='access-status'+(k?' is-'+k:'');};
 if(typeof AuthManager==='undefined'||!supabaseClient){loading.innerHTML='<strong>Admin dependencies unavailable</strong><span>Check js/config.js and js/auth.js.</span>';return;}
 let auth;try{auth=await AuthManager.requireAdminGuard();}catch(e){console.error(e);location.href='login.html';return;}
 if(!auth?.ok&&!(auth?.user&&auth?.profile))return;
 if(!auth?.user||!auth?.profile||!['admin','head_admin'].includes(String(auth.profile.role||'').toLowerCase())){loading.innerHTML='<strong>Administrator access required</strong><span>This area is restricted to authorized administrators.</span>';return;}
 $('subs-admin-name').textContent=auth.profile.full_name||auth.user.email||'Administrator';$('subs-admin-email').textContent=auth.user.email||auth.profile.email||'';$('subs-avatar').textContent=($('subs-admin-name').textContent.trim()[0]||'A').toUpperCase();
 loading.hidden=true;loading.style.display='none';app.hidden=false;app.style.display='grid';
 $('subs-logout').addEventListener('click',async()=>{ $('subs-logout').disabled=true;try{await AuthManager.logout();}catch(e){ $('subs-logout').disabled=false;setStatus(e.message||'Could not sign out.','error');}});
 $('subs-refresh').addEventListener('click',load);$('subs-new').addEventListener('click',openForm);$('subs-cancel-form').addEventListener('click',closeForm);$('subs-form').addEventListener('submit',grantSubscription);
 async function load(){
  if(saving)return;setStatus('Loading subscription records…');
  try{
   const [candidateRes,planRes,subRes]=await Promise.all([
    supabaseClient.from('profiles').select('id,full_name,email,role').eq('role','candidate').order('full_name').limit(1000),
    supabaseClient.rpc('admin_list_subscription_plans'),
    supabaseClient.rpc('admin_list_user_subscriptions')
   ]);
   for(const r of [candidateRes,planRes,subRes])if(r.error)throw r.error;
   candidates=candidateRes.data||[];plans=(planRes.data||[]).filter(p=>p.is_active);subs=subRes.data||[];
   renderSelects();renderSubs();setStatus('Subscription records loaded. Manual grants and cancellations are audited.','success');
  }catch(e){console.error(e);$('subs-list').innerHTML='<div class="admin-empty">Could not load subscriptions. Confirm the foundation migration is applied to staging and admin RPC permissions are configured.</div>';setStatus(e.message||'Unable to load subscriptions.','error');}
 }
 function renderSelects(){
  $('subs-user').innerHTML='<option value="">Choose a candidate…</option>'+candidates.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.full_name||'Unnamed candidate')+' · '+esc(c.email||c.id)+'</option>').join('');
  $('subs-plan').innerHTML='<option value="">Choose an active plan…</option>'+plans.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+' · '+esc(p.currency)+' '+(Number(p.price_minor||0)/100).toFixed(2)+' · '+esc(p.duration_days)+' days</option>').join('');
 }
 function current(o){const now=Date.now();return o.status==='active'&&(!o.starts_at||new Date(o.starts_at).getTime()<=now)&&(!o.ends_at||new Date(o.ends_at).getTime()>now);}
 function renderSubs(){
  $('subs-count').textContent=subs.length;$('subs-active-count').textContent=subs.filter(current).length;$('subs-other-count').textContent=subs.length-subs.filter(current).length;
  if(!subs.length){$('subs-list').innerHTML='<div class="admin-empty">No subscription records yet.</div>';return;}
  $('subs-list').innerHTML=subs.map(s=>{
   const active=current(s),period=(s.starts_at?new Date(s.starts_at).toLocaleString():'Not started')+' → '+(s.ends_at?new Date(s.ends_at).toLocaleString():'No expiry');
   return '<article class="subs-card"><div class="subs-card-head"><div><h3>'+esc(s.user_name||'Candidate')+' · '+esc(s.user_email||s.user_id)+'</h3><p>'+esc(s.plan_name||s.plan_id)+'</p></div><div class="subs-actions"><span class="subs-chip '+(active?'active':'')+'">'+esc(s.status)+'</span>'+(active?'<button type="button" class="admin-btn admin-btn-secondary" data-cancel-sub="'+esc(s.id)+'">Cancel subscription</button>':'')+'</div></div><div class="subs-meta"><span>'+esc(period)+'</span><span>·</span><span>Reason: '+esc(s.admin_note||'—')+'</span><span>·</span><span>Created '+esc(new Date(s.created_at).toLocaleDateString())+'</span></div></article>';
  }).join('');
  $('subs-list').querySelectorAll('[data-cancel-sub]').forEach(b=>b.addEventListener('click',()=>cancelSubscription(b.dataset.cancelSub)));
 }
 function openForm(){ $('subs-form').reset();$('subs-form-panel').hidden=false;$('subs-form-panel').scrollIntoView({behavior:'smooth',block:'start'}); }
 function closeForm(){ $('subs-form-panel').hidden=true; }
 async function grantSubscription(event){
  event.preventDefault();if(saving)return;
  const note=$('subs-note').value.trim(),starts=$('subs-starts').value,ends=$('subs-ends').value;
  if(!note||note.length>500){setStatus('Enter a reason of at most 500 characters.','error');return;}
  if(starts&&ends&&new Date(ends)<=new Date(starts)){setStatus('End date must be after start date.','error');return;}
  saving=true;$('subs-save').disabled=true;$('subs-save').textContent='Granting…';setStatus('Creating audited manual subscription…');
  try{
   const result=await supabaseClient.rpc('admin_grant_user_subscription',{p_user_id:$('subs-user').value,p_plan_id:$('subs-plan').value,p_starts_at:starts?new Date(starts).toISOString():null,p_ends_at:ends?new Date(ends).toISOString():null,p_admin_note:note});
   if(result.error)throw result.error;closeForm();await load();setStatus('Manual subscription granted and audit logged.','success');
  }catch(e){console.error(e);setStatus(e.message||'Unable to grant subscription.','error');}
  finally{saving=false;$('subs-save').disabled=false;$('subs-save').textContent='Grant subscription';}
 }
 async function cancelSubscription(id){
  const note=prompt('Enter a reason for cancelling this subscription:');if(note===null)return;if(!note.trim()||note.trim().length>500){setStatus('A cancellation reason of 1-500 characters is required.','error');return;}
  try{const result=await supabaseClient.rpc('admin_cancel_user_subscription',{p_id:id,p_admin_note:note.trim()});if(result.error)throw result.error;await load();setStatus('Subscription cancelled and audit logged.','success');}
  catch(e){setStatus(e.message||'Unable to cancel subscription.','error');}
 }
 await load();
});