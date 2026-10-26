document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id),status=$('sub-account-status');
 const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 let plans=[],user=null;
 const setStatus=(m,k='note')=>{status.textContent=m;status.className=k==='error'?'sub-status-error':k==='success'?'sub-status-success':'sub-status-note';};
 const money=(amount,currency)=>new Intl.NumberFormat(undefined,{style:'currency',currency:currency||'INR'}).format(Number(amount||0)/100);
 let razorpayScriptPromise=null;
 async function loadRazorpayScript(){
  if(window.Razorpay)return;
  if(!razorpayScriptPromise)razorpayScriptPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';script.onload=resolve;script.onerror=()=>reject(new Error('Unable to load secure payment checkout.'));document.head.appendChild(script);});
  await razorpayScriptPromise;
 }
 async function loadPlans(){
  const result=await supabaseClient.rpc('get_active_subscription_plans');
  if(result.error)throw result.error;plans=result.data||[];renderPlans();
 }
 async function loadAccount(){
  user=await AuthManager.getUser();
  renderPlans(); // Re-render plan buttons after the authenticated user is loaded.
  if(user){$('sub-login-link').textContent='My Account';$('sub-login-link').href='my_account.html';$('sub-logout').hidden=false;
   const result=await supabaseClient.rpc('get_my_subscription_overview');if(result.error)throw result.error;
   renderSubscriptions(result.data?.subscriptions||[]);renderOrders(result.data?.orders||[]);
  }else{
   $('sub-login-link').textContent='Sign in';$('sub-login-link').href='login.html';
   $('sub-subscriptions').innerHTML='<div class="sub-empty">Sign in to see your subscription status and history.</div>';
   $('sub-orders').innerHTML='<div class="sub-empty">Sign in to see your order history.</div>';
  }
 }
 function renderPlans(){
  if(!plans.length){$('sub-plans').innerHTML='<div class="sub-empty">No active plans are available right now.</div>';return;}
  $('sub-plans').innerHTML=plans.map(p=>{
   const free=Number(p.price_minor)===0;
   const disabled=!user;
   return '<article class="sub-plan-card"><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||'Subscription access to selected content.')+'</p><div class="sub-price">'+esc(money(p.price_minor,p.currency))+'</div><div class="sub-plan-meta"><span>'+esc(p.duration_days)+' days</span><span>·</span><span>'+esc(p.currency)+'</span></div><button class="sub-buy" type="button" data-buy-plan="'+esc(p.id)+'" '+(disabled?'disabled':'')+'>'+ (free?'Activate free plan':'Pay securely with Razorpay')+'</button></article>';
  }).join('');
  $('sub-plans').querySelectorAll('[data-buy-plan]').forEach(b=>b.addEventListener('click',()=>{
   const plan=plans.find(p=>p.id===b.dataset.buyPlan);
   if(!plan)return;
   if(Number(plan.price_minor)===0)activateFreePlan(plan.id);else startPaidCheckout(plan);
  }));
 }
 function renderSubscriptions(rows){
  if(!rows.length){$('sub-subscriptions').innerHTML='<div class="sub-empty">You do not have any subscription records yet.</div>';return;}
  $('sub-subscriptions').innerHTML=rows.map(s=>'<article class="sub-record"><div class="sub-record-head"><div><h3>'+esc(s.plan_name)+'</h3><p>'+esc(s.starts_at?new Date(s.starts_at).toLocaleString():'Start date not set')+' → '+esc(s.ends_at?new Date(s.ends_at).toLocaleString():'No expiry')+'</p></div><span class="sub-chip '+(s.is_current?'current':'')+'">'+esc(s.is_current?'Current':s.status)+'</span></div><div class="sub-record-meta"><span>Created '+esc(new Date(s.created_at).toLocaleDateString())+'</span></div></article>').join('');
 }
 function renderOrders(rows){
  if(!rows.length){$('sub-orders').innerHTML='<div class="sub-empty">No orders yet.</div>';return;}
  $('sub-orders').innerHTML=rows.map(o=>{
   const statusText=o.checkout_expired?'pending (checkout expired)':o.status;
   return '<article class="sub-record"><div class="sub-record-head"><div><h3>'+esc(o.plan_name)+'</h3><p>'+esc(new Date(o.created_at).toLocaleString())+'</p></div><span class="sub-chip">'+esc(statusText)+'</span></div><div class="sub-record-meta"><span>Subtotal '+esc(money(o.subtotal_minor,o.currency))+'</span><span>·</span><span>Discount '+esc(money(o.discount_minor,o.currency))+'</span><span>·</span><strong>Total '+esc(money(o.total_minor,o.currency))+'</strong></div></article>';
  }).join('');
 }
 async function startPaidCheckout(plan){
  if(!user){location.href='login.html';return;}
  const buttons=$('sub-plans').querySelectorAll('[data-buy-plan]');
  buttons.forEach(b=>b.disabled=true);
  setStatus('Preparing secure Razorpay checkout…','note');
  try{
   const {data,error}=await supabaseClient.functions.invoke('create-checkout',{body:{plan_id:plan.id,coupon_code:null}});
   if(error)throw error;
   if(data?.mode==='free'){
    setStatus('Free plan activated successfully.','success');await loadAccount();return;
   }
   if(data?.mode!=='razorpay'||!data.key_id||!data.razorpay_order_id||!data.local_order_id)throw new Error(data?.error||'Paid checkout is not configured yet.');
   await loadRazorpayScript();
   const checkout=new window.Razorpay({
    key:data.key_id,
    amount:data.amount,
    currency:data.currency,
    name:'Decoding HCM',
    description:plan.name+' subscription',
    order_id:data.razorpay_order_id,
    prefill:data.customer||{},
    notes:{local_order_id:data.local_order_id},
    theme:{color:'#2563eb'},
    handler:async response=>{
     setStatus('Verifying payment securely…','note');
     try{
      const verified=await supabaseClient.functions.invoke('verify-razorpay-payment',{body:{
       local_order_id:data.local_order_id,
       razorpay_order_id:response.razorpay_order_id,
       razorpay_payment_id:response.razorpay_payment_id,
       razorpay_signature:response.razorpay_signature
      }});
      if(verified.error)throw verified.error;
      if(verified.data?.success){setStatus('Payment verified. Your subscription is active.','success');await loadAccount();}
      else setStatus('Payment is being confirmed. Do not pay again; refresh your order history shortly.','note');
     }catch(e){console.error('Razorpay callback verification pending',e);setStatus('Payment may have succeeded but verification is pending. Do not pay again; refresh shortly.','note');}
    },
    modal:{ondismiss:()=>setStatus('Checkout closed. If you completed payment, wait for provider confirmation before retrying.','note')}
   });
   checkout.on('payment.failed',response=>{console.warn('Razorpay payment failed',response?.error?.code);setStatus('Payment was not completed. You can retry checkout.','error');});
   checkout.open();
  }catch(e){
   console.error('Razorpay checkout could not start',e);
   setStatus(e?.message||'Unable to start secure checkout. Please retry.','error');
  }finally{buttons.forEach(b=>b.disabled=false);}
 }
 async function activateFreePlan(id){
  if(!user){location.href='login.html';return;}
  if(!confirm('Activate this free plan now?'))return;
  try{
   const result=await supabaseClient.rpc('create_checkout_order',{p_plan_id:id,p_coupon_code:null});
   if(result.error)throw result.error;
   if(result.data?.status!=='free'){setStatus('Paid checkout is not configured yet. No paid order was started.','error');return;}
   setStatus('Free plan activated successfully.','success');await loadAccount();
  }catch(e){console.error(e);setStatus(e.message||'Unable to activate the free plan.','error');}
 }
 $('sub-logout').addEventListener('click',async()=>{try{await AuthManager.logout();location.href='index.html';}catch(e){setStatus(e.message||'Sign out failed.','error');}});
 try{await loadPlans();await loadAccount();if(!user)setStatus('Sign in to view your subscription details.','note');}
 catch(e){console.error('Subscription page load failed',e);setStatus(e.message||'Unable to load subscription details.','error');}
});