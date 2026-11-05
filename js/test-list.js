document.addEventListener('DOMContentLoaded', async () => {
  const box = document.getElementById('test-list');
  const title = document.getElementById('folder-title');
  const description = document.getElementById('folder-description');
  const params = new URLSearchParams(location.search);
  const folderId = params.get('folder');
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const status = await AuthManager.requireCandidateGuard();
  if (!status?.ok) return;
  document.getElementById('logout-btn')?.addEventListener('click', async event => {
    event.preventDefault();
    try { await AuthManager.logout(); } catch (error) { console.error(error); alert('Logout failed. Please try again.'); }
  });
  if (!folderId) { title.textContent = 'Choose a category first'; box.innerHTML = '<div class="loading-card">Please return to <a href="Typing_test.html">Typing Tests</a> and choose a category.</div>'; return; }
  try {
    const [folderResult, testsResult, accessResult] = await Promise.all([
      supabaseClient.from('folders').select('id,name,description').eq('id', folderId).eq('active', true).single(),
      supabaseClient.rpc('list_test_catalog', {p_folder_id: folderId}),
      supabaseClient.from('feature_access_rules').select('resource_type,resource_key,is_free,upgrade_message').eq('resource_type', 'test')
    ]);
    if (folderResult.error) throw folderResult.error;
    if (testsResult.error) throw testsResult.error;
    if (accessResult.error) throw accessResult.error;
    const accessRules = new Map((accessResult.data || []).map(rule => [String(rule.resource_key), rule]));
    const sessionResult = await supabaseClient.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    const currentUser = sessionResult.data?.session?.user;
    let premium = false;
    if (currentUser) {
      const entitlement = await supabaseClient.rpc('has_active_paid_subscription');
      if (entitlement.error) throw entitlement.error;
      premium = entitlement.data === true;
    }
    title.textContent = folderResult.data.name;
    description.textContent = folderResult.data.description || 'Select a test below to begin.';
    const tests = testsResult.data || [];
    if (!tests.length) { box.innerHTML = '<div class="loading-card">No active tests are available in this category yet.</div>'; return; }
    box.innerHTML = tests.map((test, index) => {
      const accessRule = accessRules.get(String(test.id));
      const requiresUpgrade = accessRule && !accessRule.is_free && !premium;
      return `
      <article class="test-row" data-test-id="${esc(test.id)}" data-folder-id="${esc(test.folder_id || "")}">
        <div class="test-number">${String(index + 1).padStart(2, '0')}</div>
        <div class="test-row-copy"><h2>${esc(test.title)}</h2><p>${esc(test.language || 'English')} · ${esc(test.mode === 'page' ? 'Off-screen' : 'On-screen')} practice</p></div>
        <div class="test-meta"><span>◷ ${esc(test.duration_minutes ?? '—')} min</span><span>⌨ ${test.target_wpm == null ? 'Target not set' : esc(test.target_wpm) + ' WPM'}</span><span>✓ ${test.min_accuracy == null ? 'Accuracy not set' : esc(test.min_accuracy) + '% target'}</span></div>
        <a class="btn btn-primary test-start${requiresUpgrade ? ' feature-upgrade-button' : ''}" data-test-start data-test-id="${esc(test.id)}" data-access-key="test:${esc(test.id)}" href="${requiresUpgrade ? '#' : 'start_test.html?test=' + encodeURIComponent(String(test.id))}"${requiresUpgrade ? ' aria-label="Upgrade to unlock this paid test"' : ''}>${requiresUpgrade ? 'UPGRADE ✦' : 'Start →'}</a>
      </article>`;
    }).join('');
  } catch (error) {
    console.error('Unable to load selected folder tests:', error);
    title.textContent = 'Unable to load tests';
    box.innerHTML = '<div class="loading-card">Could not load this category. Please refresh or go back to Typing Tests.</div>';
  }
});