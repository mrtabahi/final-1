/* Public-site account navigation: show Login when signed out and My Account when signed in. */
(function () {
  'use strict';
  function accountLinks() {
    return Array.from(document.querySelectorAll('a[href]')).filter(a => {
      try {
        const u = new URL(a.getAttribute('href'), window.location.origin);
        return ACCOUNT_PATHS.has(u.pathname.replace(/^.*\//, '/my_account.html')) ||
          /(^|\/)my_account\.html$/.test(u.pathname);
      } catch { return false; }
    });
  }
  function paintAvatar(link, user, profile) {
    if (!link || !user) return;
    let badge = link.querySelector('.account-nav-avatar');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'account-nav-avatar';
      badge.setAttribute('aria-hidden', 'true');
      link.prepend(badge);
    }
    const name = String(profile?.full_name || user.user_metadata?.full_name || 'User').trim();
    const initials = name.split(/\\s+/).slice(0,2).map(part => part[0] || '').join('').toUpperCase() || 'U';
    badge.replaceChildren();
    badge.textContent = initials;
    if (profile?.avatar_path && supabaseClient?.storage) {
      const { data } = supabaseClient.storage.from('profile-avatars').getPublicUrl(profile.avatar_path);
      if (data?.publicUrl) {
        const img = document.createElement('img');
        img.src = data.publicUrl; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
        img.onerror = () => { img.remove(); badge.textContent = initials; };
        badge.replaceChildren(img);
      }
    }
  }
  async function syncProfileAvatar(links, session) {
    if (!session?.user || !supabaseClient) return;
    try {
      const { data, error } = await supabaseClient.from('profiles')
        .select('full_name,avatar_path').eq('id', session.user.id).maybeSingle();
      if (error) throw error;
      links.forEach(link => paintAvatar(link, session.user, data));
    } catch (error) {
      console.debug('Profile avatar unavailable:', error?.message || error);
    }
  }
  function paint(links, signedIn) {
    for (const link of links) {
      link.querySelector('.account-nav-avatar')?.remove();\n      link.textContent = signedIn ? 'My Account' : 'Login';
      link.setAttribute('aria-label', signedIn ? 'Open your account' : 'Sign in to your account');
      link.setAttribute('href', signedIn ? '/my_account.html' : '/login.html?redirect=' + encodeURIComponent(location.pathname.replace(/^\//, '') + location.search));
      link.classList.toggle('account-nav-login', !signedIn);
      link.classList.toggle('account-nav-signed-in', signedIn);
    }
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src; script.onload = resolve; script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  async function init() {
    const links = accountLinks();
    if (!links.length) return;
    try {
      if (typeof supabaseClient === 'undefined') {
        if (typeof supabase === 'undefined') await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
        await loadScript('/js/config.js');
      }
      if (typeof supabaseClient === 'undefined' || !supabaseClient) {
        paint(links, false); return;
      }
      const { data, error } = await supabaseClient.auth.getSession();
      paint(links, !error && Boolean(data && data.session && data.session.user));
      supabaseClient.auth.onAuthStateChange((_event, session) => paint(links, Boolean(session && session.user)));
    } catch (error) {
      // Fail closed for navigation: an unreadable session should not expose a
      // private account route as the primary action.
      paint(links, false);
      console.debug('Account navigation session check unavailable:', error && error.message);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();