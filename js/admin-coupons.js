(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toLocal = value => {
    if (!value) return '';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  };
  const fromLocal = value => value ? new Date(value).toISOString() : null;
  const minor = value => Math.round(Number(value) * 100);
  const money = value => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(value||0)/100);

  window.initAdminCouponManager = root => {
    if (!root || root.dataset.couponManagerReady === '1') return;
    root.dataset.couponManagerReady = '1';
    const client = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    if (!client) { root.textContent = 'Secure database connection unavailable.'; return; }
    let coupons = [], plans = [], editingId = null;
    root.innerHTML =
      '<form id="coupon-form" class="admin-panel" style="padding:16px;margin:0 0 16px">' +
      '<div class="admin-panel-heading"><div><h3 id="coupon-form-title">Create a coupon</h3><p>Checkout revalidates every rule in the database transaction.</p></div></div>' +
      '<div class="admin-form-grid">' +
      '<div class="admin-form-field"><label for="coupon-code">Coupon code</label><input id="coupon-code" class="admin-input" maxlength="40" required autocomplete="off" placeholder="HCM20"></div>' +
      '<div class="admin-form-field"><label for="coupon-type">Discount type</label><select id="coupon-type" class="admin-input"><option value="percentage">Percentage (%)</option><option value="fixed">Fixed amount (₹)</option></select></div>' +
      '<div class="admin-form-field"><label id="coupon-value-label" for="coupon-value">Discount percentage</label><input id="coupon-value" class="admin-input" type="number" min="1" max="100" step="1" required></div>' +
      '<div class="admin-form-field"><label for="coupon-minimum">Minimum purchase (₹)</label><input id="coupon-minimum" class="admin-input" type="number" min="0" step=".01" value="0"></div>' +
      '<div class="admin-form-field"><label for="coupon-maximum">Maximum discount (₹, optional)</label><input id="coupon-maximum" class="admin-input" type="number" min=".01" step=".01" placeholder="No cap"></div>' +
      '<div class="admin-form-field"><label for="coupon-starts">Starts at</label><input id="coupon-starts" class="admin-input" type="datetime-local" required></div>' +
      '<div class="admin-form-field"><label for="coupon-ends">Ends at (optional)</label><input id="coupon-ends" class="admin-input" type="datetime-local"></div>' +
      '<div class="admin-form-field"><label for="coupon-max-uses">Total redemptions</label><input id="coupon-max-uses" class="admin-input" type="number" min="1" max="10000000" step="1" placeholder="Unlimited"></div>' +
      '<div class="admin-form-field"><label for="coupon-max-user">Redemptions per account</label><input id="coupon-max-user" class="admin-input" type="number" min="1" max="1000000" step="1" placeholder="Unlimited"></div>' +
      '<div class="admin-form-field admin-form-field-wide"><label for="coupon-plans">Eligible plans (empty = all plans)</label><select id="coupon-plans" class="admin-input" multiple size="4"></select></div>' +
      '</div><label class="admin-check"><input id="coupon-active" type="checkbox" checked> Active and available for checkout</label>' +
      '<p id="coupon-message" class="admin-form-message" role="status" aria-live="polite"></p>' +
      '<div class="admin-modal-actions"><button type="button" id="coupon-cancel" class="admin-btn admin-btn-secondary" hidden>Cancel edit</button><button type="submit" id="coupon-save" class="admin-btn admin-btn-primary">Create coupon</button></div></form>' +
      '<section class="admin-panel" style="padding:16px;margin:0"><div class="admin-panel-heading"><div><h3>Existing coupons</h3><p>Deactivate codes to stop future use. Past orders keep their discount record.</p></div><button type="button" id="coupon-refresh" class="admin-btn admin-btn-secondary">↻ Refresh</button></div><div id="coupon-list" class="admin-table-wrap"><div class="admin-empty">Loading coupons…</div></div></section>';
    const $ = id => root.querySelector('#' + id);
    const notify = (value,error=false) => { $('coupon-message').textContent=value; $('coupon-message').className='admin-form-message'+(error?' is-error':' is-success'); };
    const reset = () => {
      editingId=null; $('coupon-form').reset(); $('coupon-type').value='percentage';
      $('coupon-value').max='100'; $('coupon-value').step='1'; $('coupon-value-label').textContent='Discount percentage';
      $('coupon-starts').value=toLocal(new Date().toISOString()); $('coupon-active').checked=true;
      $('coupon-form-title').textContent='Create a coupon'; $('coupon-save').textContent='Create coupon';
      $('coupon-cancel').hidden=true; $('coupon-code').disabled=false;
      $('coupon-plans').querySelectorAll('option').forEach(o=>o.selected=false);
    };
    const load = async () => {
      $('coupon-list').innerHTML='<div class="admin-empty">Loading coupons…</div>';
      const [c,p]=await Promise.all([
        client.from('subscription_coupons').select('*').order('created_at',{ascending:false}).limit(500),
        client.from('subscription_plans').select('id,name').order('sort_order').order('name')
      ]);
      if(c.error)throw c.error;if(p.error)throw p.error;
      coupons=c.data||[];plans=p.data||[];
      $('coupon-plans').innerHTML=plans.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
      $('coupon-list').innerHTML=coupons.length?
        '<table class="admin-ledger-table"><thead><tr><th>Code</th><th>Discount</th><th>Validity</th><th>Limits</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+
        coupons.map(x=>{
          const discount=x.discount_type==='percentage'?Number(x.discount_value)+'%':money(x.discount_value);
          const validity=new Date(x.starts_at).toLocaleString()+(x.ends_at?' – '+new Date(x.ends_at).toLocaleString():' – No end date');
          const limits=(x.max_redemptions?x.max_redemptions+' total':'Unlimited total')+' · '+(x.max_redemptions_per_user?x.max_redemptions_per_user+' per account':'Unlimited per account');
          return '<tr><td><strong>'+esc(x.code)+'</strong><small style="display:block">'+(x.plan_ids?.length?x.plan_ids.length+' selected plan(s)':'All plans')+'</small></td><td>'+esc(discount)+(x.max_discount_minor?'<small style="display:block">Max '+esc(money(x.max_discount_minor))+'</small>':'')+'</td><td>'+esc(validity)+'</td><td>'+esc(limits)+'</td><td><span class="admin-ledger-status '+(x.is_active?'is-succeeded':'')+'">'+(x.is_active?'Active':'Inactive')+'</span></td><td><button type="button" class="admin-btn admin-btn-secondary" data-coupon-edit="'+esc(x.id)+'">Edit</button> <button type="button" class="admin-btn admin-btn-secondary" data-coupon-toggle="'+esc(x.id)+'">'+(x.is_active?'Deactivate':'Activate')+'</button></td></tr>';
        }).join('')+'</tbody></table>':'<div class="admin-empty">No coupons created yet.</div>';
      $('coupon-list').querySelectorAll('[data-coupon-edit]').forEach(b=>b.addEventListener('click',()=>edit(b.dataset.couponEdit)));
      $('coupon-list').querySelectorAll('[data-coupon-toggle]').forEach(b=>b.addEventListener('click',()=>toggle(b.dataset.couponToggle)));
    };
    const edit = id => {
      const x=coupons.find(c=>c.id===id);if(!x)return;
      editingId=id;$('coupon-code').value=x.code;$('coupon-code').disabled=true;
      $('coupon-type').value=x.discount_type;$('coupon-value').value=x.discount_type==='fixed'?(Number(x.discount_value)/100).toFixed(2):x.discount_value;
      $('coupon-value').max=x.discount_type==='fixed'?'':'100';$('coupon-value').step=x.discount_type==='fixed'?'.01':'1';
      $('coupon-value-label').textContent=x.discount_type==='fixed'?'Discount amount (₹)':'Discount percentage';
      $('coupon-minimum').value=(Number(x.min_subtotal_minor||0)/100).toFixed(2);
      $('coupon-maximum').value=x.max_discount_minor?(Number(x.max_discount_minor)/100).toFixed(2):'';
      $('coupon-starts').value=toLocal(x.starts_at);$('coupon-ends').value=toLocal(x.ends_at);
      $('coupon-max-uses').value=x.max_redemptions??'';$('coupon-max-user').value=x.max_redemptions_per_user??'';
      $('coupon-active').checked=!!x.is_active;
      $('coupon-plans').querySelectorAll('option').forEach(o=>o.selected=(x.plan_ids||[]).includes(o.value));
      $('coupon-form-title').textContent='Edit coupon · '+x.code;$('coupon-save').textContent='Save changes';
      $('coupon-cancel').hidden=false;$('coupon-code').scrollIntoView({block:'center',behavior:'smooth'});
    };
    const toggle = async id => {
      const x=coupons.find(c=>c.id===id);if(!x)return;
      const {data:a}=await client.auth.getUser();
      const {error}=await client.from('subscription_coupons').update({is_active:!x.is_active,updated_by:a?.user?.id||null,updated_at:new Date().toISOString()}).eq('id',id);
      if(error){notify(error.message||'Could not update coupon.',true);return;}
      notify(x.is_active?'Coupon deactivated. Existing orders are unchanged.':'Coupon activated.');
      await load();
    };
    $('coupon-type').addEventListener('change',()=>{
      const fixed=$('coupon-type').value==='fixed';$('coupon-value').max=fixed?'':'100';
      $('coupon-value').step=fixed?'.01':'1';$('coupon-value-label').textContent=fixed?'Discount amount (₹)':'Discount percentage';
    });
    $('coupon-cancel').addEventListener('click',()=>{reset();notify('Edit cancelled.');});
    $('coupon-refresh').addEventListener('click',()=>load().catch(e=>notify(e.message||'Could not load coupons.',true)));
    $('coupon-form').addEventListener('submit',async event=>{
      event.preventDefault();
      const code=$('coupon-code').value.trim().toUpperCase(),type=$('coupon-type').value,raw=Number($('coupon-value').value);
      const value=type==='fixed'?minor(raw):raw,minimum=minor($('coupon-minimum').value||0);
      const maximum=$('coupon-maximum').value.trim()===''?null:minor($('coupon-maximum').value);
      const starts=fromLocal($('coupon-starts').value),ends=fromLocal($('coupon-ends').value);
      const maxUses=$('coupon-max-uses').value.trim()===''?null:Number($('coupon-max-uses').value);
      const maxUser=$('coupon-max-user').value.trim()===''?null:Number($('coupon-max-user').value);
      const planIds=Array.from($('coupon-plans').selectedOptions).map(o=>o.value);
      if(!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)||!Number.isSafeInteger(value)||value<=0||
        (type==='percentage'&&(!Number.isInteger(raw)||raw>100))||!Number.isSafeInteger(minimum)||minimum<0||
        (maximum!==null&&(!Number.isSafeInteger(maximum)||maximum<=0))||!starts||(ends&&new Date(ends)<=new Date(starts))||
        (maxUses!==null&&(!Number.isInteger(maxUses)||maxUses<1||maxUses>10000000))||
        (maxUser!==null&&(!Number.isInteger(maxUser)||maxUser<1||maxUser>1000000))){
        notify('Check the code, discount, date range and redemption limits.',true);return;
      }
      const {data:a}=await client.auth.getUser();
      const payload={code,discount_type:type,discount_value:value,min_subtotal_minor:minimum,max_discount_minor:maximum,
        starts_at:starts,ends_at:ends,max_redemptions:maxUses,max_redemptions_per_user:maxUser,
        plan_ids:planIds,is_active:$('coupon-active').checked,updated_by:a?.user?.id||null,updated_at:new Date().toISOString()};
      const button=$('coupon-save');button.disabled=true;notify(editingId?'Saving coupon…':'Creating coupon…');
      try{
        const result=editingId?await client.from('subscription_coupons').update(payload).eq('id',editingId):
          await client.from('subscription_coupons').insert({...payload,created_by:a?.user?.id||null});
        if(result.error)throw result.error;
        reset();notify('Coupon saved. Checkout will enforce all rules on the server.');await load();
      }catch(error){notify(error.message||'Could not save coupon.',true);}
      finally{button.disabled=false;}
    });
    reset();
    load().catch(error=>{$('coupon-list').innerHTML='<div class="admin-error">Coupon controls could not load. Apply the coupon engine migration and confirm administrator permissions. '+esc(error.message||'')+'</div>';});
  };
})();
