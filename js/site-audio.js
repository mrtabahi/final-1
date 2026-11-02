/* Decoding HCM persistent public-site audio player.
   Playback position and play intent are carried across same-tab page navigations. */
(async function(){
 'use strict';
 const STATE_KEY='dh-public-audio-state-v2';
 const start=async()=>{
  const client=typeof supabaseClient!=='undefined'?supabaseClient:window.supabaseClient;
  if(!client||document.getElementById('dh-audio-player'))return;
  let settings;
  try{
   const result=await client.from('site_experience_settings').select('audio_url,audio_enabled,audio_loop,audio_for_logged_in').eq('id',1).maybeSingle();
   if(result.error||!result.data)return;
   settings=result.data;
  }catch{return;}
  if(!settings.audio_enabled||!settings.audio_url)return;

  let saved=null;
  try{saved=JSON.parse(sessionStorage.getItem(STATE_KEY)||'null');}catch{}
  const audio=new Audio(settings.audio_url);
  audio.loop=Boolean(settings.audio_loop);
  audio.preload='auto';

  const style=document.createElement('style');
  style.id='dh-audio-player-style';
  style.textContent=`
   #dh-audio-player{position:fixed;z-index:2147482000;left:18px;bottom:18px;display:flex;align-items:center;gap:11px;width:min(286px,calc(100vw - 28px));padding:10px 12px;border:1px solid rgba(148,163,184,.28);border-radius:18px;background:rgba(15,23,42,.94);color:#f8fafc;box-shadow:0 12px 38px rgba(2,6,23,.28),0 2px 8px rgba(2,6,23,.18);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);font:500 13px/1.25 Inter,system-ui,sans-serif}
   #dh-audio-player *{box-sizing:border-box}
   #dh-audio-player .dh-audio-mark{width:38px;height:38px;flex:0 0 38px;display:grid;place-items:center;border-radius:12px;background:linear-gradient(145deg,#2563eb,#0891b2);color:white;box-shadow:inset 0 1px rgba(255,255,255,.28)}
   #dh-audio-player .dh-audio-mark svg{width:20px;height:20px}
   #dh-audio-player .dh-audio-info{min-width:0;flex:1;display:grid;gap:4px}
   #dh-audio-player .dh-audio-title{font-size:12px;font-weight:750;letter-spacing:.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
   #dh-audio-player .dh-audio-subtitle{display:flex;align-items:center;gap:6px;color:#a8b7cc;font-size:10px}
   #dh-audio-player .dh-audio-eq{height:11px;display:flex;align-items:center;gap:2px}
   #dh-audio-player .dh-audio-eq i{display:block;width:2px;height:4px;border-radius:2px;background:#38bdf8}
   #dh-audio-player[data-playing="true"] .dh-audio-eq i{animation:dh-eq .75s ease-in-out infinite alternate}
   #dh-audio-player[data-playing="true"] .dh-audio-eq i:nth-child(2){animation-delay:-.45s}
   #dh-audio-player[data-playing="true"] .dh-audio-eq i:nth-child(3){animation-delay:-.2s}
   #dh-audio-player[data-playing="true"] .dh-audio-eq i:nth-child(4){animation-delay:-.6s}
   #dh-audio-player .dh-audio-status{white-space:nowrap}
   #dh-audio-player .dh-audio-control{width:38px;height:38px;flex:0 0 38px;display:grid;place-items:center;border:1px solid rgba(125,211,252,.45);border-radius:12px;background:rgba(14,116,144,.28);color:#e0f2fe;cursor:pointer;transition:background .18s,border-color .18s,transform .18s}
   #dh-audio-player .dh-audio-control:hover{background:rgba(14,116,144,.52);border-color:#7dd3fc}
   #dh-audio-player .dh-audio-control:active{transform:scale(.96)}
   #dh-audio-player .dh-audio-control:focus-visible{outline:2px solid #7dd3fc;outline-offset:3px}
   #dh-audio-player .dh-audio-control svg{width:17px;height:17px}
   @keyframes dh-eq{from{height:3px}to{height:11px}}
   @media(max-width:480px){#dh-audio-player{left:12px;bottom:12px;width:auto;max-width:calc(100vw - 24px);padding:8px 10px;gap:9px}#dh-audio-player .dh-audio-mark{width:34px;height:34px;flex-basis:34px}#dh-audio-player .dh-audio-control{width:36px;height:36px;flex-basis:36px}}
   @media(prefers-reduced-motion:reduce){#dh-audio-player[data-playing="true"] .dh-audio-eq i{animation:none;height:6px}}
  `;
  document.head.appendChild(style);

  const bar=document.createElement('aside');
  bar.id='dh-audio-player';
  bar.setAttribute('aria-label','Background music player');
  bar.dataset.playing='false';
  bar.innerHTML='<span class="dh-audio-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span><span class="dh-audio-info"><span class="dh-audio-title">Decoding HCM</span><span class="dh-audio-subtitle"><span class="dh-audio-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="dh-audio-status">Background music · Paused</span></span></span><button class="dh-audio-control" type="button" aria-label="Play background music" title="Play"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.8c0-.8.9-1.3 1.6-.9l10 6.2a1.1 1.1 0 0 1 0 1.8l-10 6.2a1.1 1.1 0 0 1-1.6-.9V5.8Z"/></svg></button>';
  document.body.appendChild(bar);
  const button=bar.querySelector('button');
  const status=bar.querySelector('.dh-audio-status');
  let session=null;
  let intentionalPlay=Boolean(saved?.playing);
  const canPlay=()=>!session||Boolean(settings.audio_for_logged_in);
  const store=()=>{
   try{sessionStorage.setItem(STATE_KEY,JSON.stringify({playing:intentionalPlay,time:Number.isFinite(audio.currentTime)?audio.currentTime:0,src:settings.audio_url}));}catch{}
  };
  const paint=playing=>{
   bar.dataset.playing=String(playing);
   status.textContent=playing?'Background music · Playing':'Background music · Paused';
   button.setAttribute('aria-label',playing?'Pause background music':'Play background music');
   button.title=playing?'Pause':'Play';
   button.innerHTML=playing?'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1A1.5 1.5 0 0 1 7 18.5v-13Zm7 0A1.5 1.5 0 0 1 15.5 4h1A1.5 1.5 0 0 1 18 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5v-13Z"/></svg>':'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.8c0-.8.9-1.3 1.6-.9l10 6.2a1.1 1.1 0 0 1 0 1.8l-10 6.2a1.1 1.1 0 0 1-1.6-.9V5.8Z"/></svg>';
  };
  const play=async()=>{
   if(!canPlay()){intentionalPlay=false;paint(false);store();return;}
   try{await audio.play();intentionalPlay=true;paint(true);store();}
   catch{intentionalPlay=true;paint(false);store();status.textContent='Tap Play to start music';}
  };
  button.addEventListener('click',async()=>{
   if(audio.paused){intentionalPlay=true;await play();}
   else{intentionalPlay=false;audio.pause();paint(false);store();}
  });
  audio.addEventListener('play',()=>{paint(true);store();});
  audio.addEventListener('pause',()=>{paint(false);store();});
  audio.addEventListener('timeupdate',()=>{if(!audio.paused)store();});
  window.addEventListener('pagehide',store);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')store();});
  try{session=(await client.auth.getSession()).data?.session||null;}catch{}
  const sameTrack=saved?.src===settings.audio_url;
  audio.addEventListener('loadedmetadata',()=>{
   if(sameTrack&&Number.isFinite(saved?.time)&&saved.time>0&&saved.time<audio.duration){
    try{audio.currentTime=saved.time;}catch{}
   }
   if(intentionalPlay&&canPlay())play();
  },{once:true});
  client.auth.onAuthStateChange((_event,nextSession)=>{
   session=nextSession;
   if(!canPlay()){intentionalPlay=false;audio.pause();paint(false);store();}
   else if(intentionalPlay&&audio.paused)play();
  });
  if(audio.readyState>=1){
   if(sameTrack&&Number.isFinite(saved?.time)&&saved.time>0&&saved.time<audio.duration)audio.currentTime=saved.time;
   if(intentionalPlay&&canPlay())play();
  }else if(!intentionalPlay){paint(false);}
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();