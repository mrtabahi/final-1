document.addEventListener('admin-tool-ready', async () => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const form=$('material-form'), list=$('materials-admin-list'), message=$('material-message');
  const bucket=supabaseClient.storage.from('study-pdfs');
  let rows=[];
  try { const access=await AuthManager.requireAdminGuard(); if(!access?.user||!access?.profile)return; }
  catch { location.href='login.html'; return; }

  const say=(text,error=false)=>{message.textContent=text;message.classList.toggle('is-error',error);message.classList.toggle('is-success',!error);};
  function reset(){
    form.reset(); $('material-id').value=''; $('material-storage-path').value='';
    $('material-type').value='pdf'; $('material-order').value='0'; $('material-active').checked=true;
    $('material-pinned').checked=false; $('material-form-title').textContent='Upload a PDF or add a link';
    $('material-file').value=''; say('');
  }
  function validTelegramLink(value){
    if(!value)return true;
    try{const u=new URL(value);return u.protocol==='https:'&&['t.me','telegram.me'].includes(u.hostname)&&u.pathname.length>1;}
    catch{return false;}
  }
  function validPdf(file){
    if(!file)return true;
    return (file.type==='application/pdf'||/\.pdf$/i.test(file.name))&&file.size>0&&file.size<=20*1024*1024;
  }
  async function load(){
    list.innerHTML='<div class="admin-empty">Loading materials…</div>';
    const {data,error}=await supabaseClient.from('study_materials').select('*').order('pinned',{ascending:false}).order('sort_order',{ascending:true}).order('created_at',{ascending:false});
    if(error){list.innerHTML='<div class="admin-error">'+esc(error.message)+'</div>';return;}
    rows=data||[];
    if(!rows.length){list.innerHTML='<div class="admin-empty">No study materials yet. Upload your first PDF above.</div>';return;}
    list.innerHTML='<div class="materials-admin-list">'+rows.map(r=>{
      const kind=r.storage_path?'DIRECT PDF':(r.material_type==='combined_pdf'?'PDF+':r.material_type==='study_pack'?'PACK':'LINK');
      return '<article class="materials-admin-row"><div class="materials-kind">'+kind+'</div><div class="materials-admin-copy"><strong>'+esc(r.title)+(r.pinned?' <span class="material-pinned-tag">📌 PINNED</span>':'')+'</strong><p>'+esc(r.description||'No description')+'</p><small>'+(r.storage_path?'Private PDF uploaded':'Telegram link')+' · '+(r.active?'Visible to candidates':'Hidden from candidates')+'</small></div><div class="materials-admin-actions"><button type="button" class="admin-btn admin-btn-secondary" data-edit="'+esc(r.id)+'">Edit</button><button type="button" class="admin-btn admin-btn-secondary" data-pin="'+esc(r.id)+'">'+(r.pinned?'Unpin':'Pin to top')+'</button><button type="button" class="admin-btn admin-btn-secondary" data-toggle="'+esc(r.id)+'">'+(r.active?'Hide':'Publish')+'</button><button type="button" class="admin-btn admin-btn-danger" data-delete="'+esc(r.id)+'">Delete</button></div></article>';
    }).join('')+'</div>';
    list.querySelectorAll('[data-edit]').forEach(button=>button.onclick=()=>{
      const row=rows.find(x=>x.id===button.dataset.edit);if(!row)return;
      $('material-id').value=row.id;$('material-storage-path').value=row.storage_path||'';
      $('material-title').value=row.title;$('material-type').value=row.material_type;
      $('material-url').value=row.telegram_url||'';$('material-description').value=row.description||'';
      $('material-order').value=row.sort_order??0;$('material-active').checked=!!row.active;
      $('material-pinned').checked=!!row.pinned;$('material-file').value='';
      $('material-form-title').textContent='Edit material';say('');
      form.scrollIntoView({behavior:'smooth',block:'start'});
    });
    list.querySelectorAll('[data-pin]').forEach(button=>button.onclick=async()=>{
      const row=rows.find(x=>x.id===button.dataset.pin);if(!row)return;
      button.disabled=true;const {error}=await supabaseClient.from('study_materials').update({pinned:!row.pinned,updated_at:new Date().toISOString()}).eq('id',row.id);
      if(error){say(error.message,true);button.disabled=false;return;}await load();
    });
    list.querySelectorAll('[data-toggle]').forEach(button=>button.onclick=async()=>{
      const row=rows.find(x=>x.id===button.dataset.toggle);if(!row)return;
      button.disabled=true;const {error}=await supabaseClient.from('study_materials').update({active:!row.active,updated_at:new Date().toISOString()}).eq('id',row.id);
      if(error){say(error.message,true);button.disabled=false;return;}await load();
    });
    list.querySelectorAll('[data-delete]').forEach(button=>button.onclick=async()=>{
      const row=rows.find(x=>x.id===button.dataset.delete);if(!row||!confirm('Delete "'+row.title+'" and its uploaded PDF?'))return;
      button.disabled=true;
      const {error}=await supabaseClient.from('study_materials').delete().eq('id',row.id);
      if(error){say(error.message,true);button.disabled=false;return;}
      if(row.storage_path){const removed=await bucket.remove([row.storage_path]);if(removed.error)say('Material deleted; orphaned file cleanup failed: '+removed.error.message,true);}
      await load();
    });
  }

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const title=$('material-title').value.trim(),url=$('material-url').value.trim(),file=$('material-file').files?.[0]||null;
    if(!title||title.length<2){say('Enter a title with at least 2 characters.',true);return;}
    if(!validTelegramLink(url)){say('Enter a valid https://t.me/... or https://telegram.me/... link.',true);return;}
    if(!validPdf(file)){say('Choose a valid PDF file up to 20 MB.',true);return;}
    const id=$('material-id').value||crypto.randomUUID();
    const oldPath=$('material-storage-path').value||null;
    let storagePath=oldPath,uploadedPath=null;
    const button=form.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Saving…';
    try{
      if(file){
        storagePath=id+'/'+crypto.randomUUID()+'.pdf';
        const {error:uploadError}=await bucket.upload(storagePath,file,{contentType:'application/pdf',cacheControl:'3600',upsert:false});
        if(uploadError)throw uploadError;uploadedPath=storagePath;
      }
      if(!storagePath&&!url)throw new Error('Upload a PDF file or provide a Telegram link.');
      const values={
        id,title,telegram_url:url||null,storage_path:storagePath,
        material_type:$('material-type').value,description:$('material-description').value.trim(),
        sort_order:Number($('material-order').value)||0,active:$('material-active').checked,
        pinned:$('material-pinned').checked,updated_at:new Date().toISOString()
      };
      const result=$('material-id').value
        ? await supabaseClient.from('study_materials').update(values).eq('id',id)
        : await supabaseClient.from('study_materials').insert(values);
      if(result.error)throw result.error;
      if(file&&oldPath&&oldPath!==storagePath){const removed=await bucket.remove([oldPath]);if(removed.error)console.warn('Old PDF cleanup failed:',removed.error.message);}
      say(file?'PDF uploaded and material saved.':'Material saved.');
      reset();await load();
    }catch(error){
      if(uploadedPath)await bucket.remove([uploadedPath]).catch(()=>{});
      say(error?.message||'Unable to save this material.',true);
    }finally{button.disabled=false;button.textContent='Save material';}
  });
  $('material-reset').addEventListener('click',reset);
  $('material-refresh').addEventListener('click',load);
  await load();
});