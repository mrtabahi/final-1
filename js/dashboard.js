document.addEventListener('DOMContentLoaded', async()=>{
    const status=await AuthManager.requireCandidateGuard(); if(!status.ok) return;
    const {user,profile}=status;
    const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
    document.getElementById('welcome-name').textContent=profile.full_name;
    document.getElementById('profile-name').value=profile.full_name||'';
    document.getElementById('profile-phone').value=profile.phone||'';
    document.getElementById('profile-email').value=user.email||profile.email||'';
    document.getElementById('profile-status').value=profile.phone_verified?'Verified':'Verification required';
    document.getElementById('logout-btn').onclick=e=>{e.preventDefault();AuthManager.logout();};

    async function loadTests(){
        const {data:folders,error:fe}=await supabaseClient.from('folders').select('id,name,description,sort_order').eq('active',true).order('sort_order').order('created_at');
        const {data:tests,error:te}=await supabaseClient.from('tests').select('id,title,language,duration_minutes,target_wpm,min_accuracy,folder_id,mode').eq('active',true).order('created_at',{ascending:false});
        const box=document.getElementById('folder-list'); if(fe||te){box.textContent='Unable to load tests. Please refresh.';return;}
        const groups=(folders||[]).map(f=>({...f,tests:(tests||[]).filter(t=>t.folder_id===f.id)})).filter(f=>f.tests.length);
        if(!groups.length){box.innerHTML='<p>No active typing sets are available yet.</p>';return;}
        box.innerHTML=groups.map(f=>`<div class="test-folder" style="margin-bottom:1.5rem;padding:1rem;border:1px solid var(--border-color);border-radius:12px"><h3>${esc(f.name)}</h3><p class="form-help">${esc(f.description||'')}</p><div class="table-responsive"><table class="data-table"><thead><tr><th>Test</th><th>Language</th><th>Time</th><th>Target</th><th>Accuracy</th><th></th></tr></thead><tbody>${f.tests.map(t=>`<tr><td><strong>${esc(t.title)}</strong></td><td>${esc(t.language)}</td><td>${t.duration_minutes} min</td><td>${t.target_wpm ?? '—'} WPM</td><td>${t.min_accuracy==null?'—':t.min_accuracy+'%'}</td><td><a class="btn btn-primary btn-sm" href="index.html?test=${encodeURIComponent(t.id)}">Attempt</a></td></tr>`).join('')}</tbody></table></div></div>`).join('');
    }
    async function loadHistory(){
        const {data,error}=await supabaseClient.from('attempts').select('created_at,mode,gross_wpm,net_wpm,accuracy,total_errors,test_id,tests(title)').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50);
        const body=document.getElementById('history-table-body'); if(error){body.innerHTML='<tr><td colspan="7">Unable to load history.</td></tr>';return;}
        body.innerHTML=data?.length?data.map(a=>`<tr><td>${new Date(a.created_at).toLocaleString()}</td><td>${esc(a.tests?.title||'Typing Test')}</td><td>${esc(a.mode)}</td><td>${a.gross_wpm}</td><td>${a.net_wpm}</td><td>${a.accuracy}%</td><td>${a.total_errors}</td></tr>`).join(''):'<tr><td colspan="7">No attempts yet.</td></tr>';
    }
    document.getElementById('profile-form').addEventListener('submit',async e=>{e.preventDefault();const msg=document.getElementById('profile-message');try{await AuthManager.updateName(document.getElementById('profile-name').value);const email=document.getElementById('profile-email').value.trim().toLowerCase();if(email!==user.email){await AuthManager.changeEmail(email);msg.textContent='Name saved. A confirmation link has been sent to the new email address.';}else msg.textContent='Profile updated successfully.';}catch(err){msg.textContent=err.message;}});
    document.getElementById('password-form').addEventListener('submit',async e=>{e.preventDefault();const msg=document.getElementById('profile-message');try{await AuthManager.changePassword(document.getElementById('new-password').value);e.target.reset();msg.textContent='Password changed successfully.';}catch(err){msg.textContent=err.message;}});
    await loadTests(); await loadHistory();
});