window.initPremiumPurchase = async (root=document) => {
 if(root?.dataset?.premiumPurchaseInitialized==='1')return;
 if(root?.dataset)root.dataset.premiumPurchaseInitialized='1';
 const $=id=>root.querySelector('#'+id), client=(typeof supabaseClient !== 'undefined' ? supabaseClient : window.supabaseClient);
 if(!client){const grid=$('premium-plan-grid');if(grid)grid.innerHTML='<div class="sub-empty-card">Secure connection unavailable. Please refresh and try again.</div>';return;}
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=(minor,currency='INR')=>new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format(Number(minor||0)/100);
 const message=(text,error=false)=>{const el=$('premium-message');if(el){el.textContent=text;el.classList.toggle('is-error',error)}};
 const couponInput=$('premium-coupon-code'),couponApply=$('premium-coupon-apply'),couponNote=$('premium-coupon-note');
 let appliedCouponCode='';
 let user=null;
 let plans=[];
 let couponPreviewByPlan=new Map();
 let couponRequestSequence=0;
 const couponCodePattern=/^[A-Z0-9][A-Z0-9_-]{2,39}$/;
 const resetCouponState=()=>{
  appliedCouponCode='';
  couponPreviewByPlan.clear();
  couponRequestSequence++;
  if(couponApply){couponApply.disabled=false;couponApply.textContent='Apply';}
  if(couponNote)couponNote.textContent='Enter a coupon and apply it to check eligible plans securely.';
  renderCouponPrices();
 };
 couponInput?.addEventListener('input',resetCouponState);
 couponApply?.addEventListener('click',async()=>{
  const code=(couponInput?.value||'').trim().toUpperCase();
  resetCouponState();
  if(!couponCodePattern.test(code)){if(couponNote)couponNote.textContent='Invalid coupon format. Use 3–40 letters, numbers, hyphens or underscores.';return;}
  if(!user){if(couponNote)couponNote.textContent='Please sign in before applying a coupon.';return;}
  if(!plans.length){if(couponNote)couponNote.textContent='Plans are still loading. Please try again.';return;}
  const requestId=++couponRequestSequence;
  if(couponApply){couponApply.disabled=true;couponApply.textContent='Checking…';}
  if(couponNote)couponNote.textContent='Verifying coupon securely for each available plan…';
  const checks=await Promise.all(plans.map(async plan=>{
   try{
    const {data,error}=await client.rpc('preview_subscription_coupon',{p_plan_id:plan.id,p_coupon_code:code});
    if(error)throw error;
    if(!data||data.valid!==true)throw new Error('Coupon could not be verified for this plan.');
    const subtotal=Number(data.subtotal_minor),discount=Number(data.discount_minor),total=Number(data.total_minor);
    if(!Number.isSafeInteger(subtotal)||!Number.isSafeInteger(discount)||!Number.isSafeInteger(total)||discount<0||total<0||subtotal-discount!==total)throw new Error('Coupon preview returned an invalid amount.');
    if(total>0&&total<100)throw new Error('This coupon leaves less than ₹1 to pay. Razorpay requires a minimum payment of ₹1.');
    return {planId:plan.id,data};
   }catch(error){return {planId:plan.id,error:error?.message||'Coupon is not valid for this plan.'};}
  }));
  if(requestId!==couponRequestSequence)return;
  const valid=checks.filter(item=>item.data);
  if(!valid.length){
   const reason=checks.find(item=>item.error)?.error||'This coupon is invalid, inactive, expired, or not eligible for these plans.';
   if(couponNote)couponNote.textContent=reason;
   if(couponApply){couponApply.disabled=false;couponApply.textContent='Apply';}
   return;
  }
  appliedCouponCode=code;
  couponPreviewByPlan=new Map(valid.map(item=>[item.planId,item.data]));
  renderCouponPrices();
  const saved=valid.reduce((sum,item)=>sum+Number(item.data.discount_minor||0),0);
  const planNames=valid.map(item=>plans.find(p=>p.id===item.planId)?.name).filter(Boolean);
  if(couponNote)couponNote.textContent='✓ '+code+' applied to '+valid.length+' eligible plan(s)'+(planNames.length?' ('+planNames.join(', ')+')':'')+'. Discounted prices are highlighted below; other plans are not eligible.';
  if(couponApply){couponApply.disabled=false;couponApply.textContent='Applied ✓';}
 });
 const state=$('premium-current-state'),grid=$('premium-plan-grid');
 const [authResult,planResult]=await Promise.all([
  client.auth.getUser().catch(()=>({data:{user:null}})),
  client.from('subscription_plans').select('id,name,description,price_minor,currency,duration_days,tagline,features,is_featured,expiry_mode,fixed_expiry_date,purchase_limit_total,purchase_limit_per_user').eq('is_active',true).order('sort_order').order('price_minor')
 ]);
 user=authResult?.data?.user||null;
 if(user){
  const {data,error}=await client.from('user_subscriptions').select('status,starts_at,ends_at,subscription_plans(name,description)').eq('user_id',user.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(error){state.textContent='Your membership details are temporarily unavailable. Open My Account and try again later.';}
  else if(data){const active=data.status==='active'&&(!data.ends_at||new Date(data.ends_at)>new Date());state.innerHTML='<strong>'+(active?'Membership active':'Membership '+esc(data.status||'pending'))+'</strong><br>'+esc(data.subscription_plans?.name||'Plan')+' · '+(data.starts_at?'Starts '+new Date(data.starts_at).toLocaleDateString():'Start date pending')+' · '+(data.ends_at?'Valid until '+new Date(data.ends_at).toLocaleDateString():'No expiry date recorded')+'<br><a href="my_account.html">View subscription details →</a>';}
  else state.innerHTML='<strong>No subscription found yet.</strong><br>Compare the plans below, or visit <a href="my_account.html">My Account</a> to review your profile.';
 }else{state.innerHTML='<strong>Not signed in.</strong><br><a href="login.html?redirect=premium.html">Sign in</a> to connect a plan to your account.';}
 const {data:loadedPlans,error}=planResult;
 if(error){grid.innerHTML='<div class="sub-empty-card">Plans are temporarily unavailable. Please refresh in a moment.</div>'; $('premium-plan-count').textContent='Unavailable';return;}
 const todayIst=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});
 plans=(loadedPlans||[]).filter(p=>p.expiry_mode!=='fixed_date'||(p.fixed_expiry_date&&p.fixed_expiry_date>=todayIst));
 $('premium-plan-count').textContent=plans.length+' plans';
 if(!plans?.length){grid.innerHTML='<div class="sub-empty-card">No plans are published right now. Please check back soon.</div>';return;}
 grid.innerHTML=plans.map(p=>'<article class="sub-plan-card '+(p.is_featured?'is-featured':'')+'">'+(p.is_featured?'<span class="sub-plan-ribbon">RECOMMENDED</span>':'')+'<span class="sub-eyebrow">PREPARATION PLAN</span><h3>'+esc(p.name)+'</h3><div class="sub-plan-price" data-plan-price="'+p.id+'">'+money(p.price_minor,p.currency)+' <small>/ plan</small></div><div class="sub-plan-duration">'+(p.expiry_mode==='fixed_date'&&p.fixed_expiry_date?'Access until '+new Date(p.fixed_expiry_date+'T12:00:00+05:30').toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}):Number(p.duration_days)+' days from purchase')+'</div>'+(p.purchase_limit_total||p.purchase_limit_per_user?'<div class="sub-plan-limits">'+(p.purchase_limit_total?'Limited to '+Number(p.purchase_limit_total).toLocaleString('en-IN')+' total purchases':'No overall purchase cap')+(p.purchase_limit_per_user?' · Max '+p.purchase_limit_per_user+' per account':' · Unlimited per account')+'</div>':'')+'<hr class="sub-plan-divider"><ul class="sub-plan-features">'+((Array.isArray(p.features)&&p.features.length)?p.features:['Account-linked plan details','Clear membership validity','Support for access questions']).map(f=>'<li>'+esc(f)+'</li>').join('')+'</ul><button class="sub-btn '+(p.is_featured?'sub-btn-primary':'sub-btn-light')+'" data-choose-plan="'+p.id+'">Choose plan <span aria-hidden="true">→</span></button></article>').join('');
 
 function renderCouponPrices(){
  if(!grid)return;
  plans.forEach(plan=>{
   const card=grid.querySelector('[data-plan-price="'+plan.id+'"]')?.closest('.sub-plan-card');
   const price=card?.querySelector('[data-plan-price]');
   if(!card||!price)return;
   const preview=couponPreviewByPlan.get(plan.id);
   card.classList.toggle('has-coupon-discount',!!preview&&Number(preview.discount_minor)>0);
   card.classList.toggle('coupon-not-eligible',!!appliedCouponCode&&!preview);
   const base=money(plan.price_minor,plan.currency);
   if(preview&&Number(preview.discount_minor)>0){
    price.innerHTML='<span class="sub-price-original">'+base+'</span><strong class="sub-price-discounted">'+money(preview.total_minor,preview.currency||plan.currency)+'</strong><small>/ plan</small><span class="sub-coupon-saved">You save '+money(preview.discount_minor,preview.currency||plan.currency)+'</span>';
    price.classList.remove('coupon-price-flash');
    void price.offsetWidth;
    price.classList.add('coupon-price-flash');
   }else{
    price.innerHTML=base+' <small>/ plan</small>';
   }
   let note=card.querySelector('.sub-coupon-plan-note');
   if(appliedCouponCode&&!preview){
    if(!note){note=document.createElement('p');note.className='sub-coupon-plan-note';price.insertAdjacentElement('afterend',note);}
    note.textContent='This coupon is not valid for this plan.';
   }else if(note)note.remove();
  });
 }

 async function checkPendingOrder(btn){
  const orderId=btn.dataset.pendingOrderId;
  if(!orderId)return false;
  btn.disabled=true;btn.textContent='Checking payment status…';
  try{
   const {data:order,error}=await client.from('orders').select('id,status,expires_at').eq('id',orderId).maybeSingle();
   if(error)throw error;
   if(!order)throw new Error('Checkout status is not available. Open My Account before trying another payment.');
   if(['paid','free'].includes(order.status)){
    message('Payment is confirmed. Opening your membership details…');
    window.location.href='my_account.html?subscription=updated';return true;
   }
   if(['refund_required','refund_pending','refunded','partially_refunded'].includes(order.status)){
    message('This payment is in refund handling. Do not start another payment. Contact support if you need help.',true);
    btn.disabled=false;btn.textContent='Check payment status';return true;
   }
   if(['failed','expired','cancelled'].includes(order.status)||(order.status==='pending'&&order.expires_at&&new Date(order.expires_at).getTime()<=Date.now())){
    delete btn.dataset.pendingOrderId;
    btn.disabled=false;btn.innerHTML='Try again <span aria-hidden="true">→</span>';
    message('The previous checkout has ended. You can safely start a new checkout now.');
    return true;
   }
   message('Payment is not confirmed yet. Please do not pay again; check the status again shortly.',true);
   btn.disabled=false;btn.textContent='Check payment status';return true;
  }catch(err){
   console.error(err);message(err.message||'Could not check payment status. Please open My Account and do not pay again yet.',true);
   btn.disabled=false;btn.textContent='Check payment status';return true;
  }
 }
 grid.querySelectorAll('[data-choose-plan]').forEach(btn=>btn.addEventListener('click',async()=>{
  if(!user){window.location.href='login.html?redirect=premium.html';return;}
  if(btn.dataset.pendingOrderId){await checkPendingOrder(btn);return;}
  const planId=btn.dataset.choosePlan;
  if(appliedCouponCode&&!couponPreviewByPlan.has(planId)){
   message('This coupon is not valid for the selected plan. Choose an eligible plan or remove the coupon.',true);
   return;
  }
  btn.disabled=true;btn.textContent='Preparing secure checkout…';
  try{
   const {data,error}=await client.functions.invoke('create-checkout',{body:{plan_id:planId,...(appliedCouponCode?{coupon_code:appliedCouponCode}:{})}});
   if(error)throw error;
   if(data?.mode==='free'){
    const order=data.order||{};
    if(order.discount_minor>0&&couponNote)couponNote.textContent='Coupon '+(order.coupon_code||appliedCouponCode)+' saved you '+money(order.discount_minor,order.currency||'INR')+'.';
    message(order.discount_minor>0?'Coupon applied. Your plan is active. Opening your membership details…':'Your free plan has been activated. Opening your membership details…');
    window.location.href='my_account.html?subscription=updated';return;
   }
   if(data?.mode==='razorpay'&&data.key_id&&data.razorpay_order_id&&data.local_order_id){
    btn.dataset.pendingOrderId=data.local_order_id;
    if(Number(data.discount_minor)>0&&couponNote)couponNote.textContent='Coupon '+(data.coupon_code||appliedCouponCode)+' applied · You save '+money(data.discount_minor,data.currency||'INR')+'.';
    await new Promise((resolve,reject)=>{
     if(window.Razorpay){resolve();return;}
     const script=document.createElement('script');script.src='https://checkout.razorpay.com/v1/checkout.js';
     script.onload=resolve;script.onerror=()=>reject(new Error('Secure payment window could not load. No payment was started.'));
     document.head.appendChild(script);
    });
    const checkout=new window.Razorpay({
     key:data.key_id,amount:Number(data.amount),currency:data.currency||'INR',name:'Decoding HCM',
     description:data.plan_name||'Preparation plan',order_id:data.razorpay_order_id,
     prefill:{name:data.customer?.name||'',email:data.customer?.email||''},
     theme:{color:'#2563eb'},
     handler:async response=>{
      message('Payment submitted. Verifying it securely before activating access…');
      try{
       const verified=await client.functions.invoke('verify-razorpay-payment',{body:{
        local_order_id:data.local_order_id,razorpay_order_id:response.razorpay_order_id,
        razorpay_payment_id:response.razorpay_payment_id,razorpay_signature:response.razorpay_signature
       }});
       if(verified.error)throw verified.error;
       if(!verified.data?.success)throw new Error(verified.data?.error||'Payment verification is pending. Please do not pay again; check My Account shortly.');
       message('Payment verified and membership updated. Opening My Account…');
       window.location.href='my_account.html?subscription=updated';
      }catch(err){console.error(err);message(err.message||'Payment verification is pending. Please do not pay again; check the payment status shortly.',true);btn.disabled=false;btn.textContent='Check payment status';}
     },
     modal:{ondismiss:()=>{btn.disabled=false;btn.textContent='Check payment status';message('Checkout closed. Check the existing order status before starting another payment.');}}
    });
    checkout.on('payment.failed',()=>{message('Payment was not confirmed. Check this order status before trying another payment.',true);btn.disabled=false;btn.textContent='Check payment status';});
    checkout.open();return;
   }
   throw new Error(data?.error||data?.message||'Secure checkout is not available yet. No payment has been taken.');
  }catch(err){console.error(err);message(err.message||'Checkout is temporarily unavailable. No payment has been taken.',true);btn.disabled=false;if(btn.dataset.pendingOrderId)btn.textContent='Check payment status';else btn.innerHTML='Try again <span aria-hidden="true">→</span>';}
 }));
};