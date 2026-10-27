document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);
  const loading = $('access-loading');
  const app = $('access-app');
  const statusBox = $('access-status');
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  let folders = [];
  let tests = [];
  let saving = false;

  const setStatus = (message, kind = '') => {
    statusBox.textContent = message;
    statusBox.className = 'access-status' + (kind ? ' is-' + kind : '');
  };

  if (typeof AuthManager === 'undefined' || typeof supabaseClient === 'undefined') {
    loading.innerHTML = '<strong>Admin dependencies unavailable</strong><span>Check js/config.js and js/auth.js.</span>';
    return;
  }

  let auth;
  try {
    auth = await AuthManager.requireAdminGuard();
  } catch (error) {
    console.error('Access-control admin guard failed', error);
    location.href = 'login.html';
    return;
  }
  if (!auth?.ok && !(auth?.user && auth?.profile)) return;
  if (!auth?.user || !auth?.profile || !['admin','head_admin'].includes(String(auth.profile.role || '').toLowerCase())) {
    loading.innerHTML = '<strong>Administrator access required</strong><span>This area is restricted to authorized administrators.</span>';
    return;
  }
  $('access-admin-name').textContent = auth.profile.full_name || auth.user.email || 'Administrator';
  $('access-admin-email').textContent = auth.user.email || auth.profile.email || '';
  $('access-avatar').textContent = ($('access-admin-name').textContent.trim()[0] || 'A').toUpperCase();
  loading.hidden = true;
  loading.style.display = 'none';
  app.hidden = false;
  app.style.display = 'grid';

  $('access-logout').addEventListener('click', async () => {
    $('access-logout').disabled = true;
    try { await AuthManager.logout(); } catch (error) { console.error(error); $('access-logout').disabled = false; setStatus('Could not sign out. Please try again.', 'error'); }
  });
  $('access-refresh').addEventListener('click', load);
  $('access-search').addEventListener('input', render);
  $('access-filter').addEventListener('change', render);

  async function load() {
    if (saving) return;
    setStatus('Loading access policies…');
    $('access-folder-list').innerHTML = '<div class="admin-empty">Loading folders and tests…</div>';
    try {
      const [folderResult, testResult] = await Promise.all([
        supabaseClient.from('folders').select('id,name,description,active,access_mode,sort_order,created_at').order('sort_order', {ascending:true}).order('created_at', {ascending:true}),
        supabaseClient.from('tests').select('id,title,folder_id,active,access_mode,sort_order,created_at').order('sort_order', {ascending:true,nullsFirst:false}).order('created_at', {ascending:false})
      ]);
      if (folderResult.error) throw folderResult.error;
      if (testResult.error) throw testResult.error;
      folders = folderResult.data || [];
      tests = testResult.data || [];
      render();
      setStatus('Access policies loaded. New folders default to Paid; choose Free for any folder or test you want to offer without a subscription. Save each change to persist it.', 'success');
    } catch (error) {
      console.error('Access policy load failed', error);
      $('access-folder-list').innerHTML = '<div class="admin-empty">Could not load access policies. If the migration has not been applied to a staging database, access_mode will not exist yet.</div>';
      setStatus(error.message || 'Unable to load policies.', 'error');
    }
  }

  function modeSelect(resourceType, resourceId, mode) {
    const label = resourceType === 'folder' ? 'Folder access policy' : 'Test access policy';
    return '<label class="access-mode-label"><span class="sr-only">' + label + '</span><select class="admin-select" data-access-type="' + resourceType + '" data-access-id="' + escapeHtml(resourceId) + '" aria-label="' + label + '"><option value="inherit" ' + (mode === 'inherit' ? 'selected' : '') + '>Inherit</option><option value="free" ' + (mode === 'free' ? 'selected' : '') + '>Free</option><option value="paid" ' + (mode === 'paid' ? 'selected' : '') + '>Paid · subscription required</option></select></label>';
  }

  function render() {
    const query = $('access-search').value.trim().toLowerCase();
    const filter = $('access-filter').value;
    const list = $('access-folder-list');
    const freeCount = [...folders, ...tests].filter(x => x.access_mode === 'free').length;
    const paidCount = [...folders, ...tests].filter(x => x.access_mode === 'paid').length;
    $('access-folder-count').textContent = folders.length;
    $('access-test-count').textContent = tests.length;
    $('access-free-count').textContent = freeCount;
    $('access-paid-count').textContent = paidCount;
    const visibleFolders = folders.filter(folder => {
      const folderTests = tests.filter(test => test.folder_id === folder.id);
      const matchesSearch = (folder.name || '').toLowerCase().includes(query) || folderTests.some(test => (test.title || '').toLowerCase().includes(query));
      const matchesFilter = filter === 'all' || folder.access_mode === filter || folderTests.some(test => test.access_mode === filter);
      return matchesSearch && matchesFilter;
    });
    if (!visibleFolders.length) {
      list.innerHTML = '<div class="admin-empty">No folders match these filters.</div>';
      return;
    }
    list.innerHTML = visibleFolders.map(folder => {
      const childTests = tests.filter(test => test.folder_id === folder.id && ((filter === 'all' || test.access_mode === filter) && (!query || (test.title || '').toLowerCase().includes(query) || (folder.name || '').toLowerCase().includes(query))));
      const inheritedLabel = folder.access_mode === 'inherit' ? 'Inherit (site default)' : folder.access_mode === 'paid' ? 'Paid folder' : 'Free folder';
      return '<article class="access-folder-card"><div class="access-folder-head"><div class="access-folder-title"><strong>' + escapeHtml(folder.name) + '</strong><small>' + escapeHtml(folder.description || 'No description') + ' · ' + (folder.active ? 'Active' : 'Inactive') + ' · ' + inheritedLabel + '</small></div><div class="access-folder-controls">' + modeSelect('folder', folder.id, folder.access_mode || 'free') + '<button class="admin-btn admin-btn-secondary" type="button" data-save-folder="' + escapeHtml(folder.id) + '">Save folder</button></div></div><div class="access-test-list">' + (childTests.length ? childTests.map(test => '<div class="access-test-row"><div class="access-test-copy"><strong>' + escapeHtml(test.title) + '</strong><small>' + (test.active ? 'Active test' : 'Inactive test') + ' · ' + (test.access_mode === 'inherit' ? 'Inherits folder policy' : test.access_mode === 'paid' ? 'Paid override' : 'Free override') + '</small></div><div class="access-folder-controls">' + modeSelect('test', test.id, test.access_mode || 'inherit') + '<button class="admin-btn admin-btn-secondary" type="button" data-save-test="' + escapeHtml(test.id) + '">Save test</button></div></div>').join('') : '<div class="admin-empty">No tests match the current filters in this folder.</div>') + '</div></article>';
    }).join('');
    list.querySelectorAll('[data-save-folder]').forEach(button => button.addEventListener('click', () => save('folder', button.dataset.saveFolder)));
    list.querySelectorAll('[data-save-test]').forEach(button => button.addEventListener('click', () => save('test', button.dataset.saveTest)));
  }

  async function save(type, id) {
    if (saving) return;
    const select = document.querySelector('[data-access-type="' + type + '"][data-access-id="' + CSS.escape(String(id)) + '"]');
    if (!select) return;
    const mode = select.value;
    const item = (type === 'folder' ? folders : tests).find(row => String(row.id) === String(id));
    if (!item || !['inherit','free','paid'].includes(mode)) return;
    saving = true;
    setStatus('Saving ' + type + ' access policy…');
    const button = select.parentElement.querySelector('button');
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
      const table = type === 'folder' ? 'folders' : 'tests';
      const result = await supabaseClient.from(table).update({access_mode:mode}).eq('id', id).select('id,access_mode').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('No row updated. Confirm admin RLS policy and database migration.');
      item.access_mode = result.data.access_mode;
      setStatus('Saved ' + type + ' policy: ' + mode.toUpperCase() + '.', 'success');
      render();
    } catch (error) {
      console.error('Access policy save failed', error);
      setStatus('Save failed: ' + (error.message || 'database request failed'), 'error');
    } finally {
      saving = false;
    }
  }

  await load();
});
