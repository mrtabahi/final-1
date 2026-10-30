(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (minor, currency='INR') => new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format(Number(minor||0)/100);
  let plans = [], candidates = [], memberships = [], editingId = null;
  const notify = (message, error=false) => { const el=$('subscription-admin-message'); if(el){el.textContent=message;el.className='sub-admin-message'+(error?' is-error':' is-success');} };
  const client = () => (typeof supabaseClient !== 'undefined' ? supabaseClient : window.supabaseClient);
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
      client().from('profiles').select('id,full_name,email,phone').order('full_name').limit(1000),
      client().from('subscription_plans').select('id,name,duration_days,is_active').order('sort_order'),
      client().from('user_subscriptions').select('id,user_id,plan_id,status,starts_at,ends_at,admin_note,profiles(full_name,email,phone),subscription_plans(name)').order('created_at',{ascending:false}).limit(100)
    ]);
    if(people.error)throw people.error;if(plansResult.error)throw plansResult.error;if(subs.error)throw subs.error;
    candidates=people.data||[];
    select.innerHTML='<option value="">Choose candidate…</option>'+candidates.map(p=>'<option value="'+p.id+'">'+esc(p.full_name||p.email||p.id)+'</option>').join('');
    $('sub-member-plan').innerHTML='<option value="">Choose plan…</option>'+(plansResult.data||[]).map(p=>'<option value="'+p.id+'">'+esc(p.name)+' · '+(p.is_active?'Published':'Draft')+'</option>').join('');
    memberships=subs.data||[]; const box=$('subscription-member-list');
    box.innerHTML=(subs.data||[]).length?(subs.data||[]).map(s=>'<article class="sub-admin-member"><div><strong>'+esc(s.profiles?.full_name||'Candidate')+'</strong><p>'+esc(s.profiles?.email||'Email not available')+'</p><p>'+esc(s.subscription_plans?.name||'Plan')+' · '+esc(s.status)+'</p><small>'+esc(s.starts_at?new Date(s.starts_at).toLocaleDateString():'Start not set')+' → '+esc(s.ends_at?new Date(s.ends_at).toLocaleDateString():'No expiry')+'</small><div class="sub-member-actions"><label>Expiry <input type="date" data-expiry="'+s.id+'" value="'+(s.ends_at?new Date(s.ends_at).toISOString().slice(0,10):'')+'"></label><button type="button" class="admin-btn admin-btn-secondary" data-save-membership="'+s.id+'">Save expiry</button><button type="button" class="admin-btn admin-btn-secondary" data-reset-member="'+s.user_id+'">Send password reset</button><button type="button" class="admin-btn admin-btn-danger" data-expire-membership="'+s.id+'">Expire access</button></div></div><span class="sub-admin-status '+(s.status==='active'?'is-active':'')+'">'+esc(s.status)+'</span></article>').join(''):'<div class="admin-empty">No subscription records yet.</div>';
    box.querySelectorAll('[data-save-membership]').forEach(b=>b.addEventListener('click',()=>saveMembershipExpiry(b.dataset.saveMembership)));
    box.querySelectorAll('[data-expire-membership]').forEach(b=>b.addEventListener('click',()=>expireMembership(b.dataset.expireMembership)));
    box.querySelectorAll('[data-reset-member]').forEach(b=>b.addEventListener('click',()=>sendPasswordReset(b.dataset.resetMember)));
  }

  async function saveMembershipExpiry(id){
    const input=document.querySelector('[data-expiry="'+id+'"]'); if(!input)return;
    const row=memberships.find(x=>x.id===id); if(!row)return;
    const end=input.value?new Date(input.value+'T23:59:59').toISOString():null;
    if(end&&new Date(end)<=new Date()){notify('Expiry must be in the future. Use Expire access to end membership now.',true);return;}
    try{const {error}=await client().from('user_subscriptions').update({ends_at:end,status:'active',updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;notify('Membership expiry updated.');await loadMembershipTools();}
    catch(err){notify(err.message||'Could not update expiry.',true);}
  }
  async function expireMembership(id){
    if(!confirm('Expire this membership now? This changes access, not payment records.'))return;
    try{const {error}=await client().from('user_subscriptions').update({status:'expired',ends_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;notify('Membership expired.');await loadMembershipTools();}
    catch(err){notify(err.message||'Could not expire membership.',true);}
  }
  async function sendPasswordReset(userId){
    const person=candidates.find(x=>x.id===userId);if(!person?.email){notify('Candidate email is unavailable; cannot send reset link.',true);return;}
    if(!confirm('Send a secure password-reset email to '+person.email+'? The password itself will never be visible to admins.'))return;
    try{const {error}=await client().auth.resetPasswordForEmail(person.email,{redirectTo:'https://decoding-hcm.vercel.app/reset.html'});if(error)throw error;notify('Password reset email requested for '+person.email+'.');}
    catch(err){notify(err.message||'Could not request password reset.',true);}
  }

  const accessLabels={};
  const pageResources=[
    ['index.html','Home'],['Typing_test.html','Typing Tests'],['fix-accuracy.html','Typing Game'],['self-test.html','Self Test'],
    ['materials.html','PDF Library'],['dashboard.html','Start Preparation'],['start_test.html','Typing Test Player'],
    ['my_results.html','My Results'],['leaderboard.html','Leaderboard'],['my_account.html','My Account'],['premium.html','Plans & Pricing']
  ];
  const menuFeatureChildren={
    'fix-accuracy.html':['typing-game'],
    'self-test.html':['self-test'],
    'materials.html':['pdf-library','calculation-pdf'],
    'dashboard.html':['setup-box','typing-interface','typing-formats','custom-passages','calculation-pdf'],
    'start_test.html':['typing-interface'],
    'my_results.html':['test-results-history'],
    'leaderboard.html':['leaderboard-tools']
  };
  const featureResources=[
    ['self-test','Self Test content'],['typing-game','Typing Game content'],['live-test','Live Test access'],
    ['hard-symbol-tests','Hard & Symbol Tests'],['setup-box','Test setup box'],['typing-interface','Typing interface'],
    ['calculation-pdf','Calculation PDF'],['typing-formats','Typing formats'],['custom-passages','Custom passage uploads'],
    ['test-results-history','Detailed results & history'],['leaderboard-tools','Leaderboard features'],['pdf-library','PDF calculations & library']
  ];
  const prettyResource=(type,key)=>accessLabels[type+':'+key]||((type==='site'&&key==='*')?'Whole website':key);
  async function setTreeRule(type,key,isFree){
    try{
      const {data:{user}}=await client().auth.getUser();
      const payload={is_free:isFree,upgrade_message:'Upgrade your plan to unlock this content.',updated_by:user?.id,updated_at:new Date().toISOString()};
      const writes=[client().from('feature_access_rules').upsert({...payload,resource_type:type,resource_key:String(key)},{onConflict:'resource_type,resource_key'})];
      // A folder is a parent entitlement: applying Paid/Free updates every
      // currently assigned test. Individual test overrides can be changed later.
      if(type==='folder'){
        const {data:children,error}=await client().from('tests').select('id').eq('folder_id',key);
        if(error)throw error;
        for(const child of (children||[])) writes.push(client().from('feature_access_rules').upsert({...payload,resource_type:'test',resource_key:String(child.id)},{onConflict:'resource_type,resource_key'}));
      }
      // Parent menu rules cascade to their linked feature controls. Each child remains individually editable afterwards.
      if(type==='menu'){
        const childFeatures=menuFeatureChildren[String(key).toLowerCase()]||[];
        for(const featureKey of childFeatures)writes.push(client().from('feature_access_rules').upsert({...payload,resource_type:'feature',resource_key:featureKey},{onConflict:'resource_type,resource_key'}));
      }
      // The Typing Tests menu is the parent of all test folders and their tests.
      if(type==='menu'&&String(key).toLowerCase()==='typing_test.html'){
        const {data:folders,error:folderError}=await client().from('folders').select('id');if(folderError)throw folderError;
        const {data:tests,error:testError}=await client().from('tests').select('id');if(testError)throw testError;
        for(const folder of (folders||[]))writes.push(client().from('feature_access_rules').upsert({...payload,resource_type:'folder',resource_key:String(folder.id)},{onConflict:'resource_type,resource_key'}));
        for(const test of (tests||[]))writes.push(client().from('feature_access_rules').upsert({...payload,resource_type:'test',resource_key:String(test.id)},{onConflict:'resource_type,resource_key'}));
      }
      const results=await Promise.all(writes);
      const failed=results.find(result=>result.error);if(failed?.error)throw failed.error;
      const childCount=Math.max(0,writes.length-1);
      notify(prettyResource(type,key)+(childCount?' and '+childCount+' linked item(s)':'')+' are now '+(isFree?'FREE':'PAID')+'. Individual child overrides can still be changed below.');
      await Promise.all([loadAccessRules(),loadAccessTree()]);
    }catch(err){notify(err.message||'Could not update access. Check administrator login and database permissions.',true);}
  }
  async function loadAccessTree(){
    const tree=$('feature-access-tree');if(!tree)return;
    tree.innerHTML='<div class="admin-empty">Loading website access tree…</div>';
    try{
      const [{data:folders,error:fe},{data:tests,error:te},{data:rules,error:re}]=await Promise.all([
        client().from('folders').select('id,name,active').order('sort_order').order('name'),
        client().from('tests').select('id,title,folder_id,active').order('sort_order').order('title').limit(2000),
        client().from('feature_access_rules').select('resource_type,resource_key,is_free')
      ]);
      if(fe)throw fe;if(te)throw te;if(re)throw re;
      const allRules=rules||[];
      const ruleFor=(type,key)=>allRules.find(r=>r.resource_type===type&&String(r.resource_key).toLowerCase()===String(key).toLowerCase());
      const toggle=(type,key,inherited=null)=>{const own=ruleFor(type,key);const r=own||inherited;const status=r?.is_free?'FREE':'PAID';const hint=own?'Explicit setting':(inherited?'Inherited from folder':'Default: paid');return '<span class="access-tree-state"><small>'+hint+'</small><button type="button" class="admin-btn '+(r?.is_free?'admin-btn-secondary':'admin-btn-primary')+' access-tree-toggle" data-tree-type="'+esc(type)+'" data-tree-key="'+esc(key)+'" data-tree-free="'+(r?.is_free?'true':'false')+'">'+status+'</button></span>';};
      accessLabels['site:*']='Whole website';
      const menuNodes=pageResources.map(([key,label])=>{accessLabels['menu:'+key]=label;const linked=(menuFeatureChildren[key.toLowerCase()]||[]).map(k=>ruleFor('feature',k)).filter(Boolean);const inherited=linked.length?{is_free:linked.every(r=>r.is_free)}:null;return '<div class="access-tree-node access-tree-leaf"><span>'+esc(label)+'</span><code>'+esc(key)+'</code>'+toggle('menu',key,inherited)+'</div>';}).join('');
      const folderNodes=(folders||[]).map(folder=>{
        accessLabels['folder:'+folder.id]=folder.name;
        const children=(tests||[]).filter(t=>t.folder_id===folder.id).map(test=>{
          accessLabels['test:'+test.id]=test.title;
          const folderRule=ruleFor('folder',folder.id)||ruleFor('menu','Typing_test.html');return '<div class="access-tree-node access-tree-test"><span>'+esc(test.title)+'</span>'+toggle('test',test.id,folderRule)+'</div>';
        }).join('')||'<div class="access-tree-empty">No tests in this folder</div>';
        return '<details class="access-tree-branch"><summary><span>'+esc(folder.name)+'</span><small>'+(tests||[]).filter(t=>t.folder_id===folder.id).length+' tests</small>'+toggle('folder',folder.id,ruleFor('menu','Typing_test.html'))+'</summary><div class="access-tree-children">'+children+'</div></details>';
      }).join('');
      const featureNodes=featureResources.map(([key,label])=>{accessLabels['feature:'+key]=label;return '<div class="access-tree-node access-tree-leaf"><span>'+esc(label)+'</span><code>'+esc(key)+'</code>'+toggle('feature',key)+'</div>';}).join('');
      tree.innerHTML='<div class="access-tree-root"><div class="access-tree-node access-tree-root-node"><strong>Decoding HCM</strong><span>Entire website</span>'+toggle('site','*')+'</div><details class="access-tree-branch" open><summary><span>Website menus &amp; pages</span><small>'+pageResources.length+' pages</small><span class="access-tree-chevron">⌄</span></summary><div class="access-tree-children">'+menuNodes+'</div></details><details class="access-tree-branch"><summary><span>Typing Tests</span><small>'+(folders||[]).length+' folders</small><span class="access-tree-chevron">⌄</span></summary><div class="access-tree-children">'+folderNodes+'</div></details><details class="access-tree-branch" open><summary><span>Individual features &amp; interfaces</span><small>'+featureResources.length+' controls</small><span class="access-tree-chevron">⌄</span></summary><div class="access-tree-children">'+featureNodes+'</div></details></div>';
      tree.querySelectorAll('[data-tree-type]').forEach(button=>button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const type=button.dataset.treeType,key=button.dataset.treeKey,isFree=button.dataset.treeFree!=='true';setTreeRule(type,key,isFree);}));
    }catch(err){tree.innerHTML='<div class="admin-error">Could not load access tree: '+esc(err.message||err)+'</div>';}
  }
  async function loadAccessRules(){
    const box=$('feature-access-rule-list');if(!box)return;
    const {data,error}=await client().from('feature_access_rules').select('id,resource_type,resource_key,is_free,upgrade_message,updated_at').order('resource_type').order('resource_key');
    if(error)throw error;
    box.innerHTML=(data||[]).length?data.map(r=>'<article class="sub-admin-member"><div><strong>'+esc(r.resource_type.toUpperCase())+' · '+esc(prettyResource(r.resource_type,r.resource_key))+'</strong><p>'+esc(r.upgrade_message)+'</p><span class="sub-admin-status '+(r.is_free?'is-active':'')+'">'+(r.is_free?'FREE FOR EVERYONE':'PAID · PREMIUM REQUIRED')+'</span></div><div class="sub-admin-plan-actions"><button type="button" class="admin-btn '+(r.is_free?'admin-btn-secondary':'admin-btn-primary')+'" data-toggle-access="'+r.id+'" data-free="'+r.is_free+'">'+(r.is_free?'Make paid':'Make free')+'</button><button type="button" class="admin-btn admin-btn-secondary" data-delete-access="'+r.id+'">Remove rule</button></div></article>').join(''):'<div class="admin-empty">No overrides yet. By default, registered rules are paid; add an override to make a site/menu/folder/test free.</div>';
    box.querySelectorAll('[data-toggle-access]').forEach(b=>b.addEventListener('click',()=>toggleAccessRule(b.dataset.toggleAccess,b.dataset.free!=='true')));
    box.querySelectorAll('[data-delete-access]').forEach(b=>b.addEventListener('click',()=>deleteAccessRule(b.dataset.deleteAccess)));
  }

  async function populateAccessTargets(){
    const type=$('feature-access-type')?.value,select=$('feature-access-key');if(!select)return;
    select.innerHTML='<option value="">Loading resources…</option>';
    let options=[];
    try{
      if(type==='site')options=[['*','Whole website'],...['index.html','Typing_test.html','fix-accuracy.html','self-test.html','materials.html','dashboard.html','start_test.html','my_results.html','leaderboard.html','my_account.html','premium.html'].map(x=>[x,x])];
      else if(type==='menu')options=pageResources.map(([key,label])=>[key,label]);
      else if(type==='folder'){const {data,error}=await client().from('folders').select('id,name').order('sort_order').order('name');if(error)throw error;options=(data||[]).map(x=>[x.id,x.name]);}
      else if(type==='test'){const {data,error}=await client().from('tests').select('id,title').order('sort_order').order('title').limit(1000);if(error)throw error;options=(data||[]).map(x=>[x.id,x.title]);}
      else if(type==='feature'){options=[['typing-game','Typing Game'],['self-test','Self Test'],['pdf-library','PDF Library'],['live-test','Live Test'],['hard-symbol-tests','Hard & Symbol Tests']];const {data,error}=await client().from('study_materials').select('id,title').order('sort_order').order('title').limit(1000);if(error)throw error;options=options.concat((data||[]).map(x=>[x.id,'Study material · '+x.title]));}
      select.innerHTML='<option value="">Choose a resource…</option>'+options.map(([v,label])=>'<option value="'+esc(v)+'">'+esc(label)+'</option>').join('');
      if(!options.length)select.innerHTML='<option value="">No resources found</option>';
    }catch(err){select.innerHTML='<option value="">Could not load resources</option>';notify(err.message||'Could not load resource list.',true);}
  }
  async function saveAccessRule(e){
    e.preventDefault();
    const resource_type=$('feature-access-type').value,resource_key=$('feature-access-key').value.trim(),upgrade_message=$('feature-access-message').value.trim()||'Upgrade your plan to unlock this content.';
    if(!resource_key){notify('Enter a page, menu, folder ID or test ID.',true);return;}
    try{
      const {data:{user}}=await client().auth.getUser();
      const {error}=await client().from('feature_access_rules').upsert({resource_type,resource_key,is_free:$('feature-access-free').checked,upgrade_message,updated_by:user?.id,updated_at:new Date().toISOString()},{onConflict:'resource_type,resource_key'});
      if(error)throw error;
      $('feature-access-key').value='';$('feature-access-message').value='';$('feature-access-free').checked=false;
      notify('Access rule saved.');await loadAccessRules();
    }catch(err){notify(err.message||'Could not save access rule. Apply the admin feature-access migration first.',true);}
  }
  async function toggleAccessRule(id,isFree){
    try{const {error}=await client().from('feature_access_rules').update({is_free:isFree,updated_at:new Date().toISOString()}).eq('id',id);if(error)throw error;notify(isFree?'Resource made free.':'Premium requirement restored.');await loadAccessRules();}
    catch(err){notify(err.message||'Could not update access rule.',true);}
  }
  async function deleteAccessRule(id){
    if(!confirm('Remove this override? The resource will return to the default paid rule.'))return;
    try{const {error}=await client().from('feature_access_rules').delete().eq('id',id);if(error)throw error;notify('Override removed; default paid behavior restored.');await loadAccessRules();}
    catch(err){notify(err.message||'Could not remove access rule.',true);}
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
    box.innerHTML='<div class="sub-admin-layout"><section class="sub-admin-section sub-admin-access-section"><div class="sub-admin-section-head"><div><h2>Paid / free access rules</h2><p>Set a site, menu, folder, test or feature as premium-required or free for everyone.</p></div><span class="sub-admin-pill is-warning">AUDITED</span></div><div class="access-tree-wrap"><div class="access-tree-heading"><h3>Website access tree</h3><p>One click changes access. Expand a menu, folder, or test branch to manage children individually.</p></div><div id="feature-access-tree" class="feature-access-tree"><div class="admin-empty">Loading website access tree…</div></div></div><form id="feature-access-form" class="sub-admin-form"><div class="sub-admin-fields"><label>Resource type<select id="feature-access-type"><option value="site">Whole website / page</option><option value="menu">Menu / navigation</option><option value="folder">Test folder</option><option value="test">Individual test</option><option value="feature">Feature</option></select></label><label>Choose resource<select id="feature-access-key" required><option value="">Choose a resource…</option></select></label><label class="sub-admin-wide">Upgrade popup message<textarea id="feature-access-message" rows="2" maxlength="240" placeholder="Upgrade your plan to unlock this content."></textarea></label></div><div class="sub-admin-checks"><label><input id="feature-access-free" type="checkbox"> Free for all users</label></div><button class="admin-btn admin-btn-primary" type="submit">Save access rule</button></form><div id="feature-access-rule-list" class="sub-admin-plan-list"><div class="admin-empty">Loading access rules…</div></div></section><section class="sub-admin-section"><div class="sub-admin-section-head"><div><h2 id="sub-plan-form-title">Create a plan</h2><p>Price is in INR. Features are one per line.</p></div><span class="sub-admin-pill">PUBLIC CATALOGUE</span></div><form id="sub-plan-form" class="sub-admin-form"><div class="sub-admin-fields"><label>Plan name<input id="sub-plan-name" maxlength="80" required placeholder="e.g. HCM Pro Monthly"></label><label>Short tagline<input id="sub-plan-tagline" maxlength="140" placeholder="Best for daily practice"></label><label>Price (₹)<input id="sub-plan-price" type="number" min="0" step=".01" required value="99"></label><label>Duration (days)<input id="sub-plan-days" type="number" min="1" max="3650" required value="30"></label><label>Sort order<input id="sub-plan-order" type="number" step="1" value="0"></label><label class="sub-admin-wide">Description<textarea id="sub-plan-description" rows="2" maxlength="500" placeholder="What does this plan unlock?"></textarea></label><label class="sub-admin-wide">Included features<textarea id="sub-plan-features" rows="4" placeholder="Premium typing tests&#10;PDF library&#10;Detailed results"></textarea></label></div><div class="sub-admin-checks"><label><input id="sub-plan-active" type="checkbox"> Publish on public website</label><label><input id="sub-plan-featured" type="checkbox"> Highlight as recommended</label></div><div class="sub-admin-actions"><button type="submit" id="sub-plan-save" class="admin-btn admin-btn-primary">Create plan</button><button type="button" id="sub-plan-cancel" class="admin-btn admin-btn-secondary" hidden>Cancel edit</button></div></form><p id="subscription-admin-message" class="sub-admin-message" role="status" aria-live="polite"></p><div id="subscription-plan-list" class="sub-admin-plan-list"></div></section><section class="sub-admin-section"><div class="sub-admin-section-head"><div><h2>Grant preparation access</h2><p>For support/compensation only. This does not mark an order as paid.</p></div><span class="sub-admin-pill is-warning">ADMIN ACTION</span></div><form id="sub-member-form" class="sub-admin-form"><label>Candidate<select id="sub-member-candidate" required><option value="">Loading candidates…</option></select></label><label>Plan<select id="sub-member-plan" required><option value="">Loading plans…</option></select></label><label>Duration override (days)<input id="sub-member-days" type="number" min="1" max="3650" placeholder="Use plan duration"></label><label>Internal reason / note<textarea id="sub-member-note" rows="2" maxlength="300" placeholder="Support case, complimentary access reason…"></textarea></label><button type="submit" id="sub-member-grant" class="admin-btn admin-btn-primary">Grant access</button></form><div class="sub-admin-section-head sub-admin-history-head"><div><h2>Recent memberships</h2><p>Latest 100 records</p></div><button type="button" id="sub-members-refresh" class="admin-btn admin-btn-secondary">Refresh</button></div><div id="subscription-member-list"><div class="admin-empty">Loading membership records…</div></div></section></div>';
    $('feature-access-form').addEventListener('submit',saveAccessRule);$('feature-access-type').addEventListener('change',populateAccessTargets);$('sub-plan-form').addEventListener('submit',savePlan);$('sub-plan-cancel').addEventListener('click',resetForm);$('sub-member-form').addEventListener('submit',grantMembership);$('sub-members-refresh').addEventListener('click',()=>loadMembershipTools().catch(e=>notify(e.message,true)));
    try{await loadPlans();await loadMembershipTools();await loadAccessTree();await loadAccessRules();await populateAccessTargets();}catch(err){console.error(err);box.insertAdjacentHTML('afterbegin','<div class="admin-error">Subscription tables are not ready yet. Apply the subscription foundation migration, then refresh this module. Details: '+esc(err.message)+'</div>');}
  };
})();