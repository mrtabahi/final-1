/* Public-site account navigation and signed-in profile avatar. */
(function () {
  'use strict';
  const accountLinks = () => Array.from(document.querySelectorAll('a[href]')).filter(link => {
    try { return /(^|\\/)my_account\\.html$/.test(new URL(link.getAttribute('href'), location.origin).pathname); }
    catch { return false; }
  });
  function paint(links, signedIn) {
    links.forEach(link => {
      link.textContent = signedIn ? 'My Account' : 'Login';
      link.setAttribute('aria-label', signedIn ? 'Open your account' : 'Sign in to your account');
      link.setAttribute('href', signedIn ? '/my_account.html' : '/login.html?redirect=' + encodeURIComponent(location.pathname.replace(/^\\//, '') + location.search));
      link.classList.toggle('account-nav-login', !signedIn);
      link.classList.toggle('account-nav-signed-in', signedIn);
    });
  }
  async function syncAvatar(links, session) {
    if (!session?.user || !window.supabaseClient) return;
    try {
      const { data, error } = await supabaseClient.from('profiles')
        .select('full_name,avatar_path').eq('id', session.user.id).maybeSingle();
      if (error) throw error;
      const name = String(data?.full_name || session.user.user_metadata?.full_name || 'User').trim();
      const initials = name.split(/\\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase() || 'U';
      let url = null;
      if (data?.avatar_path) url = supabaseClient.storage.from('profile-avatars').getPublicUrl(data.avatar_path).data?.publicUrl || null;
      links.forEach(link => {
        let avatar = link.querySelector('.account-nav-avatar');
        if (!avatar) { avatar = document.createElement('span'); avatar.className = 'account-nav-avatar'; link.prepend(avatar); }
        avatar.replaceChildren(); avatar.textContent = initials;
        if (url) {
          const img = document.createElement('img'); img.src = url + '?v=' + Date.now(); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
          img.onerror = () => { img.remove(); avatar.textContent = initials; };
          avatar.replaceChildren(img);
        }
      });
    } catch (error) { console.debug('Profile avatar unavailable:', error?.message || error); }
  }
  async function init() {
    const links = accountLinks(); if (!links.length) return;
    try {
      if (!window.supabaseClient) {
        if (!window.supabase) await new Promise((resolve, reject) => {
          const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
          script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
        });
        await new Promise((resolve, reject) => {
          const script = document.createElement('script'); script.src = '/js/config.js';
          script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
        });
      }
      if (!window.supabaseClient) { paint(links, false); return; }
      const { data, error } = await supabaseClient.auth.getSession();
      const session = !error ? data?.session : null;
      paint(links, Boolean(session?.user));
      if (session?.user) await syncAvatar(links, session);
      supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
        paint(links, Boolean(nextSession?.user));
        if (nextSession?.user) void syncAvatar(links, nextSession);
      });
      window.addEventListener('profile-avatar-updated', () => void syncAvatar(links, { user: data?.session?.user }));
    } catch (error) {
      paint(links, false); console.debug('Account navigation session check unavailable:', error?.message || error);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
