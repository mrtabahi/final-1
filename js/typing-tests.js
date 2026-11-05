document.addEventListener('DOMContentLoaded', async () => {
  const box = document.getElementById('folder-list');
  if (!box) return;
  const CACHE_KEY = 'decoding-hcm:typing-categories:v2';
  const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const symbols = ['⌨️','📝','🎯','⚡','📚','🏆','🌐','📖'];
  const chooseSymbol = name => {
    const value = String(name || '').toLowerCase();
    if (value.includes('daily')) return '📅';
    if (value.includes('bsf') || value.includes('hcm')) return '🛡️';
    if (value.includes('basic')) return '⌨️';
    if (value.includes('special')) return '🎯';
    if (value.includes('live')) return '⚡';
    if (value.includes('target')) return '🏆';
    if (value.includes('hindi')) return 'अ';
    if (value.includes('english')) return 'A';
    return symbols[(value.length + (value.charCodeAt(0) || 0)) % symbols.length] || '⌨️';
  };
  function readCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!parsed || !Array.isArray(parsed.folders) || !Number.isFinite(parsed.savedAt) || Date.now()-parsed.savedAt>CACHE_MAX_AGE) return null;
      return parsed.folders.filter(folder => folder && typeof folder.id==='string' && typeof folder.name==='string' && Number.isFinite(folder.count) && folder.count>0);
    } catch { return null; }
  }
  function renderCategories(folders, refreshing=false) {
    const selfTestCard = `<a class="category-card category-card-self" href="self-test.html"><div class="category-thumb"><img src="self-test-thumbnail.jpg" alt="" loading="lazy"></div><div class="category-copy"><h2>Self Test</h2><p>Paste your own passage, set a timer and practise with your preferred controls.</p><div class="category-foot"><span>Start personal practice <span aria-hidden="true">→</span></span><span class="category-count">Custom text</span></div></div></a>`;
    const cards = folders.map(folder => `<a class="category-card" data-folder-id="${esc(folder.id)}" href="test-list.html?folder=${encodeURIComponent(String(folder.id))}"><div class="category-thumb" aria-hidden="true">${folder.thumbnail_url ? `<img src="${esc(folder.thumbnail_url)}" alt="" loading="lazy">` : `<span class="category-symbol">${esc(chooseSymbol(folder.name))}</span>`}</div><div class="category-copy"><h2>${esc(folder.name)}</h2><p>${esc(folder.description || 'Practice typing with a set of guided tests.')}</p><div class="category-foot"><span>Explore tests <span aria-hidden="true">→</span></span><span class="category-count">${folder.count} ${folder.count===1?'test':'tests'}</span></div></div></a>`).join('');
    box.innerHTML = selfTestCard + cards;
    box.dataset.cacheState = refreshing ? 'refreshing' : 'fresh';
  }
  const cachedFolders = readCache();
  if (cachedFolders) renderCategories(cachedFolders, true);
  document.getElementById('logout-btn')?.addEventListener('click', async event => {
    event.preventDefault();
    try { await AuthManager.logout(); } catch (error) { console.error(error); alert('Logout failed. Please try again.'); }
  });
  // Run identity validation alongside the catalogue reads, not before them.
  const candidateCheck = AuthManager.requireCandidateGuard();
  const catalogueRequest = (async () => {
    const [foldersResult, testsResult] = await Promise.all([
      supabaseClient.from('folders').select('id,name,description,thumbnail_url,sort_order,created_at').eq('active',true).order('sort_order',{ascending:true}).order('created_at',{ascending:true}),
      supabaseClient.rpc('list_test_catalog',{p_folder_id:null})
    ]);
    if (foldersResult.error) throw foldersResult.error;
    if (testsResult.error) throw testsResult.error;
    const tests = testsResult.data || [];
    return (foldersResult.data || []).map(folder => ({...folder,count:tests.filter(test=>test.folder_id===folder.id).length})).filter(folder=>folder.count>0);
  })();
  try {
    const [status, folders] = await Promise.all([candidateCheck,catalogueRequest]);
    if (!status?.ok) return;
    try { localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),folders})); } catch {}
    renderCategories(folders,false);
  } catch (error) {
    console.error('Unable to refresh typing categories:',error);
    if (!cachedFolders) box.innerHTML='<div class="loading-card">Unable to load typing categories. Please check your connection and refresh.</div>';
  }
});
