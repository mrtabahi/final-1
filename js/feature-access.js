(() => {
  'use strict';
  const db=()=>window.supabaseClient||(typeof supabaseClient!=='undefined'?supabaseClient:null);
  const norm=v=>String(v||'').trim().replace(/^\/+|\/+$/g,'').toLowerCase();
  const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let rules=[],premium=false,ready=false,popupReturnFocus=null;
  function closePopup(){
    const el=document.getElementById('feature-upgrade-modal');
    if(!el||!el.classList.contains('is-open'))return;
    el.classList.remove('is-open');
    if(popupReturnFocus&&typeof popupReturnFocus.focus==='function')popupReturnFocus.focus({preventScroll:true});
    popupReturnFocus=null;
  }
  function popup(message){
    let el=document.getElementById('feature-upgrade-modal');
    if(!el){
      el=document.createElement('div');
      el.id='feature-upgrade-modal';
      el.className='feature-upgrade-backdrop';
      el.innerHTML='<section class="feature-upgrade-dialog" role="dialog" aria-modal="true" aria-labelledby="feature-upgrade-title" aria-describedby="feature-upgrade-copy"><button type="button" class="feature-upgrade-close" aria-label="Close upgrade dialog">×</button><div class="feature-upgrade-mark" aria-hidden="true">✦</div><h2 id="feature-upgrade-title">Upgrade your plan</h2><p class="feature-upgrade-copy" id="feature-upgrade-copy"></p><div class="feature-upgrade-actions"><a class="feature-upgrade-primary" href="premium.html">Explore plans</a><button type="button" class="feature-upgrade-secondary">Maybe later</button></div></section>';
      document.body.appendChild(el);
      el.querySelectorAll('.feature-upgrade-close,.feature-upgrade-secondary').forEach(button=>button.addEventListener('click',closePopup));
      el.addEventListener('click',event=>{if(event.target===el)closePopup();});
    }
    if(!el.classList.contains('is-open'))popupReturnFocus=document.activeElement;
    el.querySelector('.feature-upgrade-copy').textContent=message||'Upgrade your plan to unlock this content.';
    el.classList.add('is-open');
    el.querySelector('.feature-upgrade-close')?.focus({preventScroll:true});
  }
  document.addEventListener('keydown',event=>{
    const backdrop=document.getElementById('feature-upgrade-modal');
    if(!backdrop?.classList.contains('is-open'))return;
    if(event.key==='Escape'){event.preventDefault();closePopup();return;}
    if(event.key!=='Tab')return;
    const focusable=[...backdrop.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter(el=>el.getClientRects().length);
    if(!focusable.length){event.preventDefault();return;}
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  function findRule(type,key){return rules.find(r=>r.resource_type===type&&norm(r.resource_key)===norm(key));}
  function blocked(rule){if(!rule||rule.is_free||premium)return false;popup(rule.upgrade_message);return true;}
  async function init(){
    const client=db();if(!client)return;
    try{
      const [{data:{user}},rr]=await Promise.all([client.auth.getUser(),client.from('feature_access_rules').select('resource_type,resource_key,is_free,upgrade_message')]);
      rules=rr.error?[]:(rr.data||[]);
      if(user){const {data}=await client.from('user_subscriptions').select('status,starts_at,ends_at,subscription_plans(price_minor)').eq('user_id',user.id).eq('status','active').order('created_at',{ascending:false}).limit(10);premium=(data||[]).some(s=>(!s.starts_at||new Date(s.starts_at)<=new Date())&&(!s.ends_at||new Date(s.ends_at)>new Date())&&Number(s.subscription_plans?.price_minor||0)>0);}
      ready=true;
      applyPublicAccessLabels();
      // Several pages dynamically render large lists. Coalesce DOM updates so one
      // render burst triggers one label pass instead of repeated full-document scans.
      let labelRefreshTimer=null;
      const accessObserver=new MutationObserver(()=>{
        if(labelRefreshTimer!==null)clearTimeout(labelRefreshTimer);
        labelRefreshTimer=setTimeout(()=>{
          labelRefreshTimer=null;
          applyPublicAccessLabels();
        },100);
      });
      accessObserver.observe(document.body,{childList:true,subtree:true});
      const site=findRule('site',location.pathname.split('/').pop()||'index.html')||findRule('site','*');
      const requestedTest=new URLSearchParams(location.search).get('test');
      if(requestedTest){let testRule=findRule('test',requestedTest);if(!testRule){const {data:testMeta}=await client.from('tests').select('folder_id').eq('id',requestedTest).maybeSingle();if(testMeta?.folder_id)testRule=findRule('folder',testMeta.folder_id);}testRule=testRule||{is_free:false,upgrade_message:'Upgrade your plan to unlock this premium test.'};if(!testRule.is_free&&!premium){document.body.classList.add('feature-site-locked');document.body.insertAdjacentHTML('beforeend','<div class="feature-site-lock"><div class="feature-site-lock-card"><span class="feature-upgrade-mark">✦</span><h1>Upgrade your plan</h1><p>'+esc(testRule.upgrade_message)+'</p><a class="feature-upgrade-primary" href="premium.html">Explore plans</a></div></div>');return;}}
      const currentPage=norm(location.pathname.split('/').pop()||'index.html');
      const alwaysPublicPages=new Set(['login.html','signup.html','forgot.html','reset.html','verify.html','premium.html','my_account.html','terms-and-conditions.html','privacy-policy.html','shipping-policy.html','cancellation-and-refunds.html','contact-us.html']);
      if(site&&!site.is_free&&!premium&&!alwaysPublicPages.has(currentPage)){document.body.classList.add('feature-site-locked');document.body.insertAdjacentHTML('beforeend','<div class="feature-site-lock" role="region" aria-label="Premium access required"><div class="feature-site-lock-card"><span class="feature-upgrade-mark" aria-hidden="true">✦</span><h1>Premium access required</h1><p>'+esc(site.upgrade_message)+'</p><a class="feature-upgrade-primary" href="premium.html">Explore plans</a></div></div>');return;}
    }catch(e){console.warn('Feature access check unavailable; no client-side lock applied.');}
  }
  function applyPublicAccessLabels(){
    document.querySelectorAll('a[data-folder-id].category-card').forEach(card=>{
      const rule=findRule('folder',card.getAttribute('data-folder-id'));
      const label=card.querySelector('.category-foot>span:first-child');
      if(rule&&!rule.is_free&&!premium&&label&&label.textContent.trim()!=='UPGRADE ↗')label.innerHTML='UPGRADE <span aria-hidden="true">↗</span>';
    });
    document.querySelectorAll('.navbar a[href],.nav-links a[href],a[data-access-key^="feature:"]').forEach(a=>{
      const href=a.getAttribute('href')||'';
      const file=norm(href.split(/[?#]/)[0].split('/').pop());
      const custom=a.getAttribute('data-access-key');
      const customId=custom&&custom.startsWith('feature:')?custom.slice(8):null;
      const rule=(customId&&findRule('feature',customId))||findRule('menu',file)||findRule('menu',norm(href));
      if(rule&&!rule.is_free&&!premium){
        if(a.dataset.originalAccessLabel===undefined)a.dataset.originalAccessLabel=a.innerHTML;
        if(a.textContent.trim()!=='UPGRADE')a.textContent='UPGRADE';
        a.classList.add('feature-upgrade-button');
      }else if(a.dataset.originalAccessLabel!==undefined){
        a.innerHTML=a.dataset.originalAccessLabel;delete a.dataset.originalAccessLabel;a.classList.remove('feature-upgrade-button');
      }
    });
    document.querySelectorAll('[data-test-id]').forEach(card=>{
      const testId=card.getAttribute('data-test-id');const folderId=card.getAttribute('data-folder-id');
      const rule=findRule('test',testId)||findRule('folder',folderId);
      const link=card.querySelector('.test-start,[data-test-start],a[href*="start_test.html"]');
      if(!link)return;
      if(rule&&!rule.is_free&&!premium){if(link.textContent.trim()!=='UPGRADE'){link.dataset.originalLabel=link.innerHTML;link.textContent='UPGRADE';}link.classList.add('feature-upgrade-button');link.setAttribute('aria-label','Upgrade to access '+(card.querySelector('h2')?.textContent||'this test'));}
      else if(link.dataset.originalLabel){link.innerHTML=link.dataset.originalLabel;}
      else if(!link.dataset.originalLabel){link.dataset.originalLabel=link.innerHTML;}
    });
    document.querySelectorAll('a[href]').forEach(a=>{const href=a.getAttribute('href')||'';const file=norm(href.split(/[?#]/)[0].split('/').pop());const rule=findRule('menu',file)||findRule('menu',norm(href));if(rule&&!rule.is_free&&!premium&&/start_test\.html\?test=/i.test(href))return;});
  }
  document.addEventListener('click',e=>{
    const a=e.target.closest('a,button,[data-access-key]');if(!a||!ready)return;
    let rule=null;
    const custom=a.getAttribute('data-access-key');if(custom){const [type,...rest]=custom.split(':');rule=findRule(type,rest.join(':'));}
    const testId=a.getAttribute('data-test-id')||a.closest('[data-test-id]')?.getAttribute('data-test-id');
    const folderId=a.getAttribute('data-folder-id')||a.closest('[data-folder-id]')?.getAttribute('data-folder-id')||new URLSearchParams((a.getAttribute('href')||'').split('?')[1]||'').get('folder');
    if(!rule&&testId)rule=findRule('test',testId);
    if(!rule&&folderId)rule=findRule('folder',folderId);
    if(!rule&&testId)rule={is_free:false,upgrade_message:'Upgrade your plan to unlock this premium test.'};
    if(!rule&&folderId)rule={is_free:false,upgrade_message:'Upgrade your plan to unlock this folder.'};
    if(!rule&&custom&&custom.startsWith('feature:'))rule=findRule('feature',custom.slice(8))||{is_free:false,upgrade_message:'Upgrade your plan to unlock this premium material.'};
    if(!rule&&a.matches('a[href]')){const href=a.getAttribute('href')||'';const file=norm(href.split(/[?#]/)[0].split('/').pop());rule=findRule('menu',file)||findRule('menu',norm(href));}
    if(rule&&!rule.is_free&&!premium){e.preventDefault();e.stopImmediatePropagation();popup(rule.upgrade_message);}
  },true);
  const css=document.createElement('style');css.textContent='.feature-upgrade-backdrop{display:none;position:fixed;inset:0;z-index:2147483000;background:rgba(12,22,45,.58);backdrop-filter:blur(5px);align-items:center;justify-content:center;padding:20px}.feature-upgrade-backdrop.is-open{display:flex}.feature-upgrade-dialog,.feature-site-lock-card{width:min(100%,420px);box-sizing:border-box;background:#fff;border:1px solid #e1e8f5;border-radius:22px;padding:30px;box-shadow:0 24px 80px rgba(9,25,55,.24);text-align:center;color:#17243b;position:relative}.feature-upgrade-close{position:absolute;right:13px;top:10px;border:0;background:#f1f5ff;border-radius:50%;width:32px;height:32px;font-size:22px;color:#52617b;cursor:pointer}.feature-upgrade-mark{display:inline-grid;place-items:center;width:48px;height:48px;border-radius:15px;background:linear-gradient(135deg,#4f46e5,#8b5cf6);color:white;font-size:23px;box-shadow:0 8px 20px #4f46e533}.feature-upgrade-dialog h2,.feature-site-lock-card h1{font-size:1.45rem;margin:15px 0 8px}.feature-upgrade-copy,.feature-site-lock-card p{color:#64748b;line-height:1.65;margin:0 0 22px}.feature-upgrade-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}.feature-upgrade-button{background:#6d28d9!important;color:#fff!important;border-color:#6d28d9!important;font-weight:800!important}.feature-upgrade-primary,.feature-upgrade-secondary{display:inline-flex;align-items:center;justify-content:center;border-radius:11px;padding:12px 17px;font-weight:750;font-size:.92rem;text-decoration:none;cursor:pointer}.feature-upgrade-primary{background:linear-gradient(110deg,#2563eb,#4f46e5);color:white!important;border:0}.feature-upgrade-secondary{background:#f1f5f9;color:#334155;border:1px solid #dbe4f0}.feature-site-lock{position:fixed;inset:0;z-index:2147482000;display:grid;place-items:center;background:linear-gradient(135deg,#eef4ff,#f8faff);padding:20px}.feature-site-lock-card{width:min(100%,460px)}body.feature-site-locked{overflow:hidden}';document.head.appendChild(css);
  document.addEventListener('DOMContentLoaded',init);if(document.readyState!=='loading')init();
})();