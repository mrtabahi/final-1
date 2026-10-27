document.addEventListener('DOMContentLoaded', async () => {
 const $=id=>document.getElementById(id), client=window.supabaseClient;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=(minor,currency='INR')=>new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format(Number(minor||0)/100);
 const message=(text,error=false)=>{const el=$('premium-message');if(el){el.textContent=text;el.classList.toggle('is-error',error)}};
 const {data:{user}}=await client.auth.getUser().catch(()=>({data:{user:null}}));
 const state=$('premium-current-state');
 if(user){
  const {data,error}=await client.from('user_subscriptions').select('status,starts_at,ends_at,subscription_plans(name,description)').eq('user_id',user.id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(error){state.textContent='Your membership details are temporarily unavailable. Open My Account and try again later.';}
  else if(data){const active=data.status==='active'&&(!data.ends_at||new Date(data.ends_at)>new Date());state.innerHTML='<strong>'+(active?'Membership active':'Membership '+esc(data.status||'pending'))+'</strong><br>'+esc(data.subscription_plans?.name||'Plan')+' · '+(data.starts_at?'Starts '+new Date(data.starts_at).toLocaleDateString():'Start date pending')+' · '+(data.ends_at?'Valid until '+new Date(data.ends_at).toLocaleDateString():'No expiry date recorded')+'<br><a href="my_account.html">View subscription details →</a>';}
  else state.innerHTML='<strong>No subscription found yet.</strong><br>Compare the plans below, or visit <a href="my_account.html">My Account</a> to review your profile.';
 }else{state.innerHTML='<strong>Not signed in.</strong><br><a href="login.html?redirect=premium.html">Sign in</a> to connect a plan to your account.';}
 const grid=$('premium-plan-grid');
 const {data:plans,error}=await client.from('subscription_plans').select('id,name,description,price_minor,currency,duration_days,tagline,features,is_featured').eq('is_active',true).order('sort_order').order('price_minor');
 if(error){grid.innerHTML='<div class="sub-empty-card">Plans are temporarily unavailable. Please refresh in a moment.</div>'; $('premium-plan-count').textContent='Unavailable';return;}
 $('premium-plan-count').textContent=(plans||[]).length+' plans';
 if(!plans?.length){grid.innerHTML='<div class="sub-empty-card">No plans are published right now. Please check back soon.</div>';return;}
 grid.innerHTML=plans.map(p=>'<article class="sub-plan-card '+(p.is_featured?'is-featured':'')+'">'+(p.is_featured?'<span class="sub-plan-ribbon">RECOMMENDED</span>':'')+'<span class="sub-eyebrow">PREPARATION PLAN</span><h3>'+esc(p.name)+'</h3><p class="sub-plan-tagline">'+esc(p.tagline||p.description||'A focused plan for your preparation.')+'</p><div class="sub-plan-price">'+money(p.price_minor,p.currency)+' <small>/ plan</small></div><div class="sub-plan-duration">'+Number(p.duration_days)+' days of access</div><hr class="sub-plan-divider"><ul class="sub-plan-features">'+((Array.isArray(p.features)&&p.features.length)?p.features:['Account-linked plan details','Clear membership validity','Support for access questions']).map(f=>'<li>'+esc(f)+'</li>').join('')+'</ul><button class="sub-btn '+(p.is_featured?'sub-btn-primary':'sub-btn-light')+'" data-choose-plan="'+p.id+'">Choose plan <span aria-hidden="true">→</span></button></article>').join('');
 grid.querySelectorAll('[data-choose-plan]').forEach(btn=>btn.addEventListener('click',async()=>{
  if(!user){window.location.href='login.html?redirect=premium.html';return;}
  btn.disabled=true;btn.textContent='Preparing secure checkout…';
  try{
   const {data,error}=await client.functions.invoke('create-checkout',{body:{plan_id:btn.dataset.choosePlan}});
   if(error)throw error;
   if(data?.checkout_url){window.location.href=data.checkout_url;return;}
   if(data?.url){window.location.href=data.url;return;}
   throw new Error(data?.message||'Secure checkout is not available yet. No payment has been taken.');
  }catch(err){console.error(err);message(err.message||'Checkout is temporarily unavailable. No payment has been taken.',true);btn.disabled=false;btn.innerHTML='Try again <span aria-hidden="true">→</span>';}
 }));
});