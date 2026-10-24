/* Candidate Pro access + responsive navigation enhancement. */
(() => {
  'use strict';
  const init = async () => {
    const nav = document.querySelector('.navbar');
    const links = nav?.querySelector('.nav-links');
    if (!nav || !links) return;

    // Add an accessible mobile menu toggle without changing desktop navigation.
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

    // Pro is only shown when the signed-in candidate has at least one granted feature.
    try {
      if (!window.supabaseClient || !window.AuthManager) return;
      const auth = await AuthManager.isVerifiedCandidate();
      if (!auth?.ok) return;
      const { data, error } = await supabaseClient
        .from('candidate_permissions')
        .select('permissions')
        .eq('user_id', auth.user.id)
        .maybeSingle();
      if (error) throw error;
      const p = data?.permissions || {};
      const granted = ['folder_tests','results_attempts','study_materials','website_content','website_settings']
        .some(key => p[key] === true);
      if (!granted || links.querySelector('.pro-nav-item')) return;
      const item = document.createElement('li');
      item.className = 'pro-nav-item';
      const link = document.createElement('a');
      link.href = 'candidate-workspace.html';
      link.className = 'pro-nav-link';
      link.innerHTML = '<span aria-hidden="true">✦</span><span>Pro</span><span class="pro-nav-badge">ACCESS</span>';
      link.setAttribute('aria-label', 'Pro workspace — your assigned permissions');
      item.appendChild(link);
      const account = links.querySelector('.account-nav-item');
      if (account) links.insertBefore(item, account);
      else links.appendChild(item);
    } catch (err) {
      console.warn('Could not load Pro navigation permissions:', err);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();