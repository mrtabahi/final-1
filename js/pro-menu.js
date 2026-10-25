/* Candidate Pro access + responsive navigation enhancement. */
(() => {
  'use strict';
  const permissionKeys = ['folder_tests','results_attempts','study_materials','website_content','website_settings'];
  let refreshInProgress = false;

  const syncProMenu = async () => {
    if (refreshInProgress) return;
    if (typeof supabaseClient === 'undefined' || !supabaseClient || typeof AuthManager === 'undefined') return;
    refreshInProgress = true;
    try {
      const auth = await AuthManager.isVerifiedCandidate();
      const nav = document.querySelector('.navbar');
      const links = nav?.querySelector('.nav-links');
      if (!links) return;
      if (!auth?.ok) {
        links.querySelector('.pro-nav-item')?.remove();
        return;
      }
      const { data, error } = await supabaseClient
        .from('candidate_permissions')
        .select('permissions')
        .eq('user_id', auth.user.id)
        .maybeSingle();
      if (error) throw error;
      const permissions = data?.permissions || {};
      const granted = permissionKeys.some(key => permissions[key] === true);
      let item = links.querySelector('.pro-nav-item');
      if (!granted) {
        item?.remove();
        return;
      }
      if (!item) {
        item = document.createElement('li');
        item.className = 'pro-nav-item';
        const link = document.createElement('a');
        link.href = 'candidate-workspace.html';
        link.className = 'pro-nav-link';
        link.innerHTML = '<span aria-hidden="true"><img src="/logo.png" alt="" width="18" height="18"></span><span>Pro</span>';
        link.setAttribute('aria-label', 'Pro workspace — your assigned permissions');
        item.appendChild(link);
        const account = links.querySelector('.account-nav-item');
        if (account) links.insertBefore(item, account);
        else links.appendChild(item);
      }
    } catch (err) {
      console.warn('Could not refresh Pro navigation permissions:', err);
    } finally {
      refreshInProgress = false;
    }
  };

  const init = () => {
    const nav = document.querySelector('.navbar');
    const links = nav?.querySelector('.nav-links');
    if (!nav || !links) return;

    if (!nav.querySelector('.nav-menu-toggle')) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'nav-menu-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-controls', 'site-navigation-links');
      toggle.setAttribute('aria-label', 'Open navigation menu');
      toggle.innerHTML = '<span aria-hidden="true">☰</span><span class="nav-menu-toggle-label">Menu</span>';
      links.id = 'site-navigation-links';
      nav.insertBefore(toggle, links);
      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
        links.classList.toggle('nav-links-open', open);
        toggle.querySelector('[aria-hidden="true"]').textContent = open ? '✕' : '☰';
      });
      links.addEventListener('click', e => {
        if (e.target.closest('a')) {
          links.classList.remove('nav-links-open');
          toggle.setAttribute('aria-expanded', 'false');
          toggle.setAttribute('aria-label', 'Open navigation menu');
          toggle.querySelector('[aria-hidden="true"]').textContent = '☰';
        }
      });
    }

    // Initial load, return-to-tab, and periodic sync ensure newly granted/revoked access appears promptly.
    syncProMenu();
    window.addEventListener('focus', syncProMenu);
    window.addEventListener('pageshow', syncProMenu);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') syncProMenu();
    });
    window.setInterval(syncProMenu, 30000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
