document.addEventListener('DOMContentLoaded', async () => {
 const root=document.getElementById('account-membership-state'), details=document.getElementById('account-membership-details');
 const db=(typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient); if(!root||!details||!db)return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=(minor,currency='INR')=>new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format(Number(minor||0)/100);
 const date=v=>v?new Date(v).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'No expiry recorded';
 try{
  const {data:{user}}=await db.auth.getUser();
  if(!user){root.innerHTML='<strong>Sign in to see your membership.</strong> <a href="login.html?redirect=my_account.html">Sign in →</a>';return;}
  const [subs,orders]=await Promise.all([
   db.from('user_subscriptions').select('status,starts_at,ends_at,subscription_plans(name)').eq('user_id',user.id).order('created_at',{ascending:false}).limit(10),
   db.from('orders').select('status,total_minor,currency,created_at,subscription_plans(name)').eq('user_id',user.id).order('created_at',{ascending:false}).limit(20)
  ]);
  if(subs.error)throw subs.error;
  const rows=subs.data||[], now=Date.now();
  const current=rows.find(s=>s.status==='active'&&(!s.ends_at||new Date(s.ends_at).getTime()>now));
  const paid=(orders.data||[]).find(o=>o.status==='paid');
  root.innerHTML=current
   ?'<strong>Membership active</strong><br><span>'+esc(current.subscription_plans?.name||'Premium plan')+'</span><br>Valid until '+date(current.ends_at)
   :'<strong>No active membership</strong><br>Choose a plan to unlock premium preparation tools.';
  details.innerHTML='<div class="account-membership-summary account-membership-summary-clean">'+
   '<article><small>YOUR PLAN</small><strong>'+esc(current?.subscription_plans?.name||'Free plan')+'</strong><span class="sub-account-status '+(current?'is-active':'')+'">'+(current?'Active':'Not active')+'</span></article>'+
   '<article><small>ACCESS UNTIL</small><strong>'+date(current?.ends_at)+'</strong><span>Membership validity</span></article>'+
   '<article><small>LAST SUCCESSFUL PAYMENT</small><strong>'+(paid?money(paid.total_minor,paid.currency||'INR'):'—')+'</strong><span>'+(paid?date(paid.created_at):'No completed payment found')+'</span></article></div>';
 }catch(error){console.error('Membership details error:',error);root.innerHTML='<strong>Membership details could not be loaded.</strong><br>Refresh the page in a moment. Your profile and sign-in controls are unaffected.';details.innerHTML='';}
});