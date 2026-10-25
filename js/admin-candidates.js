/* Candidate directory for the authenticated admin workspace. No account enforcement is offered until a server-side status workflow exists. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let candidates = [], filtered = [], selected = null, attempts = [], activityById = new Map();
  const date = v => { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}); };
  const dateTime = v => { if (!v) return '—'; const d = new Date(v); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(); };\n  const durationLabel = seconds => { const s=Math.max(0,Number(seconds)||0), h=Math.floor(s/3600), m=Math.floor((s%3600)/60), r=s%60; return (h?h+'h ':'')+(m?m+'m ':'')+(!h&&!m?r+'s':'').trim() || '0s'; };\n  const initials = v => String(v || 'C').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
  function renderShell() {
    const view = $('view-module'); if (!view) return;
    view.innerHTML = `
      <div class="admin-page-heading"><div><div class="admin-kicker">PEOPLE &amp; ACCOUNTS</div><h1>Candidate directory</h1><p>Search registered candidates, review account details and inspect submitted typing performance.</p></div><button class="admin-btn admin-btn-secondary" id="candidate-refresh">↻ Refresh directory</button></div>
      <div class="candidate-hero"><div class="candidate-hero-copy"><span class="candidate-eyebrow">CANDIDATE OPERATIONS</span><h2>Every candidate, one clear view.</h2><p>Find accounts quickly and review their activity without exposing authentication secrets.</p></div><div class="candidate-hero-mark">♙</div></div>
      <section class="admin-panel account-admin-panel"><div class="admin-panel-heading"><div><h2>Account management</h2><p>Create candidate accounts, change passwords, and verify email addresses.</p></div><span class="candidate-permission-badge">Admin tools</span></div>
      <div class="account-admin-grid">
        <form class="account-admin-card" id="account-create-form"><h3>Create candidate ID</h3><p>Creates a candidate login. Email remains unverified until confirmed.</p><label>Full name<input name="full_name" required maxlength="120" autocomplete="name" placeholder="Candidate full name"></label><label>Email address<input name="email" type="email" required autocomplete="email" placeholder="candidate@example.com"></label><label>Temporary password<input name="password" type="password" required minlength="10" autocomplete="new-password" placeholder="At least 10 characters"></label><button class="admin-btn admin-btn-primary" type="submit">Create candidate account</button></form>
        <form class="account-admin-card" id="account-password-form"><h3>Change / reset password</h3><p>You cannot view a user's current password. Set a new one instead.</p><label>User email<input name="email" type="email" required autocomplete="email" placeholder="user@example.com"></label><label>New password<input name="password" type="password" required minlength="10" autocomplete="new-password" placeholder="At least 10 characters"></label><button class="admin-btn admin-btn-secondary" type="submit">Set new password</button></form>
        <form class="account-admin-card" id="account-verify-form"><h3>Verify user email</h3><p>Use only after you have independently confirmed the email address belongs to the user.</p><label>User email<input name="email" type="email" required autocomplete="email" placeholder="user@example.com"></label><button class="admin-btn admin-btn-secondary" type="submit">Mark email verified</button></form>
      </div><p class="account-admin-status" id="account-admin-status" role="status" aria-live="polite">Account actions are securely checked by the server. Passwords are never displayed.</p></section>
      <div class="candidate-stats"><article><span>Registered candidates</span><strong id="candidate-total">—</strong><small>Candidate-role profiles</small></article><article><span>Profiles with email</span><strong id="candidate-email-total">—</strong><small>Contact coverage</small></article><article><span>Phone verified</span><strong id="candidate-verified-total">—</strong><small>Based on profile verification flag</small></article></div>
      <section class="admin-panel candidate-directory-panel"><div class="admin-panel-heading"><div><h2>Candidate accounts</h2><p>Search by name, email, phone or profile ID.</p></div><span class="site-content-count" id="candidate-result-count">Loading…</span></div><div class="candidate-toolbar"><label class="admin-search">⌕ <input id="candidate-search" type="search" placeholder="Search candidates…"></label><select class="admin-select" id="candidate-verification-filter" aria-label="Phone verification filter"><option value="">All verification states</option><option value="verified">Phone verified</option><option value="unverified">Not verified</option></select><button class="admin-btn admin-btn-secondary" id="candidate-clear-search" type="button">Clear</button></div><div id="candidate-list" class="candidate-list"><div class="admin-empty">Loading candidate directory…</div></div><div class="candidate-pagination"><span id="candidate-page-label">—</span><div><button class="admin-btn admin-btn-secondary" id="candidate-prev" type="button" disabled>← Previous</button><button class="admin-btn admin-btn-secondary" id="candidate-next" type="button" disabled>Next →</button></div></div></section>
      <section class="admin-panel candidate-detail-panel" id="candidate-detail" hidden><div class="admin-panel-heading"><div><h2>Candidate overview</h2><p>Profile and submitted test history</p></div><button class="admin-btn admin-btn-secondary" id="candidate-close-detail" type="button">Close details</button></div><div id="candidate-detail-content"></div></section>
      <p class="candidate-security-footnote"><span>🔒</span><span><strong>Privacy-first controls</strong><br>Passwords and authentication tokens are never displayed. Suspend/ban controls are intentionally not shown until a secure server-side workflow is implemented.</span></p>`;
    $('candidate-refresh').addEventListener('click', load);
    bindAccountForm('account-create-form','create_candidate');
    bindAccountForm('account-password-form','reset_password');
    bindAccountForm('account-verify-form','verify_email');
    $('candidate-search').addEventListener('input', () => { page = 0; applyFilters(); });
    $('candidate-verification-filter').addEventListener('change', () => { page = 0; applyFilters(); });
    $('candidate-clear-search').addEventListener('click', () => { $('candidate-search').value=''; $('candidate-verification-filter').value=''; page=0; applyFilters(); });
    $('candidate-prev').addEventListener('click', () => { page=Math.max(0,page-1); renderList(); });
    $('candidate-next').addEventListener('click', () => { page=Math.min(Math.ceil(filtered.length/pageSize)-1,page+1); renderList(); });
    $('candidate-list').addEventListener('click', e => { const b=e.target.closest('[data-candidate-view]'); if(b) showDetail(b.dataset.candidateView); });
    $('candidate-close-detail').addEventListener('click', () => { $('candidate-detail').hidden=true; selected=null; });
    page=0; load();
  }
  function bindAccountForm(formId, action) {
    const form=$(formId); if(!form)return;
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      const status=$('account-admin-status'),button=form.querySelector('button[type="submit"]');
      const fields=Object.fromEntries(new FormData(form).entries());
      const actionLabel=action==='create_candidate'?'create this candidate account':action==='reset_password'?'change this account password':'mark this email as verified';
      if(!confirm('Confirm: '+actionLabel+'?'))return;
      button.disabled=true;status.className='account-admin-status';status.textContent='Processing request securely…';
      try{
        const {data,error}=await supabaseClient.functions.invoke('admin-account-management',{body:{action,...fields}});
        if(error)throw new Error(data?.error||error.message||'Request failed.');
        if(data?.error)throw new Error(data.error);
        status.className='account-admin-status is-success';status.textContent=data?.message||'Account action completed successfully.';
        form.reset();
        if(action==='create_candidate')load();
      }catch(error){
        status.className='account-admin-status is-error';
        status.textContent=error.message||'Account action failed. Check your admin session and try again.';
      }finally{button.disabled=false;}
    });
  }
  const pageSize = 8; let page = 0;
  async function load() {
    const list=$('candidate-list'); if(!list || typeof supabaseClient==='undefined' || !supabaseClient) return;
    list.innerHTML='<div class="admin-empty">Loading candidate profiles…</div>';
    try {
      const {data,error}=await supabaseClient.from('profiles').select('id,full_name,email,phone,phone_verified,role,created_at').eq('role','candidate').order('created_at',{ascending:false}).limit(2000);
      if(error) throw error;
      candidates=data||[];
      activityById = new Map();
      if (candidates.length) {
        const { data: activityRows, error: activityError } = await supabaseClient
          .from('candidate_activity_sessions')
          .select('id,user_id,started_at,last_seen_at,ended_at,duration_seconds')
          .in('user_id', candidates.map(candidate => candidate.id))
          .order('started_at', { ascending: false }).limit(5000);
        if (activityError) console.warn('Could not load candidate activity:', activityError);
        else for (const row of activityRows || []) {
          const key = String(row.user_id);
          if (!activityById.has(key)) activityById.set(key, row);
        }
      }
      // The profile email can be empty for older/imported accounts. Resolve the
      // authoritative email from Auth by profile UUID through an admin-only RPC.
      if (candidates.length) {
        const { data: authEmails, error: emailError } = await supabaseClient.rpc(
          'admin_get_candidate_emails',
          { p_user_ids: candidates.map(candidate => candidate.id) }
        );
        if (emailError) {
          console.warn('Could not resolve candidate Auth emails:', emailError);
        } else {
          const emailById = new Map((authEmails || []).map(row => [String(row.user_id), row.email || '']));
          candidates = candidates.map(candidate => ({
            ...candidate,
            email: candidate.email || emailById.get(String(candidate.id)) || ''
          }));
        }
      }
      $('candidate-total').textContent=candidates.length.toLocaleString();
      $('candidate-email-total').textContent=candidates.filter(x=>x.email).length.toLocaleString();
      $('candidate-verified-total').textContent=candidates.filter(x=>x.phone_verified).length.toLocaleString();
      page=0; applyFilters();
    } catch(e) {
      list.innerHTML='<div class="admin-empty"><strong>Candidate directory could not load.</strong><br>Check that the admin role has SELECT access to candidate profiles.<br><small>'+esc(e.message)+'</small></div>';
      $('candidate-result-count').textContent='Unavailable';
    }
  }
  function applyFilters() {
    const q=$('candidate-search').value.trim().toLowerCase(), v=$('candidate-verification-filter').value;
    filtered=candidates.filter(x=>(!q||[x.full_name,x.email,x.phone,x.id].some(t=>String(t||'').toLowerCase().includes(q)))&&(!v||(v==='verified'?x.phone_verified:!x.phone_verified)));
    renderList();
  }
  function renderList() {
    const list=$('candidate-list'); if(!list)return;
    $('candidate-result-count').textContent=filtered.length+' candidate'+(filtered.length===1?'':'s');
    const pages=Math.max(1,Math.ceil(filtered.length/pageSize)); page=Math.min(page,pages-1);
    const shown=filtered.slice(page*pageSize,(page+1)*pageSize);
    list.innerHTML=shown.length?shown.map(x=>`<article class="candidate-row"><div class="candidate-avatar">${esc(initials(x.full_name))}</div><div class="candidate-main"><strong>${esc(x.full_name||'Unnamed candidate')}</strong><span>${esc(x.email||'No email on profile')}</span><small>Joined ${esc(date(x.created_at))} · Last login ${esc(dateTime(activityById.get(String(x.id))?.started_at))} · ID ${esc(String(x.id).slice(0,8))}…</small></div><div class="candidate-row-meta"><span class="candidate-status ${x.phone_verified?'is-verified':'is-pending'}">${x.phone_verified?'✓ Phone verified':'Phone not verified'}</span><small>${esc(x.phone||'No phone provided')}</small><small>${(activityById.get(String(x.id)) && !activityById.get(String(x.id)).ended_at && Date.now()-new Date(activityById.get(String(x.id)).last_seen_at).getTime()<180000)?'🟢 Online now':'⚪ Offline'} · Online time ${esc(durationLabel(activityById.get(String(x.id))?.duration_seconds))}</small></div><button class="admin-btn admin-btn-secondary candidate-view-btn" type="button" data-candidate-view="${esc(x.id)}">View profile ↗</button></article>`).join(''):'<div class="admin-empty">No candidates match these filters.</div>';
    $('candidate-page-label').textContent=filtered.length?'Showing '+(page*pageSize+1)+'–'+Math.min((page+1)*pageSize,filtered.length)+' of '+filtered.length:'No results';
    $('candidate-prev').disabled=page===0;$('candidate-next').disabled=page>=pages-1;
  }
  async function showDetail(id) {
    selected=candidates.find(x=>String(x.id)===String(id)); if(!selected)return;
    const panel=$('candidate-detail'), body=$('candidate-detail-content');panel.hidden=false;body.innerHTML='<div class="admin-empty">Loading candidate history…</div>';panel.scrollIntoView({behavior:'smooth',block:'start'});
    try {
      const {data,error}=await supabaseClient.from('attempts').select('id,candidate_name,candidate_id,language,mode,duration_seconds,gross_wpm,net_wpm,accuracy,total_errors,created_at,tests(title)').eq('user_id',selected.id).order('created_at',{ascending:false}).limit(50);
      if(error) throw error;
      attempts=data||[];
      const avg=attempts.length?attempts.reduce((s,a)=>s+Number(a.net_wpm||0),0)/attempts.length:0;
      body.innerHTML=`<div class="candidate-profile-summary"><div class="candidate-avatar large">${esc(initials(selected.full_name))}</div><div><h3>${esc(selected.full_name||'Unnamed candidate')}</h3><p>${esc(selected.email||'No email')} · ${esc(selected.phone||'No phone')}</p><small>Joined ${esc(date(selected.created_at))} · ${selected.phone_verified?'Phone verified':'Phone not verified'}</small></div></div><div class="candidate-detail-stats"><article><span>Attempts loaded</span><strong>${attempts.length}</strong></article><article><span>Average net WPM</span><strong>${avg.toFixed(2)}</strong></article><article><span>Average accuracy</span><strong>${attempts.length?(attempts.reduce((s,a)=>s+Number(a.accuracy||0),0)/attempts.length).toFixed(2)+'%':'—'}</strong></article></div><div class="candidate-history-heading"><h3>Recent typing attempts</h3><span>Latest 50 records</span></div>${attempts.length?'<div class="candidate-history-table-wrap"><table class="admin-table candidate-history-table"><thead><tr><th>Date</th><th>Test</th><th>Language</th><th>Net WPM</th><th>Accuracy</th><th>Errors</th></tr></thead><tbody>'+attempts.map(a=>'<tr><td>'+esc(date(a.created_at))+'</td><td>'+esc(a.tests?.title||'Practice test')+'</td><td>'+esc(a.language||'—')+'</td><td>'+Number(a.net_wpm||0).toFixed(2)+'</td><td>'+Number(a.accuracy||0).toFixed(2)+'%</td><td>'+Number(a.total_errors||0)+'</td></tr>').join('')+'</tbody></table></div>':'<div class="admin-empty">No submitted attempts found for this candidate.</div>'}${activityHtml}`;
      await renderCandidatePermissions(selected);
    } catch(e) { body.innerHTML='<div class="admin-error">Could not load attempt history: '+esc(e.message)+'</div>'; }
  }
  const permissionDefinitions = [
    ['folder_tests','Folders & Tests','Create and manage folders and typing tests.'],
    ['results_attempts','Results & Attempts','Read candidate test results and attempts.'],
    ['study_materials','PDF & Study Material','Create and manage study material links.'],
    ['website_content','Website Content','Manage public announcements and content cards.'],
    ['website_settings','Website Settings','Change supported website visibility and ad settings.']
  ];
  async function renderCandidatePermissions(candidate) {
    const body=$('candidate-detail-content'); if(!body)return;
    const section=document.createElement('section');
    section.className='candidate-permissions-panel admin-panel';
    section.innerHTML='<div class="admin-panel-heading"><div><h2>Permissions &amp; staff access</h2><p>Grant selected management features without promoting this account to admin.</p></div><span class="candidate-permission-badge">Limited role</span></div><div class="candidate-permission-list"><div class="admin-empty">Loading saved permissions…</div></div><div class="candidate-permission-footer"><span class="candidate-permission-status" role="status">Permissions are not changed until saved.</span><div class="candidate-permission-actions"><a class="candidate-workspace-link" href="candidate-workspace.html" target="_blank" rel="noopener">Open staff workspace ↗</a><button type="button" class="admin-btn admin-btn-primary" data-permissions-save>Save permissions</button></div></div>';
    body.appendChild(section);
    const list=section.querySelector('.candidate-permission-list'),status=section.querySelector('.candidate-permission-status'),save=section.querySelector('[data-permissions-save]');
    let current={};
    try {
      const {data,error}=await supabaseClient.from('candidate_permissions').select('permissions').eq('user_id',candidate.id).maybeSingle();
      if(error)throw error;
      current=data?.permissions||{};
      list.innerHTML=permissionDefinitions.map(([key,label,description])=>'<label class="candidate-permission-row"><span class="candidate-permission-copy"><strong>'+esc(label)+'</strong><small>'+esc(description)+'</small></span><input type="checkbox" data-permission="'+key+'" '+(current[key]===true?'checked':'')+'><span class="candidate-permission-switch" aria-hidden="true"></span></label>').join('');
      status.textContent='Current permissions loaded · '+permissionDefinitions.filter(([key])=>current[key]===true).length+' enabled';
    } catch(error) {
      list.innerHTML='<div class="admin-error">Could not load permissions: '+esc(error.message||'database request failed')+'</div>';
      save.disabled=true; return;
    }
    save.addEventListener('click',async()=>{
      const permissions={};
      list.querySelectorAll('[data-permission]').forEach(input=>permissions[input.dataset.permission]=input.checked);
      save.disabled=true;save.textContent='Saving…';status.textContent='Saving permissions…';
      try {
        const user=await supabaseClient.auth.getUser();
        if(user.error||!user.data?.user)throw new Error('Admin session is no longer valid. Please sign in again.');
        const {error}=await supabaseClient.from('candidate_permissions').upsert({user_id:candidate.id,permissions,granted_by:user.data.user.id,updated_at:new Date().toISOString()},{onConflict:'user_id'});
        if(error)throw error;
        status.textContent='Saved successfully · '+permissionDefinitions.filter(([key])=>permissions[key]).length+' permissions enabled';
        status.classList.add('is-saved');
      } catch(error) {
        status.textContent='Save failed: '+(error.message||'database request failed');
        status.classList.remove('is-saved');
      } finally {save.disabled=false;save.textContent='Save permissions';}
    });
  }
  window.renderCandidatesModule = renderShell;
})();