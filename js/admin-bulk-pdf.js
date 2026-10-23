/* Bulk PDF -> typing test drafts. Runs only inside the authenticated admin page. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let drafts = [];
  function fillExistingFolders() { const select = $('bulk-folder-select'); if (!select) return; supabaseClient.from('folders').select('id,name').order('name').then(({data,error}) => { if (error) { setStatus('Could not load existing folders: '+error.message,true); return; } const current=select.value; select.innerHTML='<option value="">— Create a new folder instead —</option>'+(data||[]).map(f=>'<option value="'+escapeHtml(f.id)+'">'+escapeHtml(f.name)+'</option>').join(''); if (current) select.value=current; }); }

  function safeName(value) {
    return String(value || 'Untitled PDF').replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'Untitled PDF';
  }
  function setStatus(message, error = false) {
    const el = $('bulk-pdf-status');
    if (el) { el.textContent = message; el.classList.toggle('is-error', error); }
  }
  function openModal() {
    $('bulk-pdf-modal').style.display = 'flex';
    fillExistingFolders();
    $('bulk-base-title').focus();
  }
  function closeModal() {
    $('bulk-pdf-modal').style.display = 'none';
  }
  function normalizeLine(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  async function extractPdf(file) {
    if (!window.pdfjsLib) throw new Error('PDF reader could not load. Refresh the admin page and try again.');
    if (file.size > 30 * 1024 * 1024) throw new Error('File exceeds 30 MB limit.');
    const data = new Uint8Array(await file.arrayBuffer());
    const pdf = await window.pdfjsLib.getDocument({ data }).promise;
    const pages = [];
    const lineFrequency = new Map();
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const items = content.items.filter(item => item.str && item.str.trim()).map(item => ({
        text: item.str,
        x: item.transform?.[4] || 0,
        y: item.transform?.[5] || 0,
        height: Math.abs(item.transform?.[3] || 10)
      })).sort((a, b) => Math.abs(b.y - a.y) > 2.5 ? b.y - a.y : a.x - b.x);
      const lines = [];
      for (const item of items) {
        let line = lines.find(candidate => Math.abs(candidate.y - item.y) <= Math.max(2.5, item.height * 0.25));
        if (!line) { line = { y: item.y, items: [] }; lines.push(line); }
        line.items.push(item);
      }
      lines.sort((a, b) => b.y - a.y);
      const rendered = lines.map(line => {
        line.items.sort((a, b) => a.x - b.x);
        let text = '';
        let last = null;
        for (const item of line.items) {
          const gap = last ? item.x - (last.x + Math.max(0, last.text.length * (last.height || 10) * 0.42)) : 0;
          if (text && gap > 2.5) text += ' ';
          text += item.text;
          last = item;
        }
        return { text: normalizeLine(text), y: line.y };
      }).filter(line => line.text);
      pages.push(rendered);
      rendered.forEach((line, index) => {
        if (index < 2 || index >= rendered.length - 2) {
          const key = line.text.toLowerCase();
          if (key.length <= 100) lineFrequency.set(key, (lineFrequency.get(key) || 0) + 1);
        }
      });
    }
    const repeatedThreshold = Math.max(2, Math.ceil(pdf.numPages * 0.6));
    const repeated = new Set([...lineFrequency].filter(([, count]) => count >= repeatedThreshold).map(([line]) => line));
    const outputPages = pages.map(pageLines => {
      const kept = pageLines.filter((line, index) => {
        const isPageNumber = /^\s*(?:page\s*)?\d{1,4}(?:\s*(?:of|\/)\s*\d{1,4})?\s*$/i.test(line.text);
        const inMargin = index < 2 || index >= pageLines.length - 2;
        return !isPageNumber && !(inMargin && repeated.has(line.text.toLowerCase()));
      });
      const paragraphs = [];
      let current = '';
      let previousY = null;
      let previousHeight = 10;
      for (const line of kept) {
        const gap = previousY === null ? 0 : previousY - line.y;
        if (current && gap > Math.max(16, previousHeight * 1.8)) {
          paragraphs.push(current.trim());
          current = '';
        } else if (current) {
          current += ' ';
        }
        current += line.text;
        previousY = line.y;
        previousHeight = 10;
      }
      if (current.trim()) paragraphs.push(current.trim());
      return paragraphs.join('\n\n');
    });
    const text = outputPages.filter(Boolean).join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 20) throw new Error('No usable text found. This may be a scanned/image-only PDF; OCR is not included.');
    return { text, pages: pdf.numPages, title: safeName(file.name), fileName: file.name };
  }

  function renderDrafts() {
    const box = $('bulk-pdf-review');
    if (!box) return;
    if (!drafts.length) { box.innerHTML = ''; $('bulk-pdf-save').disabled = true; return; }
    box.innerHTML = '<div class="admin-bulk-review-heading"><strong>Review drafts (' + drafts.length + ')</strong><small>Check headings, page artefacts and paragraph breaks. Nothing is saved until you confirm.</small></div>' +
      drafts.map((draft, index) => '<article class="admin-bulk-draft" data-draft-index="' + index + '">' +
        '<div class="admin-bulk-draft-head"><label class="admin-check"><input type="checkbox" data-draft-include="' + index + '" ' + (draft.include ? 'checked' : '') + '> Include</label><label class="admin-check"><input type="checkbox" data-draft-publish="' + index + '" ' + (draft.publish ? 'checked' : '') + '> Publish this test</label><span>' + draft.pages + ' page(s) · ' + draft.text.trim().split(/\s+/).filter(Boolean).length.toLocaleString() + ' words</span></div>' +
        '<div class="admin-form-field"><label>Test title</label><input class="admin-input" data-draft-title="' + index + '" value="' + escapeHtml(draft.title) + '" maxlength="160"></div>' +
        '<div class="admin-form-field"><label>Passage text — editable</label><textarea class="admin-input admin-passage-input" data-draft-text="' + index + '" rows="7">' + escapeHtml(draft.text) + '</textarea></div>' +
        '<small class="admin-field-help">Source: ' + escapeHtml(draft.fileName) + (draft.warning ? ' · <strong class="admin-warning-text">' + escapeHtml(draft.warning) + '</strong>' : '') + '</small>' +
        '</article>').join('');
    box.querySelectorAll('[data-draft-include]').forEach(input => input.addEventListener('change', () => { drafts[Number(input.dataset.draftInclude)].include = input.checked; updateSaveState(); }));
    box.querySelectorAll('[data-draft-publish]').forEach(input => input.addEventListener('change', () => { drafts[Number(input.dataset.draftPublish)].publish = input.checked; }));
    box.querySelectorAll('[data-draft-title]').forEach(input => input.addEventListener('input', () => { const d=drafts[Number(input.dataset.draftTitle)]; d.title=input.value; d.titleManuallyEdited=true; }));
    box.querySelectorAll('[data-draft-text]').forEach(input => input.addEventListener('input', () => { drafts[Number(input.dataset.draftText)].text = input.value; const d=drafts[Number(input.dataset.draftText)]; const card=input.closest('.admin-bulk-draft'); const words=card?.querySelector('.admin-bulk-draft-head span'); if(words) words.textContent=d.pages+' page(s) · '+d.text.trim().split(/\s+/).filter(Boolean).length.toLocaleString()+' words'; updateSaveState(); }));
    updateSaveState();
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
  function updateSaveState() {
    const included = drafts.filter(d => d.include && d.title.trim() && d.text.trim().length >= 20);
    $('bulk-pdf-save').disabled = !included.length;
    $('bulk-pdf-save').textContent = included.length ? 'Save ' + included.length + ' reviewed test(s)' : 'Save all reviewed tests';
  }

  async function extractAll() {
    const files = [...($('bulk-pdf-files').files || [])];
    const folderName = $('bulk-folder-name').value.trim();
    if (!$('bulk-folder-select').value && !folderName) { setStatus('Choose an existing folder or enter a new folder name.', true); $('bulk-folder-name').focus(); return; }
    if (!$('bulk-base-title').value.trim()) { setStatus('Enter the base test name first.', true); $('bulk-base-title').focus(); return; }
    if (!files.length) { setStatus('Choose one or more PDF files.', true); return; }
    if (files.some(file => !/\.pdf$/i.test(file.name) && file.type !== 'application/pdf')) { setStatus('Only PDF files are supported.', true); return; }
    if (files.length > 40) { setStatus('Please process up to 40 PDFs at a time.', true); return; }
    drafts = [];
    renderDrafts();
    $('bulk-extract-pdfs').disabled = true;
    try {
      for (let i = 0; i < files.length; i++) {
        setStatus('Reading PDF ' + (i + 1) + ' of ' + files.length + ': ' + files[i].name);
        try {
          const result = await extractPdf(files[i]);
          if ($('bulk-remove-heading').checked) { const lines = result.text.split('\n'); const stripped = lines.slice(1).join('\n').trim(); if (stripped.length >= 20) result.text = stripped; }
          const suspicious = result.text.split('\n').filter(line => line.trim().length < 4 || /^(contents|index|chapter\s+\d+|page\s+\d+)/i.test(line.trim()));
          const title = $('bulk-base-title').value.trim() + ' - ' + (drafts.length + 1);
          drafts.push({ ...result, title, titleManuallyEdited: false, publish: $('bulk-publish').checked, include: true, warning: suspicious.length ? 'Possible headings/short lines detected — review before saving' : '' });
        } catch (error) {
          drafts.push({ title: safeName(files[i].name), fileName: files[i].name, pages: 0, text: '', include: false, warning: error.message || 'Could not extract this PDF' });
        }
        renderDrafts();
      }
      const good = drafts.filter(d => d.text.length >= 20).length;
      setStatus('Extraction finished: ' + good + ' of ' + files.length + ' PDF(s) ready. Review and edit each passage; repeated page headers/footers and page numbers are filtered conservatively.');
    } finally {
      $('bulk-extract-pdfs').disabled = false;
      updateSaveState();
    }
  }

  async function saveDrafts() {
    const folderName = $('bulk-folder-name').value.trim();
    const selectedFolderId = $('bulk-folder-select').value;
    const included = drafts.filter(d => d.include && d.title.trim() && d.text.trim().length >= 20);
    if ((!selectedFolderId && !folderName) || !included.length) { setStatus('Choose a folder and at least one valid reviewed test.', true); return; }
    const duplicateTitles = included.map(d => d.title.trim().toLowerCase());
    if (new Set(duplicateTitles).size !== duplicateTitles.length && !confirm('Some selected PDFs have duplicate test titles. Save them anyway?')) return;
    const saveButton = $('bulk-pdf-save');
    saveButton.disabled = true;
    try {
      setStatus('Checking folder and preparing ' + included.length + ' test(s)…');
      let folder = null;
      if (selectedFolderId) { const {data,error}=await supabaseClient.from('folders').select('id,name').eq('id',selectedFolderId).single(); if(error) throw error; folder=data; }
      if (!folder) { const { data: existingFolders, error: folderError } = await supabaseClient.from('folders').select('id,name').ilike('name', folderName);
        if (folderError) throw folderError;
        folder = (existingFolders || []).find(item => item.name.toLowerCase() === folderName.toLowerCase()); }
      if (!folder) {
        const { data, error } = await supabaseClient.from('folders').insert({ name: folderName, description: 'Bulk-imported typing tests from PDFs', active: true }).select('id,name').single();
        if (error) throw error;
        folder = data;
      }
      const { data: existingTests, error: testsError } = await supabaseClient.from('tests').select('title,passage').eq('folder_id', folder.id);
      if (testsError) throw testsError;
      const existing = new Set((existingTests || []).map(t => t.title.trim().toLowerCase() + '|' + t.passage.trim()));
      const duplicates = included.filter(d => existing.has(d.title.trim().toLowerCase() + '|' + d.text.trim()));
      if (duplicates.length && !confirm(duplicates.length + ' exact duplicate test(s) already exist in this folder. Skip duplicates and continue?')) return;
      const rows = included.filter(d => !existing.has(d.title.trim().toLowerCase() + '|' + d.text.trim())).map(d => ({
        title: d.title.trim(), folder_id: folder.id, language: $('bulk-language').value,
        duration_minutes: Number($('bulk-duration').value) || 5,
        target_wpm: Number($('bulk-target-wpm').value) || 0,
        min_accuracy: $('bulk-min-accuracy').value === '' ? null : Number($('bulk-min-accuracy').value), free_error_pct: Number($('bulk-errors').value || 0) / 100,
        penalty_per_error: Number($('bulk-penalty').value || 10), passage: d.text.trim(), mode: $('bulk-mode').value,
        allow_backspace: $('bulk-backspace').value === 'on', backspace_mode: $('bulk-backspace').value, highlight_mode: $('bulk-highlight').value,
        hide_paragraph_mode: $('bulk-hide').value, active: !!d.publish, leaderboard_enabled: $('bulk-leaderboard').checked
      }));
      if (!rows.length) { setStatus('No new tests saved: all selected passages were exact duplicates.'); return; }
      const { data, error } = await supabaseClient.from('tests').insert(rows).select('id,title');
      if (error) throw error;
      setStatus('Saved ' + (data || []).length + ' test(s) to "' + folder.name + '". They are saved as inactive drafts; review them in Folders & Tests and enable each when ready.');
      drafts = [];
      renderDrafts();
      $('bulk-pdf-files').value = '';
      await Promise.all([supabaseClient.from('folders').select('*').order('sort_order').order('created_at'), supabaseClient.from('tests').select('*, folders(id,name)').order('created_at', { ascending: false })]).then(async ([f, t]) => {
        if (!f.error) {
          const main = await toolsRefreshLibrary(f.data || [], t.data || []);
          void main;
        }
      });
    } catch (error) {
      console.error('Bulk PDF test creation failed:', error);
      setStatus('Could not save tests: ' + (error.message || 'Unknown error') + '. No tests were intentionally published; check the folder and test list before retrying.', true);
    } finally {
      saveButton.disabled = false;
      updateSaveState();
    }
  }
  async function toolsRefreshLibrary(folders, tests) {
    // Refresh the existing admin inventory without exposing any new global APIs.
    const folderBox = $('manage-folders-list');
    const testBox = $('manage-tests-list');
    if (folderBox) folderBox.innerHTML = '<div class="admin-empty">Refresh the Folders & Tests view to reload folder counts.</div>';
    if (testBox) testBox.innerHTML = '<div class="admin-empty">Refresh the Folders & Tests view to reload the test inventory.</div>';
    $('refresh-folders')?.click();
    $('refresh-tests')?.click();
    return true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    $('btn-bulk-pdf')?.addEventListener('click', openModal);
    $('bulk-pdf-close')?.addEventListener('click', closeModal);
    $('bulk-pdf-cancel')?.addEventListener('click', closeModal);
    $('bulk-pdf-modal')?.addEventListener('click', event => { if (event.target === $('bulk-pdf-modal')) closeModal(); });
    $('bulk-extract-pdfs')?.addEventListener('click', extractAll);
    $('bulk-pdf-save')?.addEventListener('click', saveDrafts);
    $('bulk-publish')?.addEventListener('change', () => { drafts.forEach(d=>{d.publish=$('bulk-publish').checked}); renderDrafts(); });
    $('bulk-folder-select')?.addEventListener('change', () => { const chosen=!!$('bulk-folder-select').value; $('bulk-folder-name').disabled=chosen; if(chosen)$('bulk-folder-name').value=''; else $('bulk-folder-name').disabled=false; });
    $('bulk-base-title')?.addEventListener('input', () => { const base=$('bulk-base-title').value.trim(); drafts.forEach((d,i)=>{if(!d.titleManuallyEdited)d.title=base ? base+' - '+(i+1) : safeName(d.fileName)}); renderDrafts(); });
  });
})();