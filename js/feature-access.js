(() => {
  'use strict';
  const db=()=>window.supabaseClient||(typeof supabaseClient!=='undefined'?supabaseClient:null);
  const norm=v=>String(v||'').trim().replace(/^\/+|\/+$/g,'').toLowerCase();
  const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let rules=[],premium=false,ready=false,popupReturnFocus=null;
  // Hide protected page content until the access decision has completed.
  document.documentElement.classList.add('feature-access-pending');
  function closePopup(){
    const el=document.getElementById('feature-upgrade-modal');
    if(!el||!el.classList.contains('is-open'))return;
    el.classList.remove('is-open');
    if(popupReturnFocus&&typeof popupReturnFocus.focus==='function')popupReturnFocus.focus({preventScroll:true});
    popupReturnFocus=null;
  }
  function openPremiumDialog(){
    closePopup();
    // Use one shared in-page purchase modal. Never navigate to a separate Premium page.
    if(window.PremiumModal){window.PremiumModal.open().catch(()=>popup('Premium plans are temporarily unavailable. Please try again.'));return;}
    popup('Premium plans are loading. Please try again in a moment.');
  }
  function popup(message){
    let el=document.getElementById('feature-upgrade-modal');
    if(!el){
      el=document.createElement('div');
      el.id='feature-upgrade-modal';
      el.className='feature-upgrade-backdrop';
      el.innerHTML='<section class="feature-upgrade-dialog" role="dialog" aria-modal="true" aria-labelledby="feature-upgrade-title" aria-describedby="feature-upgrade-copy"><button type="button" class="feature-upgrade-close" aria-label="Close upgrade dialog">×</button><div class="feature-upgrade-mark" aria-hidden="true">✦</div><h2 id="feature-upgrade-title">Premium feature</h2><p class="feature-upgrade-copy" id="feature-upgrade-copy"></p><div class="feature-upgrade-actions"><button type="button" class="feature-upgrade-primary feature-upgrade-open-premium">View plans</button><button type="button" class="feature-upgrade-secondary">Cancel</button></div></section>';
      document.body.appendChild(el);
      el.querySelectorAll('.feature-upgrade-close,.feature-upgrade-secondary').forEach(button=>button.addEventListener('click',closePopup));
      el.querySelector('.feature-upgrade-open-premium').addEventListener('click',()=>{closePopup();openPremiumDialog();});
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
  function installAccessStyles(){
    if(document.getElementById('feature-access-ui-styles'))return;
    const style=document.createElement('style');style.id='feature-access-ui-styles';
    style.textContent=`
      .navbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
      .navbar .brand-container{flex:0 0 auto}
      .navbar .nav-links{display:flex;flex:1 1 100%;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px 18px;min-width:0;overflow:visible}
      .navbar .nav-links li{display:block;flex:0 0 auto}
      .navbar .nav-links a{display:inline-flex;align-items:center;gap:5px;white-space:normal}
      .feature-upgrade-badge{display:inline-flex;align-items:center;justify-content:center;margin-left:5px;padding:2px 6px;border-radius:999px;background:linear-gradient(100deg,#6b4df6,#c23acb);color:#fff;font-size:9px;font-weight:900;line-height:1.35;letter-spacing:.04em;white-space:nowrap;vertical-align:middle}
      .feature-upgrade-button{cursor:pointer}
      .feature-upgrade-backdrop{position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(24,31,55,.58);backdrop-filter:blur(8px)}
      .feature-upgrade-backdrop.is-open{display:flex}
      .feature-upgrade-dialog{position:relative;width:min(100%,460px);padding:30px;border:1px solid #d9d8ff;border-radius:26px;background:linear-gradient(145deg,#fff,#f8f5ff);box-shadow:0 30px 90px #10152b55;color:#202a42;text-align:center}
      .feature-upgrade-close{position:absolute;right:12px;top:10px;width:36px;height:36px;border:0;border-radius:50%;background:#efedff;color:#4c3cc9;font-size:25px;cursor:pointer}
      .feature-upgrade-mark{display:grid;place-items:center;width:52px;height:52px;margin:0 auto 14px;border-radius:17px;background:linear-gradient(135deg,#ffbf35,#f38b08);color:#fff;font-size:25px}
      .feature-upgrade-dialog h2{margin:0 0 10px;color:#28304b}
      .feature-upgrade-copy{color:#526079;line-height:1.6}
      .feature-upgrade-actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:22px}
      .feature-upgrade-primary,.feature-upgrade-secondary{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:10px 17px;border-radius:999px;font:inherit;font-weight:800;cursor:pointer;text-decoration:none}
      .feature-upgrade-primary{border:0;background:linear-gradient(100deg,#5d4af4,#c039c8);color:#fff}
      .feature-upgrade-secondary{border:1px solid #d9dcef;background:#fff;color:#46516a}
      .feature-paid-teaser{display:grid;justify-items:start;gap:8px;padding:18px;border:1px solid #ddd6fe;border-radius:16px;background:linear-gradient(120deg,#fff,#faf5ff);color:#26324a}
      .feature-paid-kicker{font-size:.7rem;font-weight:900;letter-spacing:.1em;color:#7048d8}
      .feature-paid-teaser strong{font-size:1.05rem}.feature-paid-teaser p{margin:0;color:#536078}
      .feature-paid-teaser button{border:0;border-radius:999px;padding:8px 14px;background:linear-gradient(100deg,#5d4af4,#c039c8);color:#fff;font-weight:900}
      html.feature-access-pending body>*:not(script):not(style){visibility:hidden!important}\n      html.feature-access-pending body:after{content:'Checking access…';position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:#f8f7ff;color:#34415c;font-weight:800}\n      body.feature-site-locked>*:not(.feature-site-lock):not(script):not(style){visibility:hidden}
      body.feature-site-locked .feature-site-lock{visibility:visible;position:fixed;inset:0;z-index:2147482000;display:grid;place-items:center;padding:20px;background:#f8f7ff}
      .feature-site-lock-card{width:min(100%,480px);padding:32px;border:1px solid #d7d5ff;border-radius:26px;background:#fff;box-shadow:0 24px 70px #25244a20;text-align:center;color:#25314a}
      @media(max-width:760px){.navbar .nav-links{justify-content:flex-start;gap:9px 13px}.feature-upgrade-dialog{padding:26px 20px}}
    `;
    style.textContent+=\n      '.premium-global-backdrop{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(7,15,32,.72);backdrop-filter:blur(9px)}'+\n      '.premium-global-dialog{position:relative;width:min(1120px,100%);max-height:calc(100dvh - 36px);overflow:auto;border:1px solid #d7e0ef;border-radius:24px;background:#101f3b;color:#fff;box-shadow:0 30px 100px #0008}'+\n      '.premium-global-dialog .premium-modal-shell{width:100%;max-width:none;margin:0;padding:24px}'+\n      '.premium-global-dialog .premium-modal{min-height:0!important;display:block!important;padding:26px!important;border:1px solid #344767!important;border-radius:18px!important;background:linear-gradient(145deg,#172b4e,#0d1a31)!important;box-shadow:none!important;color:#fff}'+\n      '.premium-global-dialog .premium-modal-grid{grid-template-columns:1fr!important;gap:18px!important}'+\n      '.premium-global-dialog .premium-left{display:none!important}'+\n      '.premium-global-dialog .premium-right .sub-plan-grid{grid-template-columns:repeat(auto-fit,minmax(190px,1fr))!important;gap:12px!important}'+\n      '.premium-global-dialog .sub-plan-card{background:#fff!important;color:#152440!important;border:1px solid #d8e0ee!important;border-radius:16px!important;padding:18px!important;min-height:0!important}'+\n      '.premium-global-dialog .sub-plan-card h3,.premium-global-dialog .sub-plan-price{color:#152440!important}'+\n      '.premium-global-dialog .sub-plan-tagline{display:none!important}'+\n      '.premium-global-dialog .sub-plan-ribbon{background:#f5bd42!important;color:#172747!important}'+\n      '.premium-global-dialog .sub-btn-primary{background:#f5bd42!important;color:#172747!important;box-shadow:none!important}'+\n      '.premium-global-dialog .sub-btn-light{border:1px solid #29446c!important;color:#1b3154!important}'+\n      '.premium-global-dialog .premium-coupon{background:#132747!important;border-color:#405474!important}'+\n      '.premium-global-dialog .premium-coupon label{color:#fff!important}'+\n      '.premium-global-dialog .premium-coupon-note{color:#c2cde0!important}'+\n      '.premium-global-dialog .premium-coupon button{background:#f5bd42!important;color:#172747!important}'+\n      '.premium-global-dialog #premium-message{color:#f6d27b!important}'+\n      '.premium-global-close{position:sticky;float:right;top:10px;margin:10px 12px -48px 0;z-index:5;width:38px;height:38px;border:1px solid #61718a;border-radius:50%;background:#f5bd42;color:#172747;font-size:25px;cursor:pointer}'+\n      '@media(max-width:600px){.premium-global-backdrop{padding:7px}.premium-global-dialog{max-height:calc(100dvh - 14px);border-radius:16px}.premium-global-dialog .premium-modal-shell{padding:12px}.premium-global-dialog .premium-modal{padding:16px!important}.premium-global-dialog .premium-right .sub-plan-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.premium-global-dialog .sub-plan-card{padding:13px!important}.premium-global-dialog .sub-plan-price{font-size:1.55rem!important}}';\n    document.head.appendChild(style);
  }
  installAccessStyles();
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
      document.documentElement.classList.remove('feature-access-pending');
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
      if(requestedTest){let testRule=findRule('test',requestedTest);if(!testRule){const {data:testMeta}=await client.from('tests').select('folder_id').eq('id',requestedTest).maybeSingle();if(testMeta?.folder_id)testRule=findRule('folder',testMeta.folder_id);}if(testRule&&!testRule.is_free&&!premium){document.body.classList.add('feature-site-locked');document.body.insertAdjacentHTML('beforeend','<div class="feature-site-lock"><div class="feature-site-lock-card"><span class="feature-upgrade-mark">✦</span><h1>Upgrade your plan</h1><p>'+esc(testRule.upgrade_message)+'</p><a class="feature-upgrade-primary" href="premium.html">Explore plans</a></div></div>');return;}}
      const currentPage=norm(location.pathname.split('/').pop()||'index.html');
      const alwaysPublicPages=new Set(['login.html','signup.html','forgot.html','reset.html','verify.html','premium.html','my_account.html','terms-and-conditions.html','privacy-policy.html','shipping-policy.html','cancellation-and-refunds.html','contact-us.html']);
      const pageFeatureKey=({'fix-accuracy.html':'typing-game','self-test.html':'self-test','materials.html':'pdf-library','start_test.html':'typing-interface','dashboard.html':'setup-box','typing_test.html':'typing-formats'}[currentPage]);
      const pageRule=findRule('menu',currentPage)||findRule('menu','/'+currentPage)||(pageFeatureKey&&findRule('feature',pageFeatureKey));
      const effectivePageRule=pageRule||site;
      if(effectivePageRule&&!effectivePageRule.is_free&&!premium&&!alwaysPublicPages.has(currentPage)){document.body.classList.add('feature-site-locked');document.body.insertAdjacentHTML('beforeend','<div class="feature-site-lock" role="region" aria-label="Premium access required"><div class="feature-site-lock-card"><span class="feature-upgrade-mark" aria-hidden="true">✦</span><h1>Premium access required</h1><p>'+esc(effectivePageRule.upgrade_message)+'</p><a class="feature-upgrade-primary" href="premium.html">Explore plans</a></div></div>');return;}
    }catch(e){console.error('Feature access verification failed; protected content remains hidden.',e);document.documentElement.classList.remove('feature-access-pending');document.body.classList.add('feature-site-locked');document.body.insertAdjacentHTML('beforeend','<div class="feature-site-lock"><div class="feature-site-lock-card"><span class="feature-upgrade-mark">✦</span><h1>Access check unavailable</h1><p>We could not verify your access. Please refresh or sign in again. Paid content remains locked until access is verified.</p><a class="feature-upgrade-primary" href="premium.html">View Premium Pass</a></div></div>');}
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
      const featureKey=({'fix-accuracy.html':'typing-game','self-test.html':'self-test','materials.html':'pdf-library','start_test.html':'typing-interface','dashboard.html':'setup-box','typing_test.html':'typing-formats'}[file]);
      const rule=(customId&&findRule('feature',customId))||(featureKey&&findRule('feature',featureKey))||findRule('menu',file)||findRule('menu',norm(href));
      let badge=a.querySelector(':scope > .feature-upgrade-badge');
      if(rule&&!rule.is_free&&!premium){
        if(!badge){badge=document.createElement('span');badge.className='feature-upgrade-badge';badge.textContent='UPGRADE';badge.setAttribute('aria-label','Premium feature');a.appendChild(badge);}
        a.classList.add('feature-upgrade-button');
      }else{badge?.remove();a.classList.remove('feature-upgrade-button');}
    });
    document.querySelectorAll('[data-test-id]').forEach(card=>{
      const testId=card.getAttribute('data-test-id');const folderId=card.getAttribute('data-folder-id');
      const rule=findRule('test',testId)||findRule('folder',folderId);
      if(rule&&!rule.is_free&&!premium){
        if(!card.dataset.paidPreviewHidden){
          card.dataset.originalPaidMarkup=card.innerHTML;card.dataset.paidPreviewHidden='true';
          card.innerHTML='<div class="feature-paid-teaser"><span class="feature-paid-kicker">PREMIUM ACCESS</span><strong>Locked test</strong><p>Upgrade your pass to unlock this test.</p><button type="button" class="feature-upgrade-button">UPGRADE</button></div>';
        }
        card.classList.add('feature-content-locked');
      }else{
        card.classList.remove('feature-content-locked');
        if(card.dataset.paidPreviewHidden&&card.dataset.originalPaidMarkup){card.innerHTML=card.dataset.originalPaidMarkup;delete card.dataset.originalPaidMarkup;delete card.dataset.paidPreviewHidden;}
      }
    });
    document.querySelectorAll('a[href]').forEach(a=>{const href=a.getAttribute('href')||'';const file=norm(href.split(/[?#]/)[0].split('/').pop());const rule=findRule('menu',file)||findRule('menu',norm(href));if(rule&&!rule.is_free&&!premium&&/start_test\.html\?test=/i.test(href))return;});
  }
  document.addEventListener('click',e=>{
    const a=e.target.closest('a,button,[data-access-key]');if(!a)return;
    if(a.matches('a[href]')){
      const destination=new URL(a.href,location.href);
      if(destination.origin===location.origin&&norm(destination.pathname.split('/').pop())==='premium.html'&&norm(location.pathname.split('/').pop())!=='premium.html'){
        e.preventDefault();e.stopImmediatePropagation();openPremiumDialog();return;
      }
    }
    if(!ready)return;
    let rule=null;
    const custom=a.getAttribute('data-access-key');if(custom){const [type,...rest]=custom.split(':');rule=findRule(type,rest.join(':'));}
    const testId=a.getAttribute('data-test-id')||a.closest('[data-test-id]')?.getAttribute('data-test-id');
    const folderId=a.getAttribute('data-folder-id')||a.closest('[data-folder-id]')?.getAttribute('data-folder-id')||new URLSearchParams((a.getAttribute('href')||'').split('?')[1]||'').get('folder');
    if(!rule&&testId)rule=findRule('test',testId);
    if(!rule&&folderId)rule=findRule('folder',folderId);
    if(!rule&&custom&&custom.startsWith('feature:'))rule=findRule('feature',custom.slice(8));
    if(!rule&&a.matches('a[href]')){const href=a.getAttribute('href')||'';const file=norm(href.split(/[?#]/)[0].split('/').pop());const featureKey=({'fix-accuracy.html':'typing-game','self-test.html':'self-test','materials.html':'pdf-library','start_test.html':'typing-interface','dashboard.html':'setup-box','typing_test.html':'typing-formats'}[file]);rule=(featureKey&&findRule('feature',featureKey))||findRule('menu',file)||findRule('menu',norm(href));}
    if(rule&&!rule.is_free&&!premium){e.preventDefault();e.stopImmediatePropagation();popup(rule.upgrade_message);}
  },true);
  document.addEventListener('DOMContentLoaded',init);if(document.readyState!=='loading')init();
})();