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
    const [folderResult, testsResult] = await Promise.all([
      supabaseClient.from('folders').select('id,name,description').eq('id', folderId).eq('active', true).single(),
      supabaseClient.from('tests').select('id,title,language,duration_minutes,target_wpm,min_accuracy,folder_id,mode').eq('folder_id', folderId).eq('active', true).order('created_at', {ascending:false})
    ]);
    if (folderResult.error) throw folderResult.error;
    if (testsResult.error) throw testsResult.error;
    title.textContent = folderResult.data.name;
    description.textContent = folderResult.data.description || 'Select a test below to begin.';
    const tests = testsResult.data || [];
    if (!tests.length) { box.innerHTML = '<div class="loading-card">No active tests are available in this category yet.</div>'; return; }
    box.innerHTML = tests.map((test, index) => `
      <article class="test-row">
        <div class="test-number">${String(index + 1).padStart(2, '0')}</div>
        <div class="test-row-copy"><h2>${esc(test.title)}</h2><p>${esc(test.language || 'English')} · ${esc(test.mode === 'page' ? 'Off-screen' : 'On-screen')} practice</p></div>
        <div class="test-meta"><span>◷ ${esc(test.duration_minutes ?? '—')} min</span><span>⌨ ${test.target_wpm == null ? 'Target not set' : esc(test.target_wpm) + ' WPM'}</span><span>✓ ${test.min_accuracy == null ? 'Accuracy not set' : esc(test.min_accuracy) + '% target'}</span></div>
        <a class="btn btn-primary test-start" href="start_test.html?test=${encodeURIComponent(String(test.id))}">Start <span aria-hidden="true">→</span></a>
      </article>`).join('');
  } catch (error) {
    console.error('Unable to load selected folder tests:', error);
    title.textContent = 'Unable to load tests';
    box.innerHTML = '<div class="loading-card">Could not load this category. Please refresh or go back to Typing Tests.</div>';
  }
});