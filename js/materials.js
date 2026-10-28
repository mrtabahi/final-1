document.addEventListener('DOMContentLoaded',async()=>{
 const box=document.getElementById('materials-list');
 const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 const status=await AuthManager.requireCandidateGuard();if(!status?.ok)return;
 const {data,error}=await supabaseClient.rpc('list_material_catalog');
 if(error){box.innerHTML='<div class="loading-card">Unable to load materials. Please refresh and try again.</div>';console.error(error);return}
 if(!data?.length){box.innerHTML='<div class="loading-card">No materials have been published yet. Check back soon.</div>';return}
 const typeLabel=t=>t==='combined_pdf'?'Combined PDF':t==='study_pack'?'Study pack':'PDF';
 box.innerHTML=data.map(r=>'<article class="material-card"><div class="material-card-icon" aria-hidden="true">'+(r.material_type==='study_pack'?'▤':'PDF')+'</div><div class="material-card-copy"><span class="material-type-label">'+esc(typeLabel(r.material_type))+'</span><h2>'+esc(r.title)+'</h2><p>'+esc(r.description||'Open the Telegram post to view or download the file.')+'</p><a data-access-key="feature:'+esc(r.id)+'" data-material-id="'+esc(r.id)+'" class="btn btn-primary" href="#">Open material ↗</a></div></article>').join('');
 box.querySelectorAll('[data-material-id]').forEach(a=>a.addEventListener('click',async e=>{
   e.preventDefault();if(a.dataset.loading==='true')return;a.dataset.loading='true';const old=a.textContent;a.textContent='Checking access…';
   try{const {data,error}=await supabaseClient.rpc('get_material_link',{p_material_id:a.dataset.materialId});if(error)throw error;if(!data){a.textContent='Upgrade required';return}location.href=data;}
   catch(err){console.error(err);a.textContent='Unable to open';}
   finally{a.dataset.loading='false';if(a.textContent==='Checking access…')a.textContent=old;}
 }));
});