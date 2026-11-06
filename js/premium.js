window.initPremiumPurchase = async (root=document) => {
 if(root?.dataset?.premiumPurchaseInitialized==='1')return;
 if(root?.dataset)root.dataset.premiumPurchaseInitialized='1';
 const $=id=>root.querySelector('#'+id), client=(typeof supabaseClient !== 'undefined' ? supabaseClient : window.supabaseClient);
 if(!client){const grid=$('premium-plan-grid');if(grid)grid.innerHTML='<div class="sub-empty-card">Secure connection unavailable. Please refresh and try again.</div>';return;}
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=(minor,currency='INR')=>new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format(Number(minor||0)/100);
 const message=(text,error=false)=>{const el=$('premium-message');if(el){el.textContent=text;el.classList.toggle('is-error',error)}};
 const couponInput=$('premium-coupon-code'),couponApply=$('premium-coupon-apply'),couponNote=$('premium-coupon-note');
 couponApply?.addEventListener('click',()=>{const code=(couponInput?.value||'').trim().toUpperCase();if(!code){if(couponNote)couponNote.textContent='Enter a coupon code first.';return;}if(couponNote)couponNote.textContent='Coupon validation is not configured on the secure checkout service yet. No discount has been applied; plan prices remain unchanged.';});
 const state=$('premium-current-state'),grid=$('premium-plan-grid');
 const [authResult,planResult]=await Promise.all([
  client.auth.¶»§q«^