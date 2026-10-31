/* Decoding HCM public-site audio controls. Autoplay may be blocked by browser policy until the visitor interacts. */
(async function(){
 'use strict';
 const start=async()=>{
  const client = typeof supabaseClient !== 'undefined' ? supabaseClient : window.supabaseClient;
  if(!client)return;
  let settings;
  try{const result=await client.from('site_experience_settings').select('audio_url,audio_enabled,audio_loop,audio_for_logged_in').eq('id',1).maybeSingle();if(result.error||!result.data)return;settings=result.data;}catch{return;}
  if(!settings.audio_enabled||!settings.audio_url)return;
  const audio=new Audio(settings.audio_url);audio.loop=Boolean(settings.audio_loop);audio.preload='auto';
  const bar=document.createElement('div');bar.className='dh-audio-status';bar.innerHTML='<span class="dh-audio-brand">DH</span><span class="dh-audio-copy"><strong>Decoding HCM</strong><small>Background audio</small></span><button type="button" class="dh-audio-toggle" aria-label="Pause background audio">Ⅱ Pause</button>';
  const style=document.createElement('style');style.textContent='.dh-audio-status{position:fixed;z-index:9998;left:14px;bottom:14px;display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #67e8f955;border-radius:15px;background:rgba(7,19,40,.92);color:#eaf6ff;box-shadow:0 8px 30px #02061750,0 0 20px #22d3ee18;backdrop-filter:blur(14px);font:500 12px/1.2 system-ui,sans-serif}.dh-audio-brand{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:linear-gradient(135deg,#22d3ee,#818cf8);color:#06152d;font-weight:900}.dh-audio-copy{display:grid;gap:3px}.dh-audio-copy small{color:#9fb8d4}.dh-audio-toggle{border:1px solid #67e8f988;border-radius:10px;padding:7px 10px;background:#0e7490;color:white;font-weight:800;cursor:pointer}.dh-audio-toggle:focus-visible{outline:2px solid #fff;outline-offset:2px}@media(max-width:480px){.dh-audio-status{left:8px;bottom:8px;padding:7px 8px}.dh-audio-copy{display:none}}@media(prefers-reduced-motion:reduce){.dh-audio-status{scroll-behavior:auto}}';
  document.head.appendChild(style);document.body.appendChild(bar);
  const button=bar.querySelector('button');
  let session=null;
  try{session=(await client.auth.getSession()).data?.session||null;}catch{}
  const canPlay=()=>!session||Boolean(settings.audio_for_logged_in);
  const paint=playing=>{button.textContent=playing?'Ⅱ Pause':'▶ Play';button.setAttribute('aria-label',playing?'Pause background audio':'Play background audio');};
  button.addEventListener('click',async()=>{if(audio.paused){try{await audio.play();paint(true);}catch{paint(false);}}else{audio.pause();paint(false);}});
  audio.addEventListener('play',()=>paint(true));audio.addEventListener('pause',()=>paint(false));
  if(canPlay()){try{await audio.play();paint(true);}catch{paint(false);}}
  client.auth.onAuthStateChange((_event,nextSession)=>{session=nextSession;if(!canPlay()){audio.pause();paint(false);}else if(audio.paused){audio.play().then(()=>paint(true)).catch(()=>paint(false));}});
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();