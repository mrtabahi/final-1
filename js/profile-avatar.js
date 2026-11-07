/* Decoding HCM — profile avatar manager and site-wide identity decoration. */
(function () {
  'use strict';
  if (window.DHProfileAvatar) return;
  const BUCKET = 'profile-avatars';
  const MAX_BYTES = 3 * 1024 * 1024;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  let client = null, currentUser = null, currentProfile = null;
  const cacheBust = url => url ? url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now() : '';
  function avatarNode(url, name, size) {
    const wrap = document.createElement('span');
    wrap.className = 'dh-avatar';
    wrap.style.setProperty('--dh-avatar-size', (size || 40) + 'px');
    wrap.setAttribute('aria-label', (name || 'User') + ' profile photo');
    if (url) {
      const img = document.createElement('img');
      img.src = url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.onerror = () => { img.remove(); wrap.textContent = initials(name); };
      wrap.appendChild(img);
    } else wrap.textContent = initials(name);
    return wrap;
  }
  function initials(name) {
    return String(name || 'U').trim().split(/\s+/).slice(0,2).map(x => x[0] || '').join('').toUpperCase() || 'U';
  }
  function decorate(target, url, name, size, position) {
    if (!target || target.dataset.dhAvatarDecorated === '1') return;
    const node = avatarNode(url, name, size);
    target.dataset.dhAvatarDecorated = '1';
    if (position === 'inside-start') target.insertBefore(node, target.firstChild);
    else target.parentNode?.insertBefore(node, target);
  }
  function setPreview(url, name) {
    const preview = document.getElementById('profile-avatar-preview');
    if (!preview) return;
    preview.replaceChildren(avatarNode(url, name, 104));
  }
  function status(message, error) {
    const node = document.getElementById('profile-avatar-status');
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-error', !!error);
    node.classList.toggle('is-success', !error);
  }
  async function getClient() {
    if (client) return client;
    if (window.supabaseClient) client = window.supabaseClient;
    if (!client && typeof supabaseClient !== 'undefined') client = supabaseClient;
    if (!client && typeof window.supabase === 'undefined') {
      await new Promise((resolve, reject) => { const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.onload=resolve;s.onerror=reject;document.head.appendChild(s); });
    }
    if (!client) {
      await new Promise((resolve, reject) => { const s=document.createElement('script');s.src='/js/config.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s); });
      client = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);
    }
    return client;
  }
  function renderSiteIdentity() {
    if (!currentUser || !currentProfile) return;
    const url = currentProfile.avatar_url || '';
    const name = currentProfile.full_name || 'Candidate';
    document.querySelectorAll('.dh-avatar').forEach(node => {
      node.replaceChildren();
      if (url) { const img=document.createElement('img'); img.src=url; img.alt=''; img.loading='lazy'; img.decoding='async'; img.onerror=()=>{node.textContent=initials(name);}; node.appendChild(img); }
      else node.textContent=initials(name);
    });
    decorate(document.querySelector('a.account-nav-signed-in'), url, name, 28, 'inside-start');
    decorate(document.getElementById('disp-candidate-name'), url, name, 34, 'inside-start');
    const reportName = document.getElementById('res-candidate-name');
    if (reportName && reportName.closest('.result-pdf-meta')) {
      const meta = reportName.closest('.result-pdf-meta');
      if (!meta.querySelector('.dh-result-avatar-column')) {
        const col = document.createElement('div');
        col.className = 'dh-result-avatar-column';
        col.append(avatarNode(url, name, 64));
        const label = document.createElement('span'); label.textContent = 'Candidate profile'; col.append(label);
        meta.insertBefore(col, meta.firstChild);
      }
    }
    const adminAvatar = document.getElementById('admin-avatar');
    const adminTop = document.getElementById('admin-top-avatar');
    [adminAvatar, adminTop].forEach(el => {
      if (!el || el.dataset.dhAvatarDecorated === '1') return;
      el.dataset.dhAvatarDecorated = '1';
      el.replaceChildren(avatarNode(url, name, el.id === 'admin-avatar' ? 42 : 36));
    });
    const myResults = document.getElementById('my-results-identity');
    if (myResults && !myResults.dataset.dhAvatarDecorated) {
      myResults.dataset.dhAvatarDecorated = '1';
      myResults.append(avatarNode(url, name, 48));
      const copy = document.createElement('span');
      const strong = document.createElement('strong'); strong.textContent = name;
      const small = document.createElement('small'); small.textContent = 'Your profile';
      copy.append(strong, small); myResults.append(copy);
    }
  }
  function mountCropper(file, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'dh-crop-overlay';
    overlay.innerHTML = '<section class="dh-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="dh-crop-title"><header><div><small>PROFILE PHOTO</small><h2 id="dh-crop-title">Adjust your circular crop</h2></div><button type="button" class="dh-crop-close" aria-label="Close">×</button></header><p>Drag the photo to position it. Use zoom to frame your face inside the circle.</p><div class="dh-crop-stage"><canvas width="320" height="320" aria-label="Circular profile photo crop preview"></canvas><span class="dh-crop-mask" aria-hidden="true"></span></div><label class="dh-crop-zoom">Zoom <input type="range" min="1" max="3" step=".01" value="1"></label><footer><button type="button" class="dh-crop-cancel">Cancel</button><button type="button" class="dh-crop-save">Use this photo</button></footer></section>';
    document.body.appendChild(overlay);
    const canvas = overlay.querySelector('canvas'), ctx = canvas.getContext('2d');
    const zoomInput = overlay.querySelector('input[type=range]');
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    let zoom = 1, x = 0, y = 0, dragging = false, lastX = 0, lastY = 0, base = 1;
    const clamp = () => {
      const w=image.naturalWidth*base*zoom,h=image.naturalHeight*base*zoom;
      x=Math.min(0,Math.max(320-w,x)); y=Math.min(0,Math.max(320-h,y));
    };
    const draw = () => {
      if (!image.complete || !image.naturalWidth) return;
      clamp(); ctx.clearRect(0,0,320,320);
      const w=image.naturalWidth*base*zoom,h=image.naturalHeight*base*zoom;
      ctx.drawImage(image,x,y,w,h);
    };
    image.onload = () => { base=Math.max(320/image.naturalWidth,320/image.naturalHeight); x=(320-image.naturalWidth*base)/2; y=(320-image.naturalHeight*base)/2; draw(); };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); overlay.remove(); status('This image could not be opened. Try another photo.',true); };
    image.src = objectUrl;
    zoomInput.addEventListener('input',()=>{zoom=Number(zoomInput.value)||1;draw();});
    canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!dragging)return;const r=canvas.getBoundingClientRect();x+=(e.clientX-lastX)*320/r.width;y+=(e.clientY-lastY)*320/r.height;lastX=e.clientX;lastY=e.clientY;draw();});
    canvas.addEventListener('pointerup',()=>dragging=false); canvas.addEventListener('pointercancel',()=>dragging=false);
    const close=()=>{URL.revokeObjectURL(objectUrl);overlay.remove();};
    overlay.querySelector('.dh-crop-close').onclick=close;
    overlay.querySelector('.dh-crop-cancel').onclick=close;
    overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
    overlay.querySelector('.dh-crop-save').onclick=()=>{
      const output=document.createElement('canvas');output.width=512;output.height=512;
      output.getContext('2d').drawImage(canvas,0,0,512,512);
      output.toBlob(async blob=>{if(!blob){status('Could not prepare this photo. Try again.',true);return;}close();await onSave(blob);},'image/jpeg',.88);
    };
  }
  async function saveAvatar(blob) {
    const path = currentUser.id + '/avatar.jpg';
    status('Uploading and saving your profile photo…');
    const { error: uploadError } = await client.storage.from(BUCKET).upload(path, blob, { contentType:'image/jpeg', cacheControl:'3600', upsert:true });
    if (uploadError) throw uploadError;
    const url = client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    const { data, error } = await client.from('profiles').update({ avatar_url:url }).eq('id',currentUser.id).select('id,avatar_url').maybeSingle();
    if (error || !data) {
      await client.storage.from(BUCKET).remove([path]);
      throw error || new Error('Profile photo could not be saved to your account.');
    }
    currentProfile.avatar_url = cacheBust(url);
    setPreview(currentProfile.avatar_url,currentProfile.full_name);
    renderSiteIdentity();
    status('Profile photo updated successfully.');
  }
  async function deleteAvatar() {
    if (!window.confirm || !await window.confirm('Delete your profile photo? Your name and account details will remain unchanged.')) return;
    status('Removing profile photo…');
    const path=currentUser.id+'/avatar.jpg';
    const { error }=await client.from('profiles').update({avatar_url:null}).eq('id',currentUser.id);
    if(error)throw error;
    const { error: storageError }=await client.storage.from(BUCKET).remove([path]);
    if(storageError)console.warn('Avatar object cleanup failed:',storageError);
    currentProfile.avatar_url='';
    setPreview('',currentProfile.full_name);
    renderSiteIdentity();
    status('Profile photo deleted. Your account details are unchanged.');
  }
  async function init() {
    try {
      const c=await getClient(); if(!c)return;
      const {data:{user},error}=await c.auth.getUser(); if(error||!user)return;
      const {data:profile,error:profileError}=await c.from('profiles').select('id,full_name,avatar_url,role').eq('id',user.id).maybeSingle();
      if(profileError||!profile)return;
      client=c;currentUser=user;currentProfile=profile;
      renderSiteIdentity();
      const editor=document.getElementById('profile-avatar-editor');
      if(editor){
        setPreview(profile.avatar_url||'',profile.full_name||'Candidate');
        document.getElementById('profile-avatar-change')?.addEventListener('click',()=>document.getElementById('profile-avatar-input')?.click());
        document.getElementById('profile-avatar-input')?.addEventListener('change',e=>{
          const file=e.target.files?.[0];e.target.value='';if(!file)return;
          if(!/^image\/(jpeg|png|webp)$/.test(file.type)){status('Choose a JPG, PNG or WebP image.',true);return;}
          if(file.size>MAX_BYTES){status('Photo must be 3 MB or smaller.',true);return;}
          mountCropper(file,async blob=>{try{await saveAvatar(blob);}catch(err){console.error(err);status(err.message||'Photo upload failed. Please try again.',true);}});
        });
        document.getElementById('profile-avatar-delete')?.addEventListener('click',async()=>{try{await deleteAvatar();}catch(err){console.error(err);status(err.message||'Could not delete the photo.',true);}});
      }
    } catch(error) { console.debug('Profile avatar unavailable:',error?.message||error); }
  }
  window.DHProfileAvatar = { init, getProfile:()=>currentProfile, refresh:renderSiteIdentity, avatarNode };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();