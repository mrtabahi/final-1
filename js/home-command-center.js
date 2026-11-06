/* Homepage PDF mini-library. Supabase RLS and material entitlements authorize every file lookup. */
document.addEventListener('DOMContentLoaded', () => {
  const panel=document.querySelector('.home-pdf-mini');
  const box=document.getElementById('home-featured-materials');
  if(!panel||!box||typeof supabaseClient==='undefined'||!supabaseClient)return;
  const message=text=>{const p=document.createElement('p');p.className='home-featured-empty';p.textContent=text;box.replaceChildren(p);};
  const setLocked=locked=>{
    panel.classList.toggle('is-locked',locked);
    const overlay=panel.querySelector('.home-pdf-lock');
    if(overlay)overlay.setAttribute('aria-hidden',String(!locked));
  };
  async function downloadMaterial(row,button){
    if(button.disabled)return;
    button.disabled=true;button.textContent='Checking…';
    try{
      const {data:item,error:itemError}=await supabaseClient.from('study_materials').select('storage_path,telegram_url').eq('id',row.id).maybeSingle();
      if(itemError)throw itemError;
      if(!item)throw new Error('This resource requires an eligible account or plan.');
      if(item.storage_path){
        const {data:signed,error}=await supabaseClient.storage.from('study-pdfs').createSignedUrl(item.storage_path,60,{download:true});
        if(error)throw error;if(!signed?.signedUrl)throw new Error('Unable to create a secure download.');
        window.location.assign(signed.signedUrl);return;
      }
      const {data:url,error}=await supabaseClient.rpc('get_material_link',{p_material_id:row.id});
      if(error)throw error;if(typeof url!=='string')throw new Error('This resource is not available.');
      const parsed=new URL(url,location.origin);if(parsed.protocol!=='https:')throw new Error('Invalid resource URL.');
      location.assign(parsed.href);
    }catch(error){
      button.textContent=error?.message?.includes('eligible')?'Plan required':'Try again';
      button.title=error?.message||'Download failed';button.disabled=false;
    }
  }
  async function load(){
    const {data:sessionData}=await supabaseClient.auth.getSession();
    if(!sessionData?.session?.user){setLocked(true);message('Sign in to unlock pinned and latest PDF downloads.');return;}
    setLocked(false);message('Loading your study resources…');
    try{
      const {data,error}=await supabaseClient.rpc('list_material_catalog');if(error)throw error;
      const rows=Array.isArray(data)?data.slice(0,3):[];
      if(!rows.length){message('No PDFs have been published yet.');return;}
      box.replaceChildren();
      rows.forEach(row=>{
        const item=document.createElement('article');item.className='home-featured-material';
        const icon=document.createElement('span');icon.className='home-featured-pdf';icon.textContent='PDF';
        const copy=document.createElement('div');copy.className='home-featured-copy';
        const title=document.createElement('strong');title.textContent=String(row.title||'Study PDF');
        const meta=document.createElement('small');meta.textContent=row.pinned?'Pinned resource':'Latest study resource';
        if(row.pinned){const pin=document.createElement('span');pin.className='home-featured-pin';pin.textContent='📌 PINNED';copy.append(title,pin,meta);}else copy.append(title,meta);
        const button=document.createElement('button');button.type='button';button.className='home-featured-open';button.textContent='Download PDF ↓';
        button.addEventListener('click',()=>downloadMaterial(row,button));
        item.append(icon,copy,button);box.append(item);
      });
    }catch(error){console.warn('Homepage PDF list unavailable:',error?.message||error);message('PDF resources are temporarily unavailable.');}
  }
  load();
  supabaseClient.auth.onAuthStateChange((_event,session)=>{if(session?.user)void load();else{setLocked(true);message('Sign in to unlock pinned and latest PDF downloads.');}});
});