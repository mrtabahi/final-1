(async function(){
 const loading=document.getElementById('ads-admin-loading');
 const app=document.getElementById('ads-admin-app');
 const status=document.getElementById('ads-status');
 const $=id=>document.getElementById(id);
 function say(message,isError=false){status.textContent=message;status.style.color=isError?'#b91c1c':'#166534';}
 try{
   const auth=await AuthManager.requireAdminGuard();
   if(!auth)return;
   loading.hidden=true; loading.style.display='none'; app.hidden=false;
   async function load(){
     say('Loading saved settings…');
     const {data,error}=await supabaseClient.from('ad_settings').select('*').eq('id',1).maybeSingle();
     if(error)throw error;
     if(!data)throw new Error('Ad settings row missing. Contact the site administrator.');
     $('ads-global').checked=!!data.ads_enabled;
     $('ads-home').checked=!!data.home_enabled;
     $('ads-listing').checked=!!data.typing_listing_enabled;
     $('ads-materials').checked=!!data.materials_enabled;
     const radio=document.querySelector('input[name="ads-density"][value="'+data.density+'"]');
     if(radio)radio.checked=true;
     say('Saved settings loaded.');
   }
   $('ads-save').addEventListener('click',async()=>{
     $('ads-save').disabled=true;say('Saving settings…');
     try{
       const density=document.querySelector('input[name="ads-density"]:checked')?.value||'normal';
       const values={ads_enabled:$('ads-global').checked,home_enabled:$('ads-home').checked,typing_listing_enabled:$('ads-listing').checked,materials_enabled:$('ads-materials').checked,density,updated_at:new Date().toISOString()};
       const {error}=await supabaseClient.from('ad_settings').update(values).eq('id',1);
       if(error)throw error;
       say('Ad settings saved. Changes apply on the next page load; Auto ads quantity itself is managed in AdSense.');
     }catch(error){say(error.message||'Could not save settings.',true);}
     finally{$('ads-save').disabled=false;}
   });
   $('ads-refresh').addEventListener('click',()=>load().catch(e=>say(e.message,true)));
   await load();
 }catch(error){loading.innerHTML='<strong>Could not verify administrator access</strong><span>Please sign in with an administrator account, then reload this page.</span>';console.error(error);}
})();