document.addEventListener("DOMContentLoaded", async () => {
 const body=document.getElementById("leaderboard-body"), message=document.getElementById("leaderboard-message");
 if(!supabaseClient||!body)return;
 const esc=v=>String(v??"-").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
 const date=v=>{if(!v)return "-";const d=new Date(v);return Number.isNaN(d.getTime())?"-":d.toLocaleString()};
 const compareField=(a,b,key,direction)=>{
  const av=a[key]==null?null:Number(a[key]),bv=b[key]==null?null:Number(b[key]);
  if(av===null&&bv===null)return 0;
  if(av===null)return 1;
  if(bv===null)return -1;
  return (av-bv)*direction;
 };
 try{
  const [ar,mr]=await Promise.all([
   supabaseClient.from("public_leaderboard_attempts").select("id,candidate_name,language,duration_seconds,created_at,gross_wpm,net_wpm,accuracy,test_name").limit(300),
   supabaseClient.from("manual_leaderboard_entries").select("id,candidate_name,language,test_name,duration_seconds,created_at,gross_wpm,net_wpm,accuracy").limit(300)
  ]);
  if(ar.error)throw ar.error;
  if(mr.error)throw mr.error;
  const all=[
   ...(ar.data||[]).map(a=>({...a,manual:false})),
   ...(mr.data||[]).map(a=>({...a,manual:true}))
  ].sort((a,b)=>
   compareField(a,b,"net_wpm",-1)||
   compareField(a,b,"accuracy",-1)||
   compareField(a,b,"duration_seconds",1)||
   String(a.created_at||"").localeCompare(String(b.created_at||""))||
   String(a.id||"").localeCompare(String(b.id||""))
  ).slice(0,50);
  if(!all.length){body.innerHTML='<tr><td colspan="9">No entries found on leaderboard.</td></tr>';if(message)message.textContent="";return;}
  body.innerHTML=all.map((a,i)=>`<tr><td><strong>#${i+1}</strong></td><td>${esc(a.candidate_name)}${a.manual?' <small>(Admin entry)</small>':''}</td><td>${esc(a.language)}</td><td>${esc(a.test_name)}</td><td>${esc(a.duration_seconds)}</td><td>${esc(date(a.created_at))}</td><td>${esc(a.gross_wpm)}</td><td><strong style="color:var(--primary-blue)">${esc(a.net_wpm)} WPM</strong></td><td>${a.accuracy==null?"-":esc(a.accuracy)+"%"}</td></tr>`).join("");
  if(message)message.textContent="";
 }catch(error){
  console.error("Leaderboard load failed",error);
  body.innerHTML='<tr><td colspan="9">Unable to load leaderboard. Please refresh and try again.</td></tr>';
  if(message)message.textContent="Leaderboard data could not be loaded. Please try again later.";
 }
});
