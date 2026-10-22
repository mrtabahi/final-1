document.addEventListener('DOMContentLoaded',async()=>{
 const body=document.getElementById('history-table-body');if(!body)return;
 const status=await AuthManager.requireCandidateGuard();if(!status?.ok)return;
 document.getElementById('logout-btn')?.addEventListener('click',async e=>{e.preventDefault();try{await AuthManager.logout()}catch(err){console.error(err);alert('Logout failed. Please try again.')}});
 const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 try{
  const {data,error}=await supabaseClient.from('attempts').select('created_at,mode,gross_wpm,net_wpm,accuracy,total_errors,tests(title)').eq('user_id',status.user.id).order('created_at',{ascending:false}).limit(50);
  if(error)throw error;if(!data?.length){body.innerHTML='<tr><td colspan="7">No attempts yet.</td></tr>';return}
  body.innerHTML=data.map(a=>{const d=a.created_at?new Date(a.created_at):null;const date=d&&!Number.isNaN(d.getTime())?d.toLocaleString():'—';const t=Array.isArray(a.tests)?a.tests[0]:a.tests;return `<tr><td>${esc(date)}</td><td>${esc(t?.title||'Typing Test')}</td><td>${esc(a.mode||'—')}</td><td>${esc(a.gross_wpm??'—')}</td><td>${esc(a.net_wpm??'—')}</td><td>${a.accuracy==null?'—':esc(a.accuracy)+'%'}</td><td>${esc(a.total_errors??'—')}</td></tr>`}).join('');
 }catch(err){console.error(err);body.innerHTML='<tr><td colspan="7">Unable to load history. Please try again.</td></tr>'}
});