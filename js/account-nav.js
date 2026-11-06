/* Public-site account navigation and signed-in profile avatar. */
(function () {
  'use strict';
  const accountLinks = () => Array.from(document.querySelectorAll('a[href]')).filter(link => {
    try { const path = new URL(link.getAttribute('href'), location.origin).pathname; return path === '/my_account.html' || path === 'my_account.html'; }
    catch { return false; }
  });
  function paint(links, signedIn) {
    links.forEach(link => {
      link.querySelector('.account-nav-avatar')?.remove();
      link.textContent = signedIn ? 'My Account' : 'Login';
      link.setAttribute('aria-label', signedIn ? 'Open your account' : 'Sign in to your account');
      link.setAttribute('href', signedIn ? '/my_account.html' : '/login.html?redirect=' + encodeURIComponent(location.pathname.slice(1) + location.search));
      link.classList.toggle('account-nav-login', !signedIn);
      link.classList.toggle('account-nav-signed-in', signedIn);
    });
  }
  function installAvatarStyles() {
    if (document.getElementById('profile-avatar-global-styles')) return;
    const style = document.createElement('style'); style.id = 'profile-avatar-global-styles';
    style.textContent = '.account-nav-signed-in{display:inline-flex!important;align-items:center;gap:7px}.account-nav-avatar{width:30px;height:30px;display:inline-grid;place-items:center;flex:0 0 30px;overflow:hidden;border-radius:50%;background:#e6edff;color:#2449a4;font-size:.72rem;font-weight:800}.account-nav-avatar img{width:100%;height:100%;object-fit:cover}';
    document.head.appendChild(style);
  }
  async function syncAvatar(links, session) {
    if (!session || !session.user || typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try {
      const { data, error } = await supabaseClient.from('profiles').select('full_name,avatar_path').eq('id', session.user.id).maybeSingle();
      if (error) throw error;
      const name = String(data && data.full_name || session.user.user_metadata && session.user.user_metadata.full_name || 'User').trim();
      const initials = name.split(' ').filter(Boolean).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase() || 'U';
      let url = null;
      if (data && data.avatar_path) url = supabaseClient.storage.from('profile-avatars').getPublicUrl(data.avatar_path).data.publicUrl || null;
      links.forEach(link => {
        let avatar = link.querySelector('.account-nav-avatar');
        if (!avatar) { avatar = document.createElement('span'); avatar.className = 'account-nav-avatar'; link.prepend(avatar); }
        avatar.replaceChildren(); avatar.textContent = initials;
        if (url) {
          const img = document.createElement('img'); img.src = url; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
          img.onerror = () => { img.remove(); avatar.textContent = initials; }; avatar.replaceChildren(img);
        }
      });
    } catch (error) { console.debug('Profile avatar unavailable:', error && error.message || error); }
  }
  async function init() {
    installAvatarStyles();
    const links = accountLinks(); if (!links.length) return;
    try {
      if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        if (typeof supabase === 'undefined') await new Promise((resolve, reject) => { const script=document.createElement('script'); script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'; script.onload=resolve; script.onerror=reject; document.head.appendChild(script); });
        await new Promise((resolve, reject) => { const script=document.createElement('script'); script.src='/js/config.js'; script.onload=resolve; script.onerror=reject; document.head.appendChild(script); });
      }
      if (typeof supabaseClient === 'undefined' || !supabaseClient) { paint(links, false); return; }
      const { data, error } = await supabaseClient.auth.getSession();
      const session = !error && data ? data.session : null;
      paint(links, Boolean(session && session.user));
      if (session && session.user) await syncAvatar(links, session);
      supabaseClient.auth.onAuthStateChange((_event, nextSession) => { paint(links, Boolean(nextSession && nextSession.user)); if (nextSession && nextSession.user) void syncAvatar(links, nextSession); });
      window.addEventListener('profile-avatar-updated', async () => { const latest=await supabaseClient.auth.getSession(); if (latest.data && latest.data.session) void syncAvatar(links, latest.data.session); });
    } catch (error) { paint(links, false); console.debug('Account navigation session check unavailable:', error && error.message || error); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();