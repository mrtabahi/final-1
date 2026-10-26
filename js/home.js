/* Public landing page: homepage stays open; tools require candidate login. */
(function(){
  const protectedTargets = new Set(['Typing_test.html','self-test.html','materials.html','my_results.html','leaderboard.html','my_account.html','dashboard.html','start_test.html']);
  function localTarget(url){return url.pathname.split('/').filter(Boolean).join('/') + url.search + url.hash;}
  function addHomeStyles(){document.body.classList.add('home-public');}
  function escapeText(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function prettyType(type){return ({offer:'Limited-time offer',notice:'Notice',announcement:'Announcement',event:'Upcoming event',maintenance:'Service update',featured:'Featured update'})[type]||'Update';}
  function activeNow(item,now){return item.is_active&&item.is_public&&(!item.starts_at||new Date(item.starts_at)<=now)&&(!item.ends_at||new Date(item.ends_at)>now);}
  function countdown(end){if(!end)return 'No end time';const ms=new Date(end).getTime()-Date.now();if(ms<=0)return 'Ended';const d=Math.floor(ms/86400000),h=Math.floor(ms%86400000/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);return (d?d+'d ':'')+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
  async function loadAnnouncements(){
    const nav=document.querySelector('.navbar');if(!nav||typeof supabaseClient==='undefined'||!supabaseClient)return;
    let result;try{result=await supabaseClient.from('site_announcements').select('id,title,body,image_url,content_type,theme,cta_label,cta_url,starts_at,ends_at,sort_order,is_active,is_public').eq('is_active',true).eq('is_public',true).order('sort_order',{ascending:true}).limit(20);}catch(e){return;}
    if(result?.error||!result?.data?.length)return;
    const now=new Date(),items=result.data.filter(x=>activeNow(x,now));if(!items.length)return;
    const wrap=document.createElement('section');wrap.className='home-announcements container';wrap.id='home-announcements';wrap.setAttribute('aria-label','Latest notices and offers');wrap.dataset.theme=items[0].theme||'aurora';
    wrap.innerHTML='<div class="home-announcement-kicker">✦ Decoding HCM • Updates & offers</div><div class="home-announcement-card" aria-live="polite"></div><div class="home-announcement-controls"><button type="button" data-prev aria-label="Previous update">‹</button><button type="button" data-next aria-label="Next update">›</button><div class="home-announcement-dots" aria-hidden="true"></div><span style="margin-left:auto;font-size:.75rem;color:#cbd5e1">Live updates</span></div>';
    nav.insertAdjacentElement('afterend',wrap);let current=0;
    const render=()=>{const item=items[current];wrap.dataset.theme=item.theme||'aurora';const cta=item.cta_label&&item.cta_url?'<a class="home-announcement-cta" href="'+escapeText(item.cta_url)+'" data-content-cta>'+escapeText(item.cta_label)+' ↗</a>':'';wrap.querySelector('.home-announcement-card').innerHTML=(item.image_url?'<div class="home-announcement-visual"><img src="'+escapeText(item.image_url)+'" alt="'+escapeText(item.title)+'" loading="lazy"></div>':'')+'<div class="home-announcement-copy"><span class="home-announcement-pill">✦ '+escapeText(prettyType(item.content_type))+'</span><h2>'+escapeText(item.title)+'</h2><p>'+escapeText(item.body)+'</p>'+cta+'<div class="home-announcement-meta">'+(item.ends_at?'<span>⏳ Ends in <strong class="home-announcement-countdown" data-end="'+escapeText(item.ends_at)+'">'+countdown(item.ends_at)+'</strong></span>':'')+(item.starts_at?'<span>✦ Starts '+escapeText(new Date(item.starts_at).toLocaleString())+'</span>':'')+'</div></div>';wrap.querySelector('.home-announcement-dots').innerHTML=items.map((_,i)=>'<span class="'+(i===current?'active':'')+'"></span>').join('');};
    wrap.querySelector('[data-prev]').addEventListener('click',()=>{current=(current+items.length-1)%items.length;render()});wrap.querySelector('[data-next]').addEventListener('click',()=>{current=(current+1)%items.length;render()});render();setInterval(()=>{const end=wrap.querySelector('[data-end]');if(end){const value=countdown(end.dataset.end);end.textContent=value;if(value==='Ended')loadAnnouncements();}},1000);
    wrap.addEventListener('click',async e=>{const a=e.target.closest('[data-content-cta]');if(!a)return;const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;if(protectedTargets.has(u.pathname.split('/').pop())){e.preventDefault();await navigateProtected(u);}});
  }
  let loginPromptTarget = null;
  let loginPromptBusy = false;
  function showLoginPrompt(url){
    loginPromptTarget = url;
    let modal = document.getElementById('home-login-prompt');
    if(!modal){
      const style = document.createElement('style');
      style.id = 'home-login-prompt-style';
      style.textContent = `
        #home-login-prompt{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,23,42,.62);backdrop-filter:blur(4px)}
        #home-login-prompt[hidden]{display:none!important}
        #home-login-prompt .login-prompt-card{width:min(100%,420px);background:#fff;color:#0f172a;border:1px solid #dbeafe;border-radius:16px;padding:25px;box-shadow:0 24px 70px rgba(15,23,42,.3);font-family:inherit}
        #home-login-prompt h2{font-size:1.2rem;color:#0f4c81;margin:0 0 10px}
        #home-login-prompt p{font-size:1rem;line-height:1.6;margin:0 0 22px}
        #home-login-prompt .login-prompt-actions{display:flex;gap:12px;justify-content:space-between}
        #home-login-prompt .login-prompt-actions button{flex:1;min-height:46px;border-radius:8px;border:1px solid #cbd5e1;font:600 1rem inherit;font-family:inherit;font-size:1rem;font-weight:700;cursor:pointer}
        #home-login-prompt .login-prompt-cancel{background:#f1f5f9;color:#334155}
        #home-login-prompt .login-prompt-ok{background:#2563eb;color:#fff;border-color:#2563eb}
        body.login-prompt-open{overflow:hidden}
        @media(max-width:480px){#home-login-prompt .login-prompt-card{padding:21px}#home-login-prompt .login-prompt-actions{gap:10px}}
      `;
      document.head.appendChild(style);
      modal = document.createElement('div');
      modal.id = 'home-login-prompt';
      modal.hidden = true;
      modal.setAttribute('role','presentation');
      modal.innerHTML = '<section class="login-prompt-card" role="dialog" aria-modal="true" aria-labelledby="home-login-prompt-title" aria-describedby="home-login-prompt-message"><h2 id="home-login-prompt-title">Login Required</h2><p id="home-login-prompt-message">Please login first then explore!</p><div class="login-prompt-actions"><button type="button" class="login-prompt-cancel" data-login-cancel>Cancel</button><button type="button" class="login-prompt-ok" data-login-ok>OK</button></div></section>';
      document.body.appendChild(modal);
      modal.querySelector('[data-login-cancel]').addEventListener('click',closeLoginPrompt);
      modal.querySelector('[data-login-ok]').addEventListener('click',()=>{
        const target = loginPromptTarget;
        closeLoginPrompt();
        if(target){location.href='login.html?redirect='+encodeURIComponent(localTarget(target));}
      });
      modal.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();closeLoginPrompt();}});
    }
    modal.hidden = false;
    document.body.classList.add('login-prompt-open');
    modal.querySelector('[data-login-cancel]').focus();
  }
  function closeLoginPrompt(){
    const modal=document.getElementById('home-login-prompt');
    if(modal)modal.hidden=true;
    document.body.classList.remove('login-prompt-open');
    loginPromptTarget=null;
    loginPromptBusy=false;
  }
  async function navigateProtected(url){
    if(loginPromptBusy)return;
    loginPromptBusy=true;
    let user=null;
    try{const r=await supabaseClient.auth.getUser();user=r.data?.user||null;}catch(_){}
    if(user){loginPromptBusy=false;location.href=localTarget(url);return;}
    loginPromptBusy=false;
    showLoginPrompt(url);
  }
  function wireProtectedNavigation(){
    document.addEventListener('click',async e=>{const a=e.target.closest('a[href]');if(!a)return;const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;if(!protectedTargets.has(u.pathname.split('/').pop()))return;e.preventDefault();await navigateProtected(u);});
  }
  document.addEventListener('DOMContentLoaded',()=>{addHomeStyles();wireProtectedNavigation();loadAnnouncements();});
})();