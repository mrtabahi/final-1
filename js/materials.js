document.addEventListener('DOMContentLoaded',async()=>{
 const box=document.getElementById('materials-list');
 const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
 const status=await AuthManager.requireCandidateGuard();if(!status?.ok)return;
 const {data,error}=await supabaseClient.rpc('list_material_catalog');
 if(error){box.innerHTML='<div class="loading-card">Unable to load materials. Please refresh and try again.</div>';console.error(error);return;}
 if(!data?.length){box.innerHTML='<div class="loading-card">No materials have been published yet. Check back soon.</div>';return;}
 const typeLabel=t=>t==='combined_pdf'?'Combined PDF':t==='study_pack'?'Study pack':'PDF';
 box.innerHTML=data.map(r=>'<article class="material-card '+(r.pinned?'is-pinned':'')+'"><div class="material-card-icon" aria-hidden="true">'+(r.material_type==='study_pack'?'▤':'PDF')+'</div><div class="material-card-copy">'+(r.pinned?'<span class="material-public-pin">★ PINNED</span>':'')+'<div class="material-public-meta"><span class="material-type-label">'+esc(typeLabel(r.material_type))+'</span><span class="material-public-access '+(r.is_free?'free':'paid')+'">'+(r.is_free?'FREE DOWNLOAD':'PREMIUM')+'</span></div><h2>'+esc(r.title)+'</h2><p>'+esc(r.description||(r.has_file?'Ready to download as PDF.':'Open the Telegram post to view or download the file.'))+'</p><button type="button" class="btn btn-primary" data-material-id="'+esc(r.id)+'">'+(r.has_file?'↓ Download PDF':'Open material ↗')+'</button></div></article>').join('');
 box.querySelectorAll('[data-material-id]').forEach(button=>button.addEventListener('click',async()=>{
  if(button.dataset.loading==='true')return;button.dataset.loading='true';const old=button.textContent;button.disabled=true;button.textContent='Checking access…';
  try{
   const {data:path,error}=await supabaseClient.rpc('get_material_link',{p_material_id:button.dataset.materialId});if(error)throw error;
   if(!path){const go=confirm('This material requires an active paid plan. View available plans now?');if(go)location.href='/my_account.html?openPremium=1';else{button.disabled=false;button.textContent=old;}return;}
   if(path.startsWith('pdf/')){
    button.textContent='Preparing download…';
    const {data:signed,error:signError}=await supabaseClient.storage.from('study-materials').createSignedUrl(path,120,{download:true});
    if(signError)throw signError;if(!signed?.signedUrl)throw new Error('Could not prepare a secure download link.');
    location.assign(signed.signedUrl);
   }else{location.assign(path);}
  }catch(err){console.error('Material download failed',err);button.disabled=false;button.textContent='Try again';button.title=err?.message||'Download failed';}
  finally{button.dataset.loading='false';if(button.textContent==='Checking access…'||button.textContent==='Preparing download…'){button.disabled=false;button.textContent=old;}}
 }));
});