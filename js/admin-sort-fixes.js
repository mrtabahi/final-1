/* Admin sorting helpers: reliable folder order writes and sortable test inventory. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let sortMode = 'manual';
  let sortQueued = false;

  async function moveFolder(id, direction) {
    const { data, error } = await supabaseClient.from('folders').select('id,name,sort_order,created_at').order('sort_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true });
    if (error) throw error;
    const folders = data || [];
    const index = folders.findIndex(folder => String(folder.id) === String(id));
    const target = index + (direction === 'up' ? -1 : 1);
    if (index < 0 || target < 0 || target >= folders.length) return;
    [folders[index], folders[target]] = [folders[target], folders[index]];
    for (let position = 0; position < folders.length; position++) {
      const folder = folders[position];
      const result = await supabaseClient.from('folders').update({ sort_order: position }).eq('id', folder.id).select('id').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error('Folder order update was rejected for "' + folder.name + '". Check admin permissions.');
    }
    if (typeof window.loadFolders === 'function') await window.loadFolders();
    else $('refresh-folders')?.click();
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-folder-move]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (button.disabled) return;
    button.disabled = true;
    try { await moveFolder(button.dataset.folderMove, button.dataset.direction); }
    catch (error) {
      console.error('Folder reorder failed:', error);
      alert('Folder order save nahi hua: ' + (error.message || 'Refresh karke dobara try karein.'));
      $('refresh-folders')?.click();
    } finally { button.disabled = false; }
  }, true);

  function applyTestSort() {
    sortQueued = false;
    const box = $('manage-tests-list');
    const tbody = box?.querySelector('tbody');
    if (!tbody || sortMode === 'manual') return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const text = row => row.querySelector('td strong')?.textContent?.trim() || '';
    const duration = row => Number((row.children[3]?.textContent || '').match(/[\d.]+/)?.[0] || 0);
    const id = row => row.querySelector('[data-test-edit], [data-test-toggle], [data-test-delete]')?.dataset.testEdit
      || row.querySelector('[data-test-toggle]')?.dataset.testToggle
      || row.querySelector('[data-test-delete]')?.dataset.testDelete || '';
    const created = new Map();
    Promise.resolve(supabaseClient.from('tests').select('id,title,created_at')).then(({data}) => {
      (data || []).forEach(test => created.set(String(test.id), test.created_at || ''));
      rows.sort((a,b) => {
        const nameA = text(a), nameB = text(b);
        const durationA = duration(a), durationB = duration(b);
        const dateA = created.get(String(id(a))) || '', dateB = created.get(String(id(b))) || '';
        if (sortMode === 'name-asc') return nameA.localeCompare(nameB, undefined, {numeric:true, sensitivity:'base'});
        if (sortMode === 'name-desc') return nameB.localeCompare(nameA, undefined, {numeric:true, sensitivity:'base'});
        if (sortMode === 'duration-asc') return durationA - durationB || nameA.localeCompare(nameB);
        if (sortMode === 'duration-desc') return durationB - durationA || nameA.localeCompare(nameB);
        if (sortMode === 'newest') return dateB.localeCompare(dateA) || nameA.localeCompare(nameB);
        if (sortMode === 'oldest') return dateA.localeCompare(dateB) || nameA.localeCompare(nameB);
        return 0;
      });
      rows.forEach(row => tbody.appendChild(row));
    }).catch(error => console.error('Test sort failed:', error));
  }

  document.addEventListener('change', event => {
    if (event.target.id !== 'library-test-sort') return;
    sortMode = event.target.value || 'manual';
    applyTestSort();
  });
  const box = $('manage-tests-list');
  if (box) new MutationObserver(() => {
    if (sortMode !== 'manual' && !sortQueued) {
      sortQueued = true;
      queueMicrotask(applyTestSort);
    }
  }).observe(box, { childList: true, subtree: true });
})();