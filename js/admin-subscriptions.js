(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (minor, currency='INR') => new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format(Number(minor||0)/100);
  let plans = [], candidates = [], editingId = null;
  const notify = (message, error=false) => { const el=$('subscription-admin-message'); if(el){el.textContent=message;el.className='sub-admin-message'+(error?' is-error':' is-success');} };
  const client = () => window.supabaseClient || window.supabase;
  async function loadPlans() {
    const box=$('subscription-plan-list'); if(!box) return;
    box.innerHTML='<div class="admin-empty">Loading plans…</div>';
    const {data,error}=await client().from('subscription_plans').select('*').order('sort_order').order('created_at');
    if(error) throw error;
    plans=data||[];
    box.innerHTML=plans.length?plans.map(p=>'<article class="sub-admin-plan"><div class="sub-admin-plan-main"><span class="sub-admin-status '+(p.is_active?'is-active':'')+'">'+(p.is_active?'Public · Active':'Draft · Hidden')+'</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.tagline||p.description||'No short description yet')+'</p><strong>'+money(p.price_minor,p.currency)+' <small>/ '+Number(p.duration_days)+' days</small></strong><small>'+((Array.isArray(p.features)?p.features:[]).length)+' listed features</small></div><div class="sub-admin-plan-actions"><button class="admin-btn admin-btn-secondary" data-edit-plan="'+p.id+'">Edit</button><button class="admin-btn '+(p.is_active?'admin-btn-secondary':'admin-btn-primary')+'" data-toggle-plan="'+p.id+'">'+(p.is_active?'Unpublish':'Publish')+'</button></div></article>').join(''):'<div class="admin-empty">No plans yet. Create your first plan using the form.</div>';
    box.querySelectorAll('[data-edit-plan]').forEach(b=>b.addEventListener('click',()=>editPlan(b.dataset.editPlan)));
    box.querySelectorAll('[data-toggle-plan]').forEach(b=>b.addEventListener('click',()=>togglePlan(b.dataset.togglePlan)));
  }
  function editPlan(id) {
    const p=plans.find(x=>x.id===id); if(!p)return;
    editingId=id;
    $('sub-plan-name').value=p.name||''; $('sub-plan-tagline').value=p.tagline||''; $('sub-plan-description').value=p.description||'';
    $('sub-plan-price').value=(Number(p.price_minor||0)/100).toFixed(2); $('sub-plan-days').value=p.duration_days||30;
    $('sub-plan-features').value=(Array.isArray(p.features)?p.features:[]).join('\n');
    $('sub-plan-order').value=p.sort_order||0; $('sub-plan-active').checked=!!p.is_active; $('sub-plan-featured').checked=!!p.is_featured;
    $('sub-plan-save').textContent='Save plan changes'; $('sub-plan-cancel').hidden=false;
    $('sub-plan-form-title').textContent='Edit plan'; $('sub-plan-name').focus();
  }
  function resetForm(){editingId=null;$('sub-plan-form').reset();$('sub-plan-days').value='30';$('sub-plan-order').value='0';$('sub-plan-save').textContent='Create plan';$('sub-plan-cancel').hidden=true;$('sub-plan-form-title').textContent='Create a plan';}
  async function savePlan(e) {
    e.preventDefault();
    const name=$('sub-plan-name').value.trim(), price=Number($('sub-plan-price').value), days=Number($('sub-plan-days').value);
    if(!name||!Number.isFinite(price)||price<0||!Number.isInteger(days)||days<1||days>3650){notify('Check plan name, price and duration.',true);return;}
    const btn=$('sub-plan-save');btn.disabled=true;notify('Saving plan…');
    const payload={name,tagline:$('sub-plan-tagline').value.trim(),description:$('sub-plan-description').value.trim(),price_minor:Math.round(price*100),currency:'INR',duration_days:days,features:$('sub-plan-features').value.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,20),sort_order:Number($('sub-plan-order').value||0),is_active:$('sub-plan-active').checked,is_featured:$('sub-plan-featured').checked,updated_at:new Date().toISOString()};
    try {
      const q=editingId?client().from('subscription_plans').update(payload).eq('id',editingId):client().from('subscription_plans').insert({...payload,created_by:(await client().auth.getUser()).data.user?.id});
      const {error}=await q;if(error)throw error;
      notify(editingId?'Plan updated. Public plan cards will reflect this change.':'Plan created.');
      resetForm();await loadPlans();
    } catch(err){console.error(err);notify(err.message||'Could not save plan. Confirm the subscription migration is applied and you have admin permission.',true);}
    finally{btn.disabled=false;}
  }
  async function togglePlan(id) {
    const p=plans.find(x=>x.id===id);if(!p)return;
    try{const {error}=await client().from('subscription_plans').update({is_active:!p.is_active,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;notify(!p.is_active?'Plan published to the public pricing page.':'Plan unpublished from the public pricing page.');await loadPlans();}
    catch(err){console.error(err);notify(err.message||'Could not update plan status.',true);}
  }
  async function loadMembershipTools() {
    const select=$('sub-member-candidate'); if(!select)return;
    const [people,plansResult,subs]=await Promise.all([
      client().from('profiles').select('id,full_name,email').order('full_name').limit(1000),
      client().from('subscription_plans').select('id,name,duration_days,is_active').order('sort_order'),
      client().from('user_subscriptions').select('id,user_id,plan_id,status,starts_at,ends_at,admin_note,profiles(full_name,email),subscription_plans(name)').order('created_at',{ascending:false}).limit(100)
    ]);
    if(people.error)throw people.error;if(plansResult.error)throw plansResult.error;if(subs.error)throw subs.error;
    candidates=people.data||[];
    select.innerHTML='<option value="">Choose candidate…</option>'+candidates.map(p=>'<option value="'+p.id+'">'+esc(p.full_name||p.email||p.id)+'</option>').join('');
    $('sub-member-plan').innerHTML='<option value="">Choose plan…</option>'+(plansResult.data||[]).map(p=>'<option value="'+p.id+'">'+esc(p.name)+' · '+(p.is_active?'Published':'Draft')+'</option>').join('');
    const box=$('subscription-member-list');
    box.innerHTML=(subs.data||[]).length?(subs.data||[]).map(s=>'<article class="sub-admin-member"><div><strong>'+esc(s.profiles?.full_name||s.profiles?.email||'Candidate')+'</strong><p>'+esc(s.subscription_plans?.name||'Plan')+' · '+esc(s.status)+'</p><small>'+esc(s.starts_at?new Date(s.starts_at).toLocaleDateString():'Start not set')+' → '+esc(s.ends_at?new Date(s.ends_at).toLocaleDateString():'No expiry')+'</small></div><span class="sub-admin-status '+(s.status==='active'?'is-active':'')+'">'+esc(s.status)+'</span></article>').join(''):'<div class="admin-empty">No subscription records yet.</div>';
  }
  async function grantMembership(e){
    e.preventDefault();const userId=$('sub-member-candidate').value,planId=$('sub-member-plan').value;
    if(!userId||!planId){notify('Choose a candidate and a plan first.',true);return;}
    const plan=plans.find(p=>p.id===planId)||null;
    const duration=Number($('sub-member-days').value||plan?.duration_days||30);
    if(!Number.isInteger(duration)||duration<1||duration>3650){notify('Duration must be between 1 and 3650 days.',true);return;}
    const now=new Date(),end=new Date(now.getTime()+duration*86400000),note=$('sub-member-note').value.trim();
    const btn=$('sub-member-grant');btn.disabled=true;notify('Saving access…');
    try{
      const {data:user}=await client().auth.getUser();
      const {error}=await client().from('user_subscriptions').insert({user_id:userId,plan_id:planId,status:'active',starts_at:now.toISOString(),ends_at:end.toISOString(),created_by:user.user?.id,admin_note:note});
      if(error)throw error;
      notify('Membership record created. This is an administrative grant, not a payment confirmation.');
      $('sub-member-note').value='';await loadMembershipTools();
    }catch(err){console.error(err);notify(err.message||'Could not grant access. Verify the database migration and admin permissions.',true);}
    finally{btn.disabled=false;}
  }
  window.renderSubscriptionsModule=async()=>{
    const box=$('module-capabilities');if(!box)return;
    $('module-title').textContent='Plans & Subscriptions';$('module-subtitle').textContent='Manage public plan cards and administrative membership grants.';
    $('module-status-title').textContent='Connected subscription controls';
    $('module-status-copy').textContent='Published plans appear on the public pricing page. Membership grants are audited records and must never be used as a substitute for verified payment.';
    box.innerHTML='<div class="sub-admin-layout"><section class="sub-admin-section"><div class="sub-admin-section-head"><div><h2 id="sub-plan-form-title">Create a plan</h2><p>Price is in INR. Features are one per line.</p></div><span class="sub-admin-pill">PUBLIC CATALOGUE</span></div><form id="sub-plan-form" class="sub-admin-form"><div class="sub-admin-fields"><label>Plan name<input id="sub-plan-name" maxlength="80" required placeholder="e.g. HCM Pro Monthly"></label><label>Short tagline<input id="sub-plan-tagline" maxlength="140" placeholder="Best for daily practice"></label><label>Price (₹)<input id="sub-plan-price" type="number" min="0" step=".01" required value="99"></label><label>Duration (days)<input id="sub-plan-days" type="number" min="1" max="3650" required value="30"></label><label>Sort order<input id="sub-plan-order" type="number" step="1" value="0"></label><label class="sub-admin-wide">Description<textarea id="sub-plan-description" rows="2" maxlength="500" placeholder="What does this plan unlock?"></textarea></label><label class="sub-admin-wide">Included features<textarea id="sub-plan-features" rows="4" placeholder="Premium typing tests&#10;PDF library&#10;Detailed results"></textarea></label></div><div class="sub-admin-checks"><label><input id="sub-plan-active" type="checkbox"> Publish on public website</label><label><input id="sub-plan-featured" type="checkbox"> Highlight as recommended</label></div><div class="sub-admin-actions"><button type="submit" id="sub-plan-save" class="admin-btn admin-btn-primary">Create plan</button><button type="button" id="sub-plan-cancel" class="admin-btn admin-btn-secondary" hidden>Cancel edit</button></div></form><p id="subscription-admin-message" class="sub-admin-message" role="status" aria-live="polite"></p><div id="subscription-plan-list" class="sub-admin-plan-list"></div></section><section class="sub-admin-section"><div class="sub-admin-section-head"><div><h2>Grant preparation access</h2><p>For support/compensation only. This does not mark an order as paid.</p></div><span class="sub-admin-pill is-warning">ADMIN ACTION</span></div><form id="sub-member-form" class="sub-admin-form"><label>Candidate<select id="sub-member-candidate" required><option value="">Loading candidates…</option></select></label><label>Plan<select id="sub-member-plan" required><option value="">Loading plans…</option></select></label><label>Duration override (days)<input id="sub-member-days" type="number" min="1" max="3650" placeholder="Use plan duration"></label><label>Internal reason / note<textarea id="sub-member-note" rows="2" maxlength="300" placeholder="Support case, complimentary access reason…"></textarea></label><button type="submit" id="sub-member-grant" class="admin-btn admin-btn-primary">Grant access</button></form><div class="sub-admin-section-head sub-admin-history-head"><div><h2>Recent memberships</h2><p>Latest 100 records</p></div><button type="button" id="sub-members-refresh" class="admin-btn admin-btn-secondary">Refresh</button></div><div id="subscription-member-list"><div class="admin-empty">Loading membership records…</div></div></section></div>';
    $('sub-plan-form').addEventListener('submit',savePlan);$('sub-plan-cancel').addEventListener('click',resetForm);$('sub-member-form').addEventListener('submit',grantMembership);$('sub-members-refresh').addEventListener('click',()=>loadMembershipTools().catch(e=>notify(e.message,true)));
    try{await loadPlans();await loadMembershipTools();}catch(err){console.error(err);box.insertAdjacentHTML('afterbegin','<div class="admin-error">Subscription tables are not ready yet. Apply the subscription foundation migration, then refresh this module. Details: '+esc(err.message)+'</div>');}
  };
})();