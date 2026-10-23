/* Page-aware AdSense loader. Typing workspaces are deliberately not supported. */
(async function () {
  const path = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const pageKey = path === 'index.html' || path === '' ? 'home_enabled'
    : path === 'typing_test.html' ? 'typing_listing_enabled'
    : path === 'materials.html' ? 'materials_enabled' : null;
  // Only explicit content pages can ever request AdSense. Never load it on test runners.
  if (!pageKey || !window.supabaseClient) return;
  try {
    const { data, error } = await window.supabaseClient
      .from('ad_settings')
      .select('ads_enabled, home_enabled, typing_listing_enabled, materials_enabled')
      .eq('id', 1).maybeSingle();
    if (error || !data || data.ads_enabled !== true || data[pageKey] !== true) return;
    if (document.querySelector('script[data-decoding-adsense]')) return;
    const script = document.createElement('script');
    script.async = true;
    script.dataset.decodingAdsense = 'true';
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2757719583090087';
    script.crossOrigin = 'anonymous';
    document.head.appendChild(script);
  } catch (error) {
    console.warn('Ad settings unavailable; ads remain off for this page.', error);
  }
})();