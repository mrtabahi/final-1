document.addEventListener('DOMContentLoaded', async () => {
 const box=document.getElementById('folder-list'); if(!box)return;
 const status=await AuthManager.requireCandidateGuard(); if(!status?.ok)return;
 const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 document.getElementById('logout-btn')?.addEventListener('click',async e=>{e.preventDefault();try{await AuthManager.logout()}catch(err){console.error(err);alert('Logout failed. Please try again.')}});
 box.textContent='Loading typing tests…';
 try{
  const [fr,tr]=await Promise.all([
   supabaseClient.from('folders').select('id,name,description,sort_order,created_at').eq('active',true).order('sort_order').order('created_at'),
   supabaseClient.from('tests').select('id,title,language,duration_minutes,target_wpm,min_accuracy,folder_id,mode').eq('active',true).order('created_at',{ascending:false})
  ]);
  if(fr.error)throw fr.error;if(tr.error)throw tr.error;
  const groups=(fr.data||[]).map(f=>({...f,tests:(tr.data||[]).filter(t=>t.folder_id===f.id)})).filter(f=>f.tests.length);
  if(!groups.length){box.textContent='No active typing sets are available yet.';return}
  box.innerHTML=groups.map(f=>`<section class="test-folder" style="margin-bottom:1.5rem;padding:1rem;border:1px solid var(--border-color);border-radius:12px"><h3>${esc(f.name)}</h3><p class="form-help">${esc(f.description||'')}</p><div class="table-responsive"><table class="data-table"><thead><tr><th>Test</th><th>Language</th><th>Time</th><th>Target</th><th>Accuracy</th><th>Action</th></tr></thead><tbody>${f.tests.map(t=>`<tr><td><strong>${esc(t.title)}</strong></td><td>${esc(t.language||'—')}</td><td>${esc(t.duration_minutes??'—')} min</td><td>${t.target_wpm==null?'—':esc(t.target_wpm)+' WPM'}</td><td>${t.min_accuracy==null?'—':esc(t.min_accuracy)+'%'}</td><td><a class="btn btn-primary btn-sm" href="start_test.html?test=${encodeURIComponent(String(t.id))}">Attempt</a></td></tr>`).join('')}</tbody></table></div></section>`).join('');
 }catch(err){console.error(err);box.textContent='Unable to load tests. Please refresh and try again.'}
});