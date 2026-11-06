document.addEventListener('DOMContentLoaded',async()=>{
 const $=id=>document.getElementById(id);
 const status=await AuthManager.requireCandidateGuard();if(!status?.ok)return;
 const {user,profile}=status;const msg=$('profile-message');
 const say=(text,isError=false)=>{msg.textContent=text;msg.classList.toggle('is-error',isError);msg.classList.toggle('is-success',!isError)};
 $('profile-name').value=profile.full_name||'';$('profile-phone').value=profile.phone||'';
 $('profile-email').value=user.email||profile.email||'';$('profile-status').value=profile.phone_verified?'Verified':'Verification required';
 $('account-logout-btn')?.addEventListener('click',async e=>{e.preventDefault();try{await AuthManager.logout()}catch(err){console.error(err);say('Logout failed. Please try again.',true)}});
 $('cancel-password-btn')?.addEventListener('click',()=>{ $('password-form').reset(); say('Password change cancelled.'); });
 $('profile-form').addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.currentTarget.querySelector('[type="submit"]');
  const name=$('profile-name').value.trim(),email=$('profile-email').value.trim().toLowerCase();
  if(!name||!email){say('Please enter your name and email.',true);return}
  btn.disabled=true;say('Saving profile…');
  try{await AuthManager.updateName(name);if(email!==String(user.email||'').trim().toLowerCase()){await AuthManager.changeEmail(email);say('Name saved. Check your email for the confirmation link.')}else say('Profile updated successfully.')}
  catch(err){console.error(err);say(err.message||'Profile update failed.',true)}finally{btn.disabled=false}
 });
 $('password-form').addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.currentTarget.querySelector('[type="submit"]'),password=$('new-password').value;
  if(!password){say('Please enter a new password.',true);return}
  btn.disabled=true;say('Changing password…');
  try{await AuthManager.changePassword(password);e.currentTarget.reset();say('Password changed successfully.')}
  catch(err){console.error(err);say(err.message||'Password change failed.',true)}finally{btn.disabled=false}
 });
 // Profile photo upload with client-side circular crop and owner-scoped Storage paths.
 const avatarFile=$('profile-avatar-file'), avatarPreview=$('profile-avatar-current');
 const avatarMessage=$('profile-avatar-message'), cropModal=$('avatar-crop-modal');
 const cropCanvas=$('avatar-crop-canvas'), cropCtx=cropCanvas?.getContext('2d');
 const zoom=$('avatar-crop-zoom'), saveAvatar=$('avatar-crop-save');
 let avatarPath=null, sourceImage=null, sourceObjectUrl=null;
 try { const {data:avatarData,error:avatarError}=await supabaseClient.from('profiles').select('avatar_path').eq('id',user.id).maybeSingle(); if(!avatarError) avatarPath=avatarData?.avatar_path||null; } catch {}
 let crop={x:0,y:0,zoom:1,base:1,dragging:false,lastX:0,lastY:0};
 const initials=name=>String(name||'User').trim().split(' ').filter(Boolean).slice(0,2).map(v=>v[0]||'').join('').toUpperCase()||'U';
 const avatarSay=(text,isError=false)=>{if(!avatarMessage)return;avatarMessage.textContent=text;avatarMessage.classList.toggle('is-error',isError);avatarMessage.classList.toggle('is-success',!isError)};
 const renderAvatar=path=>{
   if(!avatarPreview)return;
   avatarPreview.replaceChildren();avatarPreview.textContent=initials(profile.full_name);
   if(path){
     const {data}=supabaseClient.storage.from('profile-avatars').getPublicUrl(path);
     if(data?.publicUrl){const img=document.createElement('img');img.src=data.publicUrl+'?v='+Date.now();img.alt='Your profile photo';img.onerror=()=>{img.remove();avatarPreview.textContent=initials(profile.full_name)};avatarPreview.replaceChildren(img);}
   }
 };
 renderAvatar(avatarPath);
 const drawCrop=()=>{
   if(!sourceImage||!cropCtx)return;
   const size=cropCanvas.width, scale=crop.base*crop.zoom;
   cropCtx.clearRect(0,0,size,size);cropCtx.fillStyle='#e8edf5';cropCtx.fillRect(0,0,size,size);
   cropCtx.save();cropCtx.beginPath();cropCtx.arc(size/2,size/2,size/2,0,Math.PI*2);cropCtx.clip();
   cropCtx.drawImage(sourceImage,crop.x,crop.y,sourceImage.width*scale,sourceImage.height*scale);
   cropCtx.restore();
 };
 const openCrop=()=>{cropModal.hidden=false;drawCrop();$('avatar-crop-close')?.focus()};
 const closeCrop=()=>{cropModal.hidden=true;sourceImage?.close?.();sourceImage=null;if(sourceObjectUrl){URL.revokeObjectURL(sourceObjectUrl);sourceObjectUrl=null;}if(avatarFile)avatarFile.value='';};
 const fileLooksValid=async file=>{
   if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Only JPG, PNG and WebP images are allowed.');
   if(file.size>2*1024*1024)throw new Error('Please choose an image smaller than 2 MB.');
   const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
   const jpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
   const png=bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47;
   const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
   if(!(jpeg||png||webp))throw new Error('The selected file is not a valid JPG, PNG or WebP image.');
 };
 avatarFile?.addEventListener('change',async()=>{
   const file=avatarFile.files?.[0];if(!file)return;
   try{
     await fileLooksValid(file);
     sourceObjectUrl=URL.createObjectURL(file);
     sourceImage=await createImageBitmap(file);
     if(sourceImage.width<96||sourceImage.height<96)throw new Error('Choose an image at least 96 × 96 pixels.');
     if(sourceImage.width>6000||sourceImage.height>6000)throw new Error('Image dimensions must be 6000 × 6000 pixels or smaller.');
     crop.base=Math.max(320/sourceImage.width,320/sourceImage.height);
     crop.zoom=1;zoom.value='1';
     crop.x=(320-sourceImage.width*crop.base)/2;
     crop.y=(320-sourceImage.height*crop.base)/2;
     openCrop();
   }catch(err){avatarSay(err.message||'Could not open this image.',true);if(sourceObjectUrl)URL.revokeObjectURL(sourceObjectUrl);sourceObjectUrl=null;sourceImage=null;avatarFile.value='';}
 });
 zoom?.addEventListener('input',()=>{
   const oldScale=crop.base*crop.zoom, center=160;
   const imageX=(center-crop.x)/oldScale,imageY=(center-crop.y)/oldScale;
   crop.zoom=Number(zoom.value);
   const newScale=crop.base*crop.zoom;
   crop.x=center-imageX*newScale;crop.y=center-imageY*newScale;drawCrop();
 });
 const point=e=>{const rect=cropCanvas.getBoundingClientRect();return {x:(e.clientX-rect.left)*cropCanvas.width/rect.width,y:(e.clientY-rect.top)*cropCanvas.height/rect.height}};
 cropCanvas?.addEventListener('pointerdown',e=>{crop.dragging=true;crop.lastX=point(e).x;crop.lastY=point(e).y;cropCanvas.setPointerCapture(e.pointerId)});
 cropCanvas?.addEventListener('pointermove',e=>{if(!crop.dragging)return;const p=point(e);crop.x+=p.x-crop.lastX;crop.y+=p.y-crop.lastY;crop.lastX=p.x;crop.lastY=p.y;drawCrop()});
 ['pointerup','pointercancel','lostpointercapture'].forEach(type=>cropCanvas?.addEventListener(type,()=>crop.dragging=false));
 $('avatar-crop-close')?.addEventListener('click',closeCrop);$('avatar-crop-cancel')?.addEventListener('click',closeCrop);
 cropModal?.addEventListener('click',e=>{if(e.target===cropModal)closeCrop()});
 saveAvatar?.addEventListener('click',async()=>{
   if(!sourceImage||!cropCtx)return;
   saveAvatar.disabled=true;avatarSay('Preparing your profile photo…');
   let uploadedPath=null;
   try{
     const out=document.createElement('canvas');out.width=512;out.height=512;
     const ctx=out.getContext('2d');ctx.save();ctx.beginPath();ctx.arc(256,256,256,0,Math.PI*2);ctx.clip();
     const scale=(crop.base*crop.zoom)*1.6;
     ctx.drawImage(sourceImage,crop.x*1.6,crop.y*1.6,sourceImage.width*scale,sourceImage.height*scale);ctx.restore();
     const blob=await new Promise((resolve,reject)=>out.toBlob(v=>v?resolve(v):reject(new Error('Image processing failed.')),'image/webp',.86));
     const {data:{user:currentUser},error:userError}=await supabaseClient.auth.getUser();if(userError||!currentUser)throw new Error('Please sign in again.');
     uploadedPath=currentUser.id+'/'+crypto.randomUUID()+'.webp';
     const {error:uploadError}=await supabaseClient.storage.from('profile-avatars').upload(uploadedPath,blob,{contentType:'image/webp',upsert:false,cacheControl:'31536000'});
     if(uploadError)throw uploadError;
     const {data:updateData,error:updateError}=await supabaseClient.from('profiles').update({avatar_path:uploadedPath}).eq('id',currentUser.id).select('id').maybeSingle();
     if(updateError||!updateData)throw updateError||new Error('Profile photo could not be saved. Check your account permissions.');
     const previous=avatarPath;avatarPath=uploadedPath;profile.avatar_path=uploadedPath;renderAvatar(avatarPath);
     if(previous)void supabaseClient.storage.from('profile-avatars').remove([previous]);
     closeCrop();avatarSay('Profile photo updated successfully.');
     window.dispatchEvent(new CustomEvent('profile-avatar-updated'));
   }catch(err){
     if(uploadedPath)await supabaseClient.storage.from('profile-avatars').remove([uploadedPath]).catch(()=>{});
     console.error('Avatar save failed:',err);avatarSay(err.message||'Could not save profile photo.',true);
   }finally{saveAvatar.disabled=false;}
 });
 $('profile-avatar-remove')?.addEventListener('click',async()=>{
   if(!avatarPath){avatarSay('No profile photo to remove.');return;}
   if(!await window.confirm('Remove your profile photo? Your initials will be shown instead.'))return;
   const btn=$('profile-avatar-remove');btn.disabled=true;avatarSay('Removing profile photo…');
   try{
     const {data:{user:currentUser},error:userError}=await supabaseClient.auth.getUser();if(userError||!currentUser)throw new Error('Please sign in again.');
     const old=avatarPath;
     const {data,error}=await supabaseClient.from('profiles').update({avatar_path:null}).eq('id',currentUser.id).select('id').maybeSingle();
     if(error||!data)throw error||new Error('Could not update your profile.');
     avatarPath=null;profile.avatar_path=null;renderAvatar(null);
     const {error:removeError}=await supabaseClient.storage.from('profile-avatars').remove([old]);
     if(removeError)console.warn('Old avatar cleanup pending:',removeError.message);
     avatarSay('Profile photo removed. Your initials are now displayed.');
     window.dispatchEvent(new CustomEvent('profile-avatar-updated'));
   }catch(err){avatarSay(err.message||'Could not remove profile photo.',true)}
   finally{btn.disabled=false;}
 });

});