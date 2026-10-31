/* Admin-selected typing interface preference. Presentation only; never changes scoring or timers. */
(() => {
  'use strict';
  const path = String(location.pathname || '').toLowerCase();
  const activity = path.endsWith('self-test.html') ? 'self-test' :
    path.endsWith('fix-accuracy.html') ? 'fix-accuracy' :
    path.endsWith('start_test.html') ? 'exam' : null;
  if (!activity) return;
  const allowed = new Set(['master', 'screen', 'pdf']);
  const publish = value => {
    // Fix Accuracy has its own game workspace and does not support the legacy PDF/Screen layout.
    const selected = activity === 'fix-accuracy' ? 'master' : (allowed.has(value) ? value : 'master');
    document.documentElement.dataset.typingActivity = activity;
    document.documentElement.dataset.typingInterface = selected;
    window.dispatchEvent(new CustomEvent('typing-interface-preference-ready', {
      detail: { activity, preference: selected }
    }));
  };
  async function load() {
    try {
      if (typeof supabaseClient === 'undefined' || !supabaseClient) return publish('master');
      const { data, error } = await supabaseClient
        .from('site_experience_settings')
        .select('typing_interface_preferences')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      const prefs = data?.typing_interface_preferences;
      const override = prefs?.overrides?.[activity];
      publish(allowed.has(override) ? override : (allowed.has(prefs?.default) ? prefs.default : 'master'));
    } catch (error) {
      // Missing migration, network, or permissions must never block a typing test.
      console.warn('Typing interface preference unavailable; using Master Interface.', error?.message || error);
      publish('master');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();
