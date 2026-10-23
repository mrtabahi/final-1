document.addEventListener("DOMContentLoaded", async () => {
 const body=document.getElementById("leaderboard-body"), message=document.getElementById("leaderboard-message");
 if(!supabaseClient||!body)return;
 const esc=v=>String(v??"-").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
 try{
  const [ar,mr]=await Promise.all([
   supabaseClient.from("attempts").select("id,candidate_name,language,duration_seconds,created_at,gross_wpm,net_wpm,accuracy,tests(title)").order("net_wpm",{ascending:false}).limit(100),
   supabaseClient.from("manual_leaderboard_entries").select("id,candidate_name,language,test_name,duration_seconds,created_at,gross_wpm,net_wpm,accuracy").order("net_wpm",{ascending:false}).limit(100)
  ]);
  if(ar.error)throw ar.error;
  const all=[...(ar.data||[]).map(a=>{const t=Array.isArray(a.tests)?a.tests[0]:a.tests;return {...a,test_name:t?.title||"-",manual:false}}),...(!mr.error?(mr.data||[]).map(a=>({...a,manual:true})):[])].sort((a,b)=>Number(b.net_wpm||0)-Number(a.net_wpm||0)).slice(0,50);
  if(!all.length){body.innerHTML='<tr><td colspan="9">No entries found on leaderboard.</td></tr>';return;}
  body.innerHTML=all.map((a,i)=>{const d=a.created_at?new Date(a.created_at):null;const date=d&&!Number.isNaN(d.getTime())?d.toLocaleString():"-";return `<tr><td><strong>#${i+1}</strong></td><td>${esc(a.candidate_name||"-")}${a.manual?' <small>(Admin entry)</small>':''}</td><td>${esc(a.language||"-")}</td><td>${esc(a.test_name||"-")}</td><td>${esc(a.duration_seconds??"-")}</td><td>${esc(date)}</td><td>${esc(a.gross_wpm??"-")}</td><td><strong style="color:var(--primary-blue)">${esc(a.net_wpm??"-")} WPM</strong></td><td>${a.accuracy==null?"-":esc(a.accuracy)+"%"}</td></tr>`}).join("");
 }catch(error){console.error(error);body.innerHTML='<tr><td colspan="9">Unable to load leaderboard.</td></tr>';if(message)message.textContent="Please refresh and try again.";}
});