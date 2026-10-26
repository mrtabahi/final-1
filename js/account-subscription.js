document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const money = (minor, currency='INR') => {
    try { return new Intl.NumberFormat(undefined,{style:'currency',currency:currency||'INR',maximumFractionDigits:2}).format(Number(minor||0)/100); }
    catch (_) { return String((Number(minor||0)/100).toFixed(2))+' '+String(currency||'INR'); }
  };
  const modal=$('account-upgrade-modal'), planList=$('account-plan-list'), status=$('account-subscription-status'), checkoutStatus=$('account-checkout-status');
  if(!modal || typeof supabaseClient === 'undefined' || !supabaseClient) return;
  let plans=[], user=null, lastFocus=null, razorpayPromise=null;
  const say=(node,message,kind='')=>{if(!node)return;node.textContent=message;node.className=(node===status?'account-sub-status':'account-checkout-status')+(kind?' '+kind:'');};
  const openModal=()=>{lastFocus=document.activeElement;modal.hidden=false;document.body.style.overflow='hidden';modal.querySelector('.account-upgrade-dialog')?.focus();};
  const closeModal=()=>{modal.hidden=true;document.body.style.overflow='';lastFocus?.focus?.();};
  document.querySelectorAll('[data-open-subscription]').forEach(button=>button.addEventListener('click',openModal));
  modal.querySelectorAll('[data-close-subscription]').forEach(button=>button.addEventListener('click',closeModal));
  modal.addEventListener('click',event=>{if(event.target===modal)closeModal();});
  modal.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeModal();return;}if(event.key==='Tab'){const items=[...modal.querySelectorAll('button:not(:disabled),a[href],[tabindex]:not([tabindex="-1"])')].filter(x=>!x.hidden);if(!items.length)return;const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
  const deepLink=()=>location.hash==='#upgrade-plan'||new URLSearchParams(location.search).get('open')==='subscription';
  if(deepLink()) openModal();
  window.addEventListener('hashchange',()=>{if(location.hash==='#upgrade-plan')openModal();});
  function date(value){if(!value)return 'Not set';const d=new Date(value);return Number.isNaN(d.getTime())?'Not set':d.toLocaleString();}
  function renderCurrent(rows){
    const root=$('account-current-subscription');
    if(!root)return;
    const current=rows.find(x=>x.is_current)||rows.find(x=>['active','trialing'].includes(String(x.status||'').toLowerCase()));
    if(!current){root.innerHTML='<div class="account-sub-stat"><small>Current plan</small><strong>No active subscription</strong><span class="account-sub-muted">Choose a plan to unlock its configured access.</span></div><div class="account-sub-stat"><small>Access status</small><strong>Free / standard access</strong><span class="account-sub-muted">Paid access is only applied after server verification.</span></div>';return;}
    const active=current.is_current;
    const planDetails=plans.find(plan=>plan.id===current.plan_id);
    const featureLabels=Array.isArray(planDetails?.entitlements)?planDetails.entitlements.map(item=>item.label).filter(Boolean):[];
    const featureSummary=featureLabels.length?featureLabels.join(' · '):'No specific access rules configured';
    root.innerHTML='<div class="account-sub-stat"><small>Current plan</small><strong>'+esc(current.plan_name||'Subscription')+'</strong><span class="account-sub-chip '+(active?'current':'')+'">'+esc(active?'Current plan':current.status||'Recorded')+'</span></div><div class="account-sub-stat"><small>Included access</small><strong>'+esc(featureSummary)+'</strong><span class="account-sub-muted">Configured by the administrator</span></div><div class="account-sub-stat"><small>Valid from</small><strong>'+esc(date(current.starts_at))+'</strong><span class="account-sub-muted">Subscription start</span></div><div class="account-sub-stat"><small>Valid until</small><strong>'+esc(date(current.ends_at))+'</strong><span class="account-sub-muted">Based on server records</span></div><div class="account-sub-stat"><small>Renewal / access</small><strong>'+esc(active?'Access active':'Review status')+'</strong><span class="account-sub-muted">Plan validity is checked server-side.</span></div>';
  }
  function renderHistory(rows){
    const root=$('account-subscription-history');if(!root)return;
    if(!rows.length){root.innerHTML='<p class="form-help">No subscription records yet. Your plan will appear here after activation.</p>';return;}
    root.innerHTML=rows.map(row=>'<article class="account-sub-record"><strong>'+esc(row.plan_name||'Subscription')+'</strong><small>'+esc(date(row.starts_at))+' → '+esc(date(row.ends_at))+'</small><span class="account-sub-chip '+(row.is_current?'current':'')+'">'+esc(row.is_current?'Current':row.status||'Recorded')+'</span></article>').join('');
  }
  function renderOrders(rows){
    const root=$('account-order-history');if(!root)return;
    if(!rows.length){root.innerHTML='<p class="form-help">No orders yet. Your checkout and payment records will appear here.</p>';return;}
    root.innerHTML=rows.map(row=>{const state=row.checkout_expired?'Checkout expired':String(row.status||'pending');const cls=['paid','captured','succeeded'].includes(state.toLowerCase())?'paid':['failed','expired','refunded'].includes(state.toLowerCase())?state.toLowerCase():'';return '<article class="account-sub-record"><strong>'+esc(row.plan_name||'Plan order')+' · '+esc(money(row.total_minor,row.currency))+'</strong><small>'+esc(date(row.created_at))+'<br>Subtotal '+esc(money(row.subtotal_minor,row.currency))+' · Discount '+esc(money(row.discount_minor,row.currency))+'</small><span class="account-sub-chip '+cls+'">'+esc(state)+'</span></article>';}).join('');
  }
  async function loadRazorpay(){if(window.Razorpay)return;if(!razorpayPromise)razorpayPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://checkout.razorpay.com/v1/checkout.js';s.onload=resolve;s.onerror=()=>reject(new Error('Secure checkout could not load. Please retry.'));document.head.appendChild(s);});await razorpayPromise;}
  function renderPlans(){
    if(!plans.length){planList.innerHTML='<div class="account-sub-skeleton">No active plans are available right now. Please check back later.</div>';return;}
    planList.innerHTML=plans.map(plan=>{const free=Number(plan.price_minor)===0;const features=Array.isArray(plan.entitlements)?plan.entitlements.map(item=>item.label).filter(Boolean):[];const unavailable=features.length===0;return '<article class="account-plan-card"><h3>'+esc(plan.name)+'</h3><p class="account-plan-description">'+esc(plan.description||'Access to selected Decoding HCM preparation features.')+'</p><p class="account-plan-price">'+esc(money(plan.price_minor,plan.currency))+'</p><div class="account-plan-features">'+(features.length?features.map(label=>'<span class="account-plan-feature">'+esc(label)+'</span>').join(''):'<span class="account-plan-feature is-muted">Access not configured yet</span>')+'</div><div class="account-plan-meta"><span>'+esc(plan.duration_days)+' days</span><span>·</span><span>'+esc(plan.currency||'INR')+'</span></div><button type="button" class="account-plan-buy" data-account-buy="'+esc(plan.id)+'" '+(unavailable?'disabled aria-disabled="true" title="Administrator must configure included access first"':'')+'>'+(unavailable?'Unavailable — access not configured':free?'Activate free plan':'Choose plan securely')+'</button></article>';}).join('');
    planList.querySelectorAll('[data-account-buy]').forEach(button=>button.addEventListener('click',async()=>{const plan=plans.find(x=>x.id===button.dataset.accountBuy);if(!plan)return;if(!Array.isArray(plan.entitlements)||plan.entitlements.length===0){say(checkoutStatus,'This plan is not available until the administrator configures its access.','error');return;}if(!user){location.href='login.html?redirect='+encodeURIComponent('my_account.html#upgrade-plan');return;}if(Number(plan.price_minor)===0){await activateFree(plan,button);return;}await startCheckout(plan,button);}));
  }
  async function refreshOverview(){
    const result=await supabaseClient.rpc('get_my_subscription_overview');
    if(result.error)throw result.error;
    const data=result.data||{};
    const subscriptions=Array.isArray(data.subscriptions)?data.subscriptions:[];
    renderCurrent(subscriptions);renderHistory(subscriptions);renderOrders(Array.isArray(data.orders)?data.orders:[]);
  }
  async function load(){
    try{
      user=await AuthManager.getUser();
      const result=await supabaseClient.rpc('get_active_subscription_plan_details');
      if(result.error)throw result.error;
      plans=Array.isArray(result.data)?result.data:[];
      renderPlans();
      if(user){await refreshOverview();say(status,'Subscription details are synced from your account records.','success');}
      else {say(status,'Sign in to view your personal subscription and order history.');renderCurrent([]);renderHistory([]);renderOrders([]);}
    }catch(error){console.error('Account subscription data could not be loaded',error);say(status,error?.message||'Subscription details could not be loaded. Please refresh and try again.','error');planList.innerHTML='<div class="account-sub-skeleton">Plans could not be loaded. Please refresh the page and retry.</div>';}
  }
  async function activateFree(plan,button){
    button.disabled=true;say(checkoutStatus,'Activating the free plan…');
    try{const result=await supabaseClient.rpc('create_checkout_order',{p_plan_id:plan.id,p_coupon_code:null});if(result.error)throw result.error;if(result.data?.status!=='free')throw new Error('The server did not confirm free-plan activation.');say(checkoutStatus,'Free plan activated. Refreshing your account…','success');await refreshOverview();}
    catch(error){console.error(error);say(checkoutStatus,error?.message||'Unable to activate this plan.','error');}
    finally{button.disabled=false;}
  }
  async function startCheckout(plan,button){
    button.disabled=true;planList.querySelectorAll('button').forEach(b=>b.disabled=true);say(checkoutStatus,'Preparing secure checkout…');
    try{
      const result=await supabaseClient.functions.invoke('create-checkout',{body:{plan_id:plan.id,coupon_code:null}});
      if(result.error)throw result.error;const data=result.data||{};
      if(data.mode==='free'){say(checkoutStatus,'Free plan activated.','success');await refreshOverview();return;}
      if(data.mode!=='razorpay'||!data.key_id||!data.razorpay_order_id||!data.local_order_id)throw new Error(data.error||'Paid checkout is not configured yet. No payment was started.');
      await loadRazorpay();
      const checkout=new window.Razorpay({key:data.key_id,amount:data.amount,currency:data.currency,name:'Decoding HCM',description:plan.name+' subscription',order_id:data.razorpay_order_id,prefill:data.customer||{},notes:{local_order_id:data.local_order_id},theme:{color:'#2563eb'},
        handler:async response=>{say(checkoutStatus,'Verifying payment with the server…');try{const verified=await supabaseClient.functions.invoke('verify-razorpay-payment',{body:{local_order_id:data.local_order_id,razorpay_order_id:response.razorpay_order_id,razorpay_payment_id:response.razorpay_payment_id,razorpay_signature:response.razorpay_signature}});if(verified.error)throw verified.error;if(verified.data?.success){say(checkoutStatus,'Payment verified. Your subscription details are updated.','success');await refreshOverview();}else say(checkoutStatus,'Payment confirmation is still pending. Do not pay again; check your order history shortly.');}catch(error){console.error('Payment verification pending',error);say(checkoutStatus,'Payment may have succeeded but verification is pending. Do not pay again; refresh your order history shortly.');}},
        modal:{ondismiss:()=>say(checkoutStatus,'Checkout closed. If you completed payment, wait for provider confirmation before trying again.')}
      });
      checkout.on('payment.failed',()=>say(checkoutStatus,'Payment was not completed. You can safely retry checkout.','error'));checkout.open();
    }catch(error){console.error('Secure checkout could not start',error);say(checkoutStatus,error?.message||'Unable to start secure checkout.','error');}
    finally{planList.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  await load();
});
