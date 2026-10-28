(() => {
  'use strict';
  const db=()=>window.supabaseClient;
  const norm=v=>String(v||'').trim().replace(/^\/+|\/+$/g,'').toLowerCase();
  const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let rules=[],premium=false,ready=false;
  function popup(message){
    let el=document.getElementById('feature-upgrade-modal');
    if(!el){el=document.createElement('div');el.id='feature-upgrade-modal';el.className='feature-upgrade-backdrop';el.innerHTML='<section class="feature-upgrade-dialog" role="dialog" aria-modal="true" aria-labelledby="feature-upgrade-title"><button type="button" class="feature-upgrade-close" aria-label="Close">×</button><div class="feature-upgrade-mark">✦</div><h2 id="feature-upgrade-title">Upgrade your plan</h2><p class="feature-upgrade-copy"></p><div class="feature-upgrade-actions"><a class="feature-upgrade-primary" href="premium.html">Explore plans</a><button type="button" class="feature-upgrade-secondary">Maybe later</button></div></section>';document.body.appendChild(el);el.querySelectorAll('.feature-upgrade-close,.feature-upgrade-secondary').forEach(b=>b.addEventListener('click',()=>el.classList.remove('is-open')));el.addEventListener('click',e=>{if(e.target===el)el.classList.remove('is-open')});}
    el.querySelector('.feature-upgrade-copy').textContent=message||'Upgrade your plan to unlock this content.';el.classList.add('is-open');
  }
  function findRule(type,key){return rules.find(r=>r.resource_type===type&&norm(r.resource_key)===norm(key));}
  function blocked(rule){if(!rule||rule.is_free||premium)return false;popup(rule.upgrade_message);return true;}
  async function init(){
    const client=db();if(!client)return;
    try{
      const [{data:{user}},rr]=await Promise.all([client.auth.getUser(),client.from('feature_access_rules').select('resource_type,resource_key,is_free,upgrade_message')]);
      rules=rr.error?[]:(rr.data||[]);
      if(user){const {data}=await client.from('user_subscriptions').select('status,starts_at,ends_at,subscription_plans(price_minor)').eq('user_id',user.id).eq('status','active').order('created_at',{ascending:false}).limit(10);premium=(data||[]).some(s=>(!s.starts_at||new Date(s.starts_at)<=new Date())&&(!s.ends_at||new Date(s.ends_at)>new Date())&&Number(s.subscription_plans?.price_minor||0)>0);}
      ready=true;
      const site=findRule('site','*')||findRule('site',location.pathname.split('/').pop()||'index.html');
      const requestedTest=new URLSearchParams(location.search).get('test');
      if(requestedTest){const testRule=findRule('test',requestedTest)||{is_free:false,upgrade_message:'Upgrade your plan to unlock this premium test.'};if(!testRule.is_free&&!premium){document.body.classList.add('feature-site-locked');document.body.insertAdjacentHTML('beforeend','<div class="feature-site-lock"><div class="feature-site-lock-card"><span class="feature-upgrade-mark">✦</span><h1>Upgrade your plan</h1><p>'+esc(testRule.upgrade_message)+'</p><a class="feature-upgrade-primary" href="premium.html">Explore plans</a></div></div>');return;}}
      if(site&&!site.is_free&&!premium&&!['premium.html','login.html','signup.html','my_account.html'].includes(location.pathname.split('/').pop())){document.body.classList.add('feature-site-locked');document.body.insertAdjacentHTML('beforeend','<div class="feature-site-lock"><div class="feature-site-lock-card"><span class="feature-upgrade-mark">✦</span><h1>Premium access required</h1><p>'+esc(site.upgrade_message)+'</p><a class="feature-upgrade-primary" href="premium.html">Explore plans</a></div></div>');return;}
    }catch(e){console.warn('Feature access check unavailable; no client-side lock applied.');}
  }
  document.addEventListener('click',e=>{
    const a=e.target.closest('a,button,[data-access-key]');if(!a||!ready)return;
    let rule=null;
    const custom=a.getAttribute('data-access-key');if(custom){const [type,...rest]=custom.split(':');rule=findRule(type,rest.join(':'));}
    const testId=a.getAttribute('data-test-id')||a.closest('[data-test-id]')?.getAttribute('data-test-id');
    const folderId=a.getAttribute('data-folder-id')||a.closest('[data-folder-id]')?.getAttribute('data-folder-id');
    if(!rule&&testId)rule=findRule('test',testId)||{is_free:false,upgrade_message:'Upgrade your plan to unlock this premium test.'};
    if(!rule&&folderId)rule=findRule('folder',folderId)||{is_free:false,upgrade_message:'Upgrade your plan to unlock this folder.'};
    if(!rule&&custom&&custom.startsWith('feature:'))rule=findRule('feature',custom.slice(8))||{is_free:false,upgrade_message:'Upgrade your plan to unlock this premium material.'};
    if(!rule&&a.matches('a[href]')){const href=a.getAttribute('href')||'';const file=norm(href.split(/[?#]/)[0].split('/').pop());rule=findRule('menu',file)||findRule('menu',norm(href));}
    if(rule&&!rule.is_free&&!premium){e.preventDefault();e.stopImmediatePropagation();popup(rule.upgrade_message);}
  },true);
  const css=document.createElement('style');css.textContent='.feature-upgrade-backdrop{display:none;position:fixed;inset:0;z-index:2147483000;background:rgba(12,22,45,.58);backdrop-filter:blur(5px);align-items:center;justify-content:center;padding:20px}.feature-upgrade-backdrop.is-open{display:flex}.feature-upgrade-dialog,.feature-site-lock-card{width:min(100%,420px);box-sizing:border-box;background:#fff;border:1px solid #e1e8f5;border-radius:22px;padding:30px;box-shadow:0 24px 80px rgba(9,25,55,.24);text-align:center;color:#17243b;position:relative}.feature-upgrade-close{position:absolute;right:13px;top:10px;border:0;background:#f1f5ff;border-radius:50%;width:32px;height:32px;font-size:22px;color:#52617b;cursor:pointer}.feature-upgrade-mark{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:15px;background:linear-gradient(135deg,#4f46e5,#8b5cf6);color:white;font-size:23px;box-shadow:0 8px 20px #4f46e533}.feature-upgrade-dialog h2,.feature-site-lock-card h1{font-size:1.45rem;margin:15px 0 8px}.feature-upgrade-copy,.feature-site-lock-card p{color:#64748b;line-height:1.65;margin:0 0 22px}.feature-upgrade-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}.feature-upgrade-primary,.feature-upgrade-secondary{display:inline-flex;align-items:center;justify-content:center;border-radius:11px;padding:12px 17px;font-weight:750;font-size:.92rem;text-decoration:none;cursor:pointer}.feature-upgrade-primary{background:linear-gradient(110deg,#2563eb,#4f46e5);color:white!important;border:0}.feature-upgrade-secondary{background:#f1f5f9;color:#334155;border:1px solid #dbe4f0}.feature-site-lock{position:fixed;inset:0;z-index:2147482000;display:grid;place-items:center;background:linear-gradient(135deg,#eef4ff,#f8faff);padding:20px}.feature-site-lock-card{width:min(100%,460px)}body.feature-site-locked{overflow:hidden}';document.head.appendChild(css);
  document.addEventListener('DOMContentLoaded',init);if(document.readyState!=='loading')init();
})();