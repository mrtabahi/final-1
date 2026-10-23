/* Public landing page: homepage stays open; tools require candidate login. */
(function(){
  const protectedTargets = new Set(['Typing_test.html','self-test.html','materials.html','my_results.html','leaderboard.html','my_account.html','start_test.html']);
  function localTarget(url){return url.pathname.replace(/^\\//,'') + url.search + url.hash;}
  function addHomeStyles(){document.body.classList.add('home-public');}
  function escapeText(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function prettyType(type){return ({offer:'Limited-time offer',notice:'Notice',announcement:'Announcement',event:'Upcoming event',maintenance:'Service update',featured:'Featured update'})[type]||'Update';}
  function activeNow(item,now){return item.is_active&&item.is_public&&(!item.starts_at||new Date(item.starts_at)<=now)&&(!item.ends_at||new Date(item.ends_at)>now);}
  function countdown(end){if(!end)return 'No end time';const ms=new Date(end).getTime()-Date.now();if(ms<=0)return 'Ended';const d=Math.floor(ms/86400000),h=Math.floor(ms%86400000/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);return (d?d+'d ':'')+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');}
  async function loadAnnouncements(){
    const nav=document.querySelector('.navbar');if(!nav||!window.supabaseClient)return;
    let result;try{result=await supabaseClient.from('site_announcements').select('id,title,body,content_type,theme,cta_label,cta_url,starts_at,ends_at,sort_order,is_active,is_public').eq('is_active',true).eq('is_public',true).order('sort_order',{ascending:true}).limit(20);}catch(e){return;}
    if(result?.error||!result?.data?.length)return;
    const now=new Date(),items=result.data.filter(x=>activeNow(x,now));if(!items.length)return;
    const wrap=document.createElement('section');wrap.className='home-announcements container';wrap.id='home-announcements';wrap.setAttribute('aria-label','Latest notices and offers');wrap.dataset.theme=items[0].theme||'aurora';
    wrap.innerHTML='<div class="home-announcement-kicker">✦ Decoding HCM • Updates & offers</div><div class="home-announcement-card" aria-live="polite"></div><div class="home-announcement-controls"><button type="button" data-prev aria-label="Previous update">‹</button><button type="button" data-next aria-label="Next update">›</button><div class="home-announcement-dots" aria-hidden="true"></div><span style="margin-left:auto;font-size:.75rem;color:#cbd5e1">Live updates</span></div>';
    nav.insertAdjacentElement('afterend',wrap);let current=0;
    const render=()=>{const item=items[current];wrap.dataset.theme=item.theme||'aurora';const cta=item.cta_label&&item.cta_url?'<a class="home-announcement-cta" href="'+escapeText(item.cta_url)+'" data-content-cta>'+escapeText(item.cta_label)+' ↗</a>':'';wrap.querySelector('.home-announcement-card').innerHTML='<span class="home-announcement-pill">✦ '+escapeText(prettyType(item.content_type))+'</span><h2>'+escapeText(item.title)+'</h2><p>'+escapeText(item.body)+'</p>'+cta+'<div class="home-announcement-meta">'+(item.ends_at?'<span>⏳ Ends in <strong class="home-announcement-countdown" data-end="'+escapeText(item.ends_at)+'">'+countdown(item.ends_at)+'</strong></span>':'')+(item.starts_at?'<span>✦ Starts '+escapeText(new Date(item.starts_at).toLocaleString())+'</span>':'')+'</div>';wrap.querySelector('.home-announcement-dots').innerHTML=items.map((_,i)=>'<span class="'+(i===current?'active':'')+'"></span>').join('');};
    wrap.querySelector('[data-prev]').addEventListener('click',()=>{current=(current+items.length-1)%items.length;render()});wrap.querySelector('[data-next]').addEventListener('click',()=>{current=(current+1)%items.length;render()});render();setInterval(()=>{const end=wrap.querySelector('[data-end]');if(end){const value=countdown(end.dataset.end);end.textContent=value;if(value==='Ended')loadAnnouncements();}},1000);
    wrap.addEventListener('click',async e=>{const a=e.target.closest('[data-content-cta]');if(!a)return;const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;if(protectedTargets.has(u.pathname.split('/').pop())){e.preventDefault();await navigateProtected(u);}});
  }
  async function navigateProtected(url){
    let user=null;try{const r=await supabaseClient.auth.getUser();user=r.data?.user||null;}catch(_){}
    if(user){location.href=localTarget(url);return;}
    const target=encodeURIComponent(localTarget(url));location.href='login.html?redirect='+target;
  }
  function wireProtectedNavigation(){
    document.addEventListener('click',async e=>{const a=e.target.closest('a[href]');if(!a)return;const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;if(!protectedTargets.has(u.pathname.split('/').pop()))return;e.preventDefault();await navigateProtected(u);});
  }
  document.addEventListener('DOMContentLoaded',()=>{addHomeStyles();wireProtectedNavigation();loadAnnouncements();});
})();