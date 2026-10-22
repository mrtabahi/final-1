document.addEventListener('DOMContentLoaded', async () => {
  const box = document.getElementById('folder-list');
  if (!box) return;
  const status = await AuthManager.requireCandidateGuard();
  if (!status?.ok) return;
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
  document.getElementById('logout-btn')?.addEventListener('click', async event => {
    event.preventDefault();
    try { await AuthManager.logout(); } catch (error) { console.error(error); alert('Logout failed. Please try again.'); }
  });
  box.innerHTML = '<div class="loading-card">Loading typing categories…</div>';
  try {
    const [foldersResult, testsResult] = await Promise.all([
      supabaseClient.from('folders').select('id,name,description,thumbnail_url,sort_order,created_at').eq('active', true).order('sort_order', {ascending:true}).order('created_at', {ascending:true}),
      supabaseClient.from('tests').select('id,folder_id').eq('active', true)
    ]);
    if (foldersResult.error) throw foldersResult.error;
    if (testsResult.error) throw testsResult.error;
    const tests = testsResult.data || [];
    const folders = (foldersResult.data || []).map(folder => ({...folder, count:tests.filter(test => test.folder_id === folder.id).length})).filter(folder => folder.count > 0);
    if (!folders.length) {
      box.innerHTML = '<div class="loading-card">No active typing categories are available yet.</div>';
      return;
    }
    box.innerHTML = folders.map(folder => `
      <a class="category-card" href="test-list.html?folder=${encodeURIComponent(String(folder.id))}">
        <div class="category-thumb" aria-hidden="true">${folder.thumbnail_url ? `<img src="${esc(folder.thumbnail_url)}" alt="" loading="lazy">` : `<span class="category-symbol">${esc(chooseSymbol(folder.name))}</span>`}</div>
        <div class="category-copy">
          <h2>${esc(folder.name)}</h2>
          <p>${esc(folder.description || 'Practice typing with a set of guided tests.')}</p>
          <div class="category-foot"><span>Explore tests <span aria-hidden="true">→</span></span><span class="category-count">${folder.count} ${folder.count === 1 ? 'test' : 'tests'}</span></div>
        </div>
      </a>`).join('');
  } catch (error) {
    console.error('Unable to load typing categories:', error);
    box.innerHTML = '<div class="loading-card">Unable to load typing categories. Please refresh and try again.</div>';
  }
});