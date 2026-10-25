document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);
  const loading = $('payments-loading'), app = $('payments-app'), status = $('payments-status');
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  let coupons = [], plans = [], orders = [], transactions = [], saving = false;
  const setStatus = (message, kind = '') => { status.textContent = message; status.className = 'access-status' + (kind ? ' is-' + kind : ''); };
  if (typeof AuthManager === 'undefined' || !supabaseClient) { loading.innerHTML = '<strong>Admin dependencies unavailable</strong><span>Check js/config.js and js/auth.js.</span>'; return; }
  let auth;
  try { auth = await AuthManager.requireAdminGuard(); }
  catch (error) { console.error('Payments admin guard failed', error); location.href = 'login.html'; return; }
  if (!auth?.ok && !(auth?.user && auth?.profile)) return;
  if (!auth?.user || !auth?.profile || !['admin','head_admin'].includes(String(auth.profile.role || '').toLowerCase())) {
    loading.innerHTML = '<strong>Administrator access required</strong><span>This area is restricted to authorized administrators.</span>'; return;
  }
  $('payments-admin-name').textContent = auth.profile.full_name || auth.user.email || 'Administrator';
  $('payments-admin-email').textContent = auth.user.email || auth.profile.email || '';
  $('payments-avatar').textContent = ($('payments-admin-name').textContent.trim()[0] || 'A').toUpperCase();
  loading.hidden = true; loading.style.display = 'none'; app.hidden = false; app.style.display = 'grid';
  $('payments-logout').addEventListener('click', async () => { $('payments-logout').disabled = true; try { await AuthManager.logout(); } catch (error) { $('payments-logout').disabled = false; setStatus(error.message || 'Could not sign out.', 'error'); } });
  $('payments-refresh').addEventListener('click', load);
  $('payments-new').addEventListener('click', () => openForm());
  $('payments-cancel').addEventListener('click', closeForm);
  $('payments-form').addEventListener('submit', saveCoupon);
  $('payments-scope').addEventListener('change', updatePlanPicker);
  $('payments-type').addEventListener('change', updateDiscountLabel);

  async function load() {
    if (saving) return;
    setStatus('Loading coupon and order catalog…');
    try {
      const [couponRes, planRes, orderRes, transactionRes] = await Promise.all([
        supabaseClient.rpc('admin_list_coupons'),
        supabaseClient.rpc('admin_list_subscription_plans'),
        supabaseClient.rpc('admin_list_orders'),
        supabaseClient.rpc('admin_list_payment_transactions')
      ]);
      for (const result of [couponRes, planRes, orderRes, transactionRes]) if (result.error) throw result.error;
      coupons = couponRes.data || []; plans = planRes.data || []; orders = orderRes.data || []; transactions = transactionRes.data || [];
      renderCoupons(); renderOrders(); renderTransactions();
      setStatus('Coupon, order and transaction records loaded. Checkout is not connected.', 'success');
    } catch (error) {
      console.error('Coupon load failed', error);
      $('payments-list').innerHTML = '<div class="admin-empty">Could not load coupons. Confirm the foundation migration is applied to staging and admin RPC permissions are configured.</div>';
      setStatus(error.message || 'Unable to load coupons.', 'error');
    }
  }

  function renderCoupons() {
    $('payments-count').textContent = coupons.length;
    $('payments-active-count').textContent = coupons.filter(c => c.is_active).length;
    $('payments-selected-count').textContent = coupons.filter(c => c.applies_to === 'selected_plans').length;
    if (!coupons.length) { $('payments-list').innerHTML = '<div class="admin-empty">No coupons yet. Create one to configure promotion rules.</div>'; return; }
    $('payments-list').innerHTML = coupons.map(c => {
      const discount = c.discount_type === 'percent' ? Number(c.discount_value) + '%' : new Intl.NumberFormat(undefined, {style:'currency',currency:c.currency || 'INR'}).format(Number(c.discount_value || 0)/100);
      const period = [c.starts_at ? 'Starts ' + new Date(c.starts_at).toLocaleString() : 'No start date', c.ends_at ? 'Ends ' + new Date(c.ends_at).toLocaleString() : 'No end date'].join(' · ');
      return '<article class="payments-card"><div class="payments-card-head"><div><h3>' + esc(c.code) + '</h3><p>' + esc(c.description || 'No description') + '</p></div><div class="payments-actions"><span class="payments-chip ' + (c.is_active ? 'active' : '') + '">' + (c.is_active ? 'Active' : 'Inactive') + '</span><button class="admin-btn admin-btn-secondary" type="button" data-edit-coupon="' + esc(c.id) + '">Edit</button></div></div><div class="payments-meta"><strong>' + esc(discount) + ' off</strong><span>·</span><span>' + (c.applies_to === 'all_plans' ? 'All plans' : 'Selected plans') + '</span><span>·</span><span>' + esc(period) + '</span><span>·</span><span>Limit: ' + esc(c.max_redemptions ?? 'Unlimited') + ' total / ' + esc(c.max_redemptions_per_user) + ' per user</span></div></article>';
    }).join('');
    $('payments-list').querySelectorAll('[data-edit-coupon]').forEach(btn => btn.addEventListener('click', () => editCoupon(btn.dataset.editCoupon)));
  }

  function renderOrders() {
    const list = $('payments-orders');
    if (!orders.length) { list.innerHTML = '<div class="admin-empty">No orders yet.</div>'; return; }
    list.innerHTML = orders.map(o => {
      const statusLabel = o.status === 'pending' && o.expires_at && new Date(o.expires_at) <= new Date() ? 'pending · expired' : o.status;
      const format = amount => new Intl.NumberFormat(undefined,{style:'currency',currency:o.currency}).format(Number(amount||0)/100);
      return '<article class="payments-order-card"><div class="payments-order-head"><div><h3>' + esc(o.plan_name) + '</h3><p>' + esc(o.user_name || 'Candidate') + ' · ' + esc(o.user_email || o.user_id) + '</p></div><span class="payments-order-chip ' + esc(o.status) + '">' + esc(statusLabel) + '</span></div><div class="payments-order-meta"><span>Order ' + esc(o.id) + '</span><span>·</span><span>Subtotal ' + esc(format(o.subtotal_minor)) + '</span><span>·</span><span>Discount ' + esc(format(o.discount_minor)) + '</span><span>·</span><strong>Total ' + esc(format(o.total_minor)) + '</strong><span>·</span><span>' + esc(new Date(o.created_at).toLocaleString()) + '</span></div></article>';
    }).join('');
  }

  function renderTransactions() {
    const list = $('payments-transactions');
    if (!transactions.length) { list.innerHTML = '<div class="admin-empty">No payment transactions recorded yet.</div>'; return; }
    list.innerHTML = transactions.map(t => {
      const amount = new Intl.NumberFormat(undefined,{style:'currency',currency:t.currency}).format(Number(t.amount_minor||0)/100);
      return '<article class="payments-order-card"><div class="payments-order-head"><div><h3>' + esc(t.provider) + '</h3><p>Transaction ' + esc(t.provider_transaction_id || t.id) + '</p>' + (t.provider_refund_id ? '<p>Refund ' + esc(t.provider_refund_id) + '</p>' : '') + '</div><span class="payments-order-chip ' + esc(t.status) + '">' + esc(t.status) + '</span></div><div class="payments-order-meta"><span>Order ' + esc(t.order_id) + '</span><span>·</span><strong>' + esc(amount) + '</strong><span>·</span><span>Verified ' + esc(t.verified_at ? new Date(t.verified_at).toLocaleString() : 'Not verified') + '</span>' + (t.refunded_at ? '<span>·</span><span>Refunded ' + esc(new Date(t.refunded_at).toLocaleString()) + '</span>' : '') + '</div></article>';
    }).join('');
  }

  function renderPlans(selected = []) {
    const set = new Set(selected);
    $('payments-plans').innerHTML = plans.length ? plans.map(p => '<label><input type="checkbox" data-coupon-plan="' + esc(p.id) + '" ' + (set.has(p.id) ? 'checked' : '') + '> <span>' + esc(p.name) + ' · ' + esc(p.currency) + ' · ' + (p.is_active ? 'Active' : 'Inactive') + '</span></label>').join('') : '<span class="admin-empty">Create a plan before selecting eligible plans.</span>';
    updatePlanPicker();
  }
  function updatePlanPicker() {
    $('payments-plan-picker').hidden = $('payments-scope').value === 'all_plans';
  }
  function updateDiscountLabel() {
    $('payments-value').step = '1';
    $('payments-value').max = $('payments-type').value === 'percent' ? '100' : '100000000';
  }
  function localInput(value) {
    if (!value) return '';
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset()*60000);
    return local.toISOString().slice(0,16);
  }
  function openForm(coupon = null, selectedPlans = []) {
    $('payments-form').reset();
    $('payments-id').value = coupon?.id || '';
    $('payments-form-title').textContent = coupon ? 'Edit coupon' : 'Create coupon';
    $('payments-code').value = coupon?.code || '';
    $('payments-type').value = coupon?.discount_type || 'percent';
    $('payments-value').value = coupon?.discount_value || 10;
    $('payments-currency').value = coupon?.currency || 'INR';
    $('payments-scope').value = coupon?.applies_to || 'selected_plans';
    $('payments-max').value = coupon?.max_redemptions ?? '';
    $('payments-per-user').value = coupon?.max_redemptions_per_user || 1;
    $('payments-starts').value = localInput(coupon?.starts_at);
    $('payments-ends').value = localInput(coupon?.ends_at);
    $('payments-description').value = coupon?.description || '';
    $('payments-active').checked = Boolean(coupon?.is_active);
    renderPlans(selectedPlans);
    updateDiscountLabel();
    $('payments-form-panel').hidden = false;
    $('payments-form-panel').scrollIntoView({behavior:'smooth',block:'start'});
    $('payments-code').focus();
  }
  function closeForm() { $('payments-form-panel').hidden = true; }

  async function editCoupon(id) {
    const coupon = coupons.find(c => c.id === id);
    if (!coupon) return;
    setStatus('Loading eligible plans…');
    try {
      const result = await supabaseClient.rpc('admin_get_coupon_plan_eligibility', {p_coupon_id:id});
      if (result.error) throw result.error;
      openForm(coupon, (result.data || []).map(x => x.plan_id));
    } catch (error) { setStatus(error.message || 'Unable to load coupon eligibility.', 'error'); }
  }

  async function saveCoupon(event) {
    event.preventDefault();
    if (saving) return;
    const code = $('payments-code').value.trim().toUpperCase();
    const value = Number($('payments-value').value);
    const type = $('payments-type').value;
    const perUser = Number($('payments-per-user').value);
    const max = $('payments-max').value.trim() ? Number($('payments-max').value) : null;
    const startsRaw = $('payments-starts').value, endsRaw = $('payments-ends').value;
    if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !Number.isInteger(value) || value < 1 || (type === 'percent' && value > 100) || !Number.isInteger(perUser) || perUser < 1 || (max !== null && (!Number.isInteger(max) || max < 1))) {
      setStatus('Check coupon code, discount and redemption limits.', 'error'); return;
    }
    if (startsRaw && endsRaw && new Date(endsRaw) <= new Date(startsRaw)) { setStatus('End date must be after the start date.', 'error'); return; }
    const planIds = Array.from(document.querySelectorAll('[data-coupon-plan]:checked')).map(el => el.dataset.couponPlan);
    if ($('payments-scope').value === 'selected_plans' && !planIds.length) { setStatus('Select at least one eligible plan.', 'error'); return; }
    saving = true; $('payments-save').disabled = true; $('payments-save').textContent = 'Saving…'; setStatus('Saving coupon rules atomically…');
    try {
      const result = await supabaseClient.rpc('admin_save_coupon', {
        p_id: $('payments-id').value || null, p_code: code, p_description: $('payments-description').value.trim(),
        p_discount_type: type, p_discount_value: value, p_currency: $('payments-currency').value,
        p_applies_to: $('payments-scope').value, p_starts_at: startsRaw ? new Date(startsRaw).toISOString() : null,
        p_ends_at: endsRaw ? new Date(endsRaw).toISOString() : null, p_max_redemptions: max,
        p_max_redemptions_per_user: perUser, p_is_active: $('payments-active').checked, p_plan_ids: planIds
      });
      if (result.error) throw result.error;
      closeForm(); await load(); setStatus('Coupon saved. It will not be redeemable until a verified checkout flow is implemented.', 'success');
    } catch (error) { console.error('Coupon save failed', error); setStatus(error.message || 'Unable to save coupon.', 'error'); }
    finally { saving = false; $('payments-save').disabled = false; $('payments-save').textContent = 'Save coupon'; }
  }
  await load();
});