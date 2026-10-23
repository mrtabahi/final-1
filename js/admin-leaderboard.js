document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id), esc=v=>String(v??'-').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 const gate=await AuthManager.requireAdminGuard();if(!gate?.user||!gate?.profile)return;
 const date=v=>{if(!v)return '-';const d=new Date(v);return Number.isNaN(d.getTime())?'-':d.toLocaleString()};
 async function load(){
  $('attempts-body').innerHTML='<tr><td colspan="6">Loading…</td></tr>';$('manual-body').innerHTML='<tr><td colspan="6">Loading…</td></tr>';
  const [a,m]=await Promise.all([
   supabaseClient.from('attempts').select('id,candidate_name,duration_seconds,created_at,net_wpm,tests(title)').order('created_at',{ascending:false}).limit(300),
   supabaseClient.from('manual_leaderboard_entries').select('id,candidate_name,test_name,duration_seconds,created_at,net_wpm').order('created_at',{ascending:false}).limit(300)
  ]);
  if(a.error){$('attempts-body').innerHTML='<tr><td colspan="6">Could not load attempts. '+esc(a.error.message)+'</td></tr>';}else{
   $('attempts-body').innerHTML=(a.data||[]).map(x=>{const t=Array.isArray(x.tests)?x.tests[0]:x.tests;return `<tr><td>${esc(x.candidate_name)}</td><td>${esc(t?.title||'-')}</td><td>${esc(x.duration_seconds??'-')}</td><td>${esc(date(x.created_at))}</td><td>${esc(x.net_wpm??'-')}</td><td><button class="btn btn-danger" data-delete-attempt="${esc(x.id)}" type="button">Remove history</button></td></tr>`}).join('')||'<tr><td colspan="6">No attempts found.</td></tr>';
  }
  if(m.error){$('manual-body').innerHTML='<tr><td colspan="6">Could not load manual entries. '+esc(m.error.message)+'</td></tr>';}else{
   $('manual-body').innerHTML=(m.data||[]).map(x=>`<tr><td>${esc(x.candidate_name)}</td><td>${esc(x.test_name||'-')}</td><td>${esc(x.duration_seconds??'-')}</td><td>${esc(date(x.created_at))}</td><td>${esc(x.net_wpm??'-')}</td><td><button class="btn btn-danger" data-delete-manual="${esc(x.id)}" type="button">Remove entry</button></td></tr>`).join('')||'<tr><td colspan="6">No manual entries.</td></tr>';
  }
  document.querySelectorAll('[data-delete-attempt]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Delete this attempt from stored history and leaderboard? This cannot be undone.'))return;const {error}=await supabaseClient.from('attempts').delete().eq('id',b.dataset.deleteAttempt);if(error)alert('Delete failed: '+error.message);else await load();}));
  document.querySelectorAll('[data-delete-manual]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('Remove this manual leaderboard entry?'))return;const {error}=await supabaseClient.from('manual_leaderboard_entries').delete().eq('id',b.dataset.deleteManual);if(error)alert('Delete failed: '+error.message);else await load();}));
 }
 $('manual-form').addEventListener('submit',async e=>{e.preventDefault();$('manual-status').textContent='Saving…';const num=id=>$(id).value===''?null:Number($(id).value);const row={candidate_name:$('manual-name').value.trim(),language:$('manual-language').value.trim()||'-',test_name:$('manual-test').value.trim()||'-',duration_seconds:num('manual-time'),gross_wpm:num('manual-gross'),net_wpm:num('manual-net')??0,accuracy:num('manual-accuracy'),created_by:gate.user.id,is_manual:true};const {error}=await supabaseClient.from('manual_leaderboard_entries').insert(row);if(error){$('manual-status').textContent='Unable to save: '+error.message;return;}$('manual-status').textContent='Manual leaderboard entry added.';$('manual-form').reset();$('manual-language').value='-';$('manual-test').value='-';$('manual-net').value='0';await load();});
 $('refresh').addEventListener('click',load);await load();
});