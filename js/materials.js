document.addEventListener('DOMContentLoaded', async () => {
  const box=document.getElementById('materials-list');
  const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const status=await AuthManager.requireCandidateGuard();if(!status?.ok)return;
  const {data,error}=await supabaseClient.rpc('list_material_catalog');
  if(error){box.innerHTML='<div class="loading-card">Unable to load materials. Please refresh and try again.</div>';console.error(error);return;}
  if(!data?.length){box.innerHTML='<div class="loading-card">No materials have been published yet. Check back soon.</div>';return;}
  const typeLabel=type=>type==='combined_pdf'?'Combined PDF':type==='study_pack'?'Study pack':'PDF';
  box.innerHTML=data.map(row=>'<article class="material-card '+(row.pinned?'material-card-pinned':'')+'"><div class="material-card-icon" aria-hidden="true">'+(row.material_type==='study_pack'?'▤':'PDF')+'</div><div class="material-card-copy"><span class="material-type-label">'+esc(typeLabel(row.material_type))+'</span>'+(row.pinned?'<span class="material-pinned-tag">📌 PINNED</span>':'')+'<h2>'+esc(row.title)+'</h2><p>'+esc(row.description||'Open this study resource.')+'</p><button data-access-key="feature:'+esc(row.id)+'" data-material-id="'+esc(row.id)+'" class="btn btn-primary" type="button">'+(row.material_type==='study_pack'?'Open study pack':'Download PDF')+' ↓</button></div></article>').join('');
  box.querySelectorAll('[data-material-id]').forEach(button=>button.addEventListener('click',async()=>{
    if(button.disabled)return;button.disabled=true;const old=button.textContent;button.textContent='Checking access…';
    try{
      const {data:item,error:itemError}=await supabaseClient.from('study_materials').select('storage_path,telegram_url,title').eq('id',button.dataset.materialId).maybeSingle();
      if(itemError)throw itemError;
      if(!item)throw new Error('This material is not included in your account access.');
      if(item.storage_path){
        const {data:signed,error:signedError}=await supabaseClient.storage.from('study-pdfs').createSignedUrl(item.storage_path,60,{download:true});
        if(signedError)throw signedError;if(!signed?.signedUrl)throw new Error('Download link could not be created.');
        window.location.assign(signed.signedUrl);return;
      }
      const {data:url,error:linkError}=await supabaseClient.rpc('get_material_link',{p_material_id:button.dataset.materialId});
      if(linkError)throw linkError;if(typeof url!=='string')throw new Error('This resource is not available to your account.');
      const parsed=new URL(url,window.location.origin);if(parsed.protocol!=='https:')throw new Error('The resource link is not secure.');
      window.location.assign(parsed.href);
    }catch(err){console.error(err);button.textContent=err?.message?.includes('access')?'Upgrade required':'Unable to download';button.title=err?.message||'Could not download';button.disabled=false;return;}
    button.textContent=old;button.disabled=false;
  }));
});