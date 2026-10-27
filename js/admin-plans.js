document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);
  const loading = $('plans-loading'), app = $('plans-app'), status = $('plans-status');
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  let plans = [], folders = [], tests = [], saving = false;
  const setStatus = (message, kind = '') => { status.textContent = message; status.className = 'access-status' + (kind ? ' is-' + kind : ''); };
  if (typeof AuthManager === 'undefined' || !supabaseClient) { loading.innerHTML = '<strong>Admin dependencies unavailable</strong><span>Check js/config.js and js/auth.js.</span>'; return; }
  let auth;
  try { auth = await AuthManager.requireAdminGuard(); }
  catch (error) { console.error('Plans admin guard failed', error); location.href = 'login.html'; return; }
  if (!auth?.ok && !(auth?.user && auth?.profile)) return;
  if (!auth?.user || !auth?.profile || !['admin','head_admin'].includes(String(auth.profile.role || '').toLowerCase())) {
    loading.innerHTML = '<strong>Administrator access required</strong><span>This area is restricted to authorized administrators.</span>'; return;
  }
  $('plans-admin-name').textContent = auth.profile.full_name || auth.user.email || 'Administrator';
  $('plans-admin-email').textContent = auth.user.email || auth.profile.email || '';
  $('plans-avatar').textContent = ($('plans-admin-name').textContent.trim()[0] || 'A').toUpperCase();
  loading.hidden = true; loading.style.display = 'none'; app.hidden = false; app.style.display = 'grid';
  $('plans-logout').addEventListener('click', async () => {
    $('plans-logout').disabled = true;
    try { await AuthManager.logout(); } catch (error) { $('plans-logout').disabled = false; setStatus(error.message || 'Could not sign out.', 'error'); }
  });
  $('plans-refresh').addEventListener('click', load);
  $('plans-new').addEventListener('click', () => openForm());
  $('plans-cancel').addEventListener('click', closeForm);
  $('plans-form').addEventListener('submit', savePlan);

  async function load() {
    if (saving) return;
    setStatus('Loading plans and eligible resources…');
    try {
      const [planRes, folderRes, testRes] = await Promise.all([
        supabaseClient.rpc('admin_list_subscription_plans'),
        supabaseClient.from('folders').select('id,name,active').order('name'),
        supabaseClient.from('tests').select('id,title,folder_id,active').order('title')
      ]);
      if (planRes.error) throw planRes.error;
      if (folderRes.error) throw folderRes.error;
      if (testRes.error) throw testRes.error;
      plans = planRes.data || []; folders = folderRes.data || []; tests = testRes.data || [];
      const entitlementResults = await Promise.all(plans.map(plan => supabaseClient.rpc('admin_get_plan_entitlements', {p_plan_id:plan.id})));
      const entitlementError = entitlementResults.find(result => result.error);
      if (entitlementError) throw entitlementError.error;
      const entitlementCount = entitlementResults.reduce((sum, result) => sum + (Array.isArray(result.data) ? result.data.length : 0), 0);
      $('plans-entitlement-count').textContent = entitlementCount;
      renderPlans(); renderResources();
      setStatus('Plans loaded. Paid checkout is implemented; activation remains gated pending Razorpay Test Mode configuration and end-to-end verification.', 'success');
    } catch (error) {
      console.error('Plans load failed', error);
      $('plans-list').innerHTML = '<div class="admin-empty">Could not load plans. Confirm the access foundation migration is applied to a staging database and admin RPC permissions are configured.</div>';
      setStatus(error.message || 'Unable to load plans.', 'error');
    }
  }

  function renderPlans() {
    $('plans-count').textContent = plans.length;
    $('plans-active-count').textContent = plans.filter(p => p.is_active).length;
    if (!plans.length) { $('plans-list').innerHTML = '<div class="admin-empty">No plans yet. Create a plan to configure price and included content.</div>'; return; }
    $('plans-list').innerHTML = plans.map(p => {
      const price = new Intl.NumberFormat(undefined, {style:'currency', currency:p.currency || 'INR'}).format(Number(p.price_minor || 0) / 100);
      return '<article class="plans-card"><div class="plans-card-head"><div><h3>' + esc(p.name) + '</h3><p>' + esc(p.description || 'No description') + '</p></div><div class="plans-card-actions"><span class="plans-chip ' + (p.is_active ? 'active' : '') + '">' + (p.is_active ? 'Active' : 'Inactive') + '</span><button class="admin-btn admin-btn-secondary" type="button" data-edit-plan="' + esc(p.id) + '">Edit</button></div></div><div class="plans-card-meta"><strong>' + esc(price) + '</strong><span>·</span><span>' + esc(p.duration_days) + ' days</span><span>·</span><span>Updated ' + esc(new Date(p.updated_at || p.created_at).toLocaleDateString()) + '</span></div></article>';
    }).join('');
    $('plans-list').querySelectorAll('[data-edit-plan]').forEach(btn => btn.addEventListener('click', () => editPlan(btn.dataset.editPlan)));
  }

  function renderResources(selected = []) {
    const keys = new Set(selected.map(e => e.resource_type + ':' + e.resource_key));
    $('plans-site-entitlement').checked = keys.has('site:site');
    $('plans-folders').innerHTML = folders.length ? folders.map(f => '<label><input type="checkbox" data-entitlement="folder:' + esc(f.id) + '" ' + (keys.has('folder:' + f.id) ? 'checked' : '') + '> <span>' + esc(f.name || 'Unnamed folder') + (f.active ? '' : ' (inactive)') + '</span></label>').join('') : '<span class="admin-empty">No folders found.</span>';
    $('plans-tests').innerHTML = tests.length ? tests.map(t => '<label><input type="checkbox" data-entitlement="test:' + esc(t.id) + '" ' + (keys.has('test:' + t.id) ? 'checked' : '') + '> <span>' + esc(t.title || 'Untitled test') + (t.active ? '' : ' (inactive)') + '</span></label>').join('') : '<span class="admin-empty">No tests found.</span>';
  }

  function openForm(plan = null, selected = []) {
    $('plans-form').reset();
    $('plans-id').value = plan?.id || '';
    $('plans-form-title').textContent = plan ? 'Edit subscription plan' : 'Create subscription plan';
    $('plans-name').value = plan?.name || '';
    $('plans-price').value = plan ? (Number(plan.price_minor || 0) / 100).toFixed(2) : '199.00';
    $('plans-currency').value = plan?.currency || 'INR';
    $('plans-duration').value = plan?.duration_days || 30;
    $('plans-description').value = plan?.description || '';
    $('plans-active').checked = Boolean(plan?.is_active);
    renderResources(selected);
    $('plans-form-panel').hidden = false;
    $('plans-form-panel').scrollIntoView({behavior:'smooth', block:'start'});
    $('plans-name').focus();
  }
  function closeForm() { $('plans-form-panel').hidden = true; }

  async function editPlan(id) {
    const plan = plans.find(p => p.id === id);
    if (!plan) return;
    setStatus('Loading plan entitlements…');
    try {
      const result = await supabaseClient.rpc('admin_get_plan_entitlements', {p_plan_id:id});
      if (result.error) throw result.error;
      openForm(plan, result.data || []);
    } catch (error) { setStatus(error.message || 'Unable to load plan entitlements.', 'error'); }
  }

  async function savePlan(event) {
    event.preventDefault();
    if (saving) return;
    const name = $('plans-name').value.trim();
    const price = Number($('plans-price').value);
    const duration = Number($('plans-duration').value);
    const currency = $('plans-currency').value;
    if (!name || !Number.isFinite(price) || price < 0 || price > 10000000 || !Number.isInteger(duration) || duration < 1 || duration > 3650) {
      setStatus('Check plan name, price and duration values.', 'error'); return;
    }
    const entitlements = [];
    if ($('plans-site-entitlement').checked) entitlements.push({resource_type:'site', resource_key:'site'});
    document.querySelectorAll('[data-entitlement]:checked').forEach(input => {
      const [resource_type, resource_key] = input.dataset.entitlement.split(':');
      entitlements.push({resource_type, resource_key});
    });
    saving = true; $('plans-save').disabled = true; $('plans-save').textContent = 'Saving…';
    setStatus('Saving plan and entitlements atomically…');
    try {
      const result = await supabaseClient.rpc('admin_save_subscription_plan', {
        p_id: $('plans-id').value || null,
        p_name: name,
        p_description: $('plans-description').value.trim(),
        p_price_minor: Math.round(price * 100),
        p_currency: currency,
        p_duration_days: duration,
        p_is_active: $('plans-active').checked,
        p_entitlements: entitlements
      });
      if (result.error) throw result.error;
      closeForm();
      await load();
      setStatus('Plan saved with ' + Number(result.data?.entitlements_count || 0) + ' entitlement(s). Paid activation remains gated pending Razorpay Test Mode configuration and payment lifecycle verification.', 'success');
    } catch (error) {
      console.error('Plan save failed', error);
      setStatus(error.message || 'Unable to save plan.', 'error');
    } finally { saving = false; $('plans-save').disabled = false; $('plans-save').textContent = 'Save plan'; }
  }
  await load();
});