document.addEventListener('DOMContentLoaded',async()=>{
 const body=document.getElementById('history-table-body');if(!body)return;
 const status=await AuthManager.requireCandidateGuard();if(!status?.ok)return;
 document.getElementById('logout-btn')?.addEventListener('click',async e=>{e.preventDefault();try{await AuthManager.logout()}catch(err){console.error(err);alert('Logout failed. Please try again.')}});
 const fmt=v=>v==null||v===''?'-':(Number.isFinite(Number(v))?Number(v).toFixed(2):String(v));
 const esc=v=>String(v??'-').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 const sevenDaysAgo=new Date(Date.now()-7*24*60*60*1000).toISOString();
 try{
  const {data,error}=await supabaseClient.from('attempts')
   .select('created_at,duration_seconds,mode,gross_wpm,net_wpm,accuracy,total_errors,result_snapshot,tests(title,target_wpm,min_accuracy)')
   .eq('user_id',status.user.id).gte('created_at',sevenDaysAgo).order('created_at',{ascending:false}).limit(500);
  if(error)throw error;
  if(!data?.length){body.innerHTML='<tr><td colspan="9" class="results-empty">No results in the last 7 days. Complete a typing test to see your progress here.</td></tr>';return}
  body.innerHTML=data.map(a=>{
   const d=a.created_at?new Date(a.created_at):null;
   const date=d&&!Number.isNaN(d.getTime())?d.toLocaleString(undefined,{month:'short',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'-';
   const t=Array.isArray(a.tests)?a.tests[0]:a.tests;
   const saved=a.result_snapshot?.score?.passed;
   const target=Number(t?.target_wpm);
   const minAccuracy=t?.min_accuracy==null||t.min_accuracy===''?null:Number(t.min_accuracy);
   const passed=typeof saved==='boolean'?saved:((!Number.isFinite(target)||a.net_wpm>=target)&&(minAccuracy===null||!Number.isFinite(minAccuracy)||a.accuracy>=minAccuracy));
   const result=passed?'<span class="result-status result-qualified"><span aria-hidden="true">✓</span> Qualify</span>':'<span class="result-status result-retry"><span aria-hidden="true">↻</span> Try again</span>';
   return `<tr><td><span class="result-date">${esc(date)}</span></td><td><span class="result-test-name">${esc(t?.title||'-')}</span></td><td><span class="result-mode">${esc(a.mode||'-')}</span></td><td>${result}</td><td>${esc(a.duration_seconds??'-')}<span class="result-unit"> sec</span></td><td><span class="result-metric">${esc(fmt(a.gross_wpm))}</span></td><td><span class="result-metric result-net">${esc(fmt(a.net_wpm))}</span></td><td><span class="result-accuracy">${a.accuracy==null?'-':esc(fmt(a.accuracy))+'%'}</span></td><td><span class="result-errors">${esc(a.total_errors??'-')}</span></td></tr>`;
  }).join('');
 }catch(err){console.error(err);body.innerHTML='<tr><td colspan="9" class="results-empty">Unable to load history. Please refresh and try again.</td></tr>'}
});