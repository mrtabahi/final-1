/* Page-aware AdSense loader. Paid members and active typing workspaces are excluded. */
(async function () {
  const path = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const pageKey = path === 'index.html' || path === ''
    ? 'home_enabled'
    : path === 'typing_test.html'
      ? 'typing_listing_enabled'
      : path === 'materials.html'
        ? 'materials_enabled'
        : null;

  // Only explicit content pages can request ads. Never load on test runners.
  if (!pageKey || typeof supabaseClient === 'undefined' || !supabaseClient) return;

  try {
    // Respect the Admin Panel's master switch and page-level placement switches first.
    const { data: settings, error: settingsError } = await supabaseClient
      .from('ad_settings')
      .select('ads_enabled, home_enabled, typing_listing_enabled, materials_enabled')
      .eq('id', 1)
      .maybeSingle();
    if (settingsError || !settings || settings.ads_enabled !== true || settings[pageKey] !== true) return;

    // Visitors without an account are treated as Free. For signed-in users, use the
    // server-owned subscription entitlement RPC (never user-editable profile metadata).
    const { data: authData, error: authError } = await supabaseClient.auth.getUser();
    if (authError) return;
    const user = authData?.user || null;
    if (user) {
      const { data: hasPaid, error: entitlementError } = await supabaseClient
        .rpc('has_active_paid_subscription');
      // Fail closed: if membership cannot be checked, do not show an ad.
      if (entitlementError || hasPaid === true || hasPaid !== false) return;
    }

    if (document.querySelector('script[data-decoding-adsense]')) return;
    const script = document.createElement('script');
    script.async = true;
    script.dataset.decodingAdsense = 'true';
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2757719583090087';
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
  } catch (error) {
    // Any settings/auth/entitlement uncertainty must leave ads disabled.
    console.warn('Ad eligibility could not be verified; ads remain off for this page.', error);
  }
})();
