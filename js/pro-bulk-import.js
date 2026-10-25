/* Pro workspace batch PDF importer. Runs only after the authorized Test Library module is opened. */
(() => {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let mounted = false;
  function addImporter() {
    const view = document.getElementById('cw-view');
    if (mounted && !view?.querySelector('.cw-bulk-import')) mounted = false;
    if (!view || mounted || !view.querySelector('h2')?.textContent.includes('Test Library & Bulk Import')) return;
    mounted = true;
    const section = document.createElement('section');
    section.className = 'cw-bulk-import';
    section.innerHTML = '<span class="cw-mini-eyebrow">BATCH WORKFLOW</span><h3>Bulk PDF → Typing Tests</h3><p>Select multiple text-based PDFs. Each PDF becomes one editable test draft. Review the extracted passage before saving; imported tests remain inactive until you publish them.</p><div class="cw-grid"><div class="cw-field"><label for="cw-bulk-files">PDF files (up to 40)</label><input id="cw-bulk-files" type="file" accept="application/pdf,.pdf" multiple></div><div class="cw-field"><label for="cw-bulk-folder">Destination folder</label><select id="cw-bulk-folder"><option value="">Unassigned</option></select></div></div><div class="cw-actions"><button type="button" class="cw-btn cw-btn-primary" id="cw-bulk-extract">Extract PDF passages</button><span id="cw-bulk-status" role="status" aria-live="polite"></span></div><div id="cw-bulk-review"></div>';
    const panel = view.querySelector('.cw-panel');
    const testHeading = [...view.querySelectorAll('h3')].find(h => h.textContent.trim() === 'Existing tests');
    if (testHeading) testHeading.before(section);
    else panel?.append(section);
    const folderSelect = section.querySelector('#cw-bulk-folder');
    view.querySelectorAll('#cw-test-form select[name="folder_id"] option').forEach(o => {
      if (o.value && !folderSelect.querySelector('option[value="' + CSS.escape(o.value) + '"]')) {
        const copy = document.createElement('option'); copy.value = o.value; copy.textContent = o.textContent; folderSelect.append(copy);
      }
    });
    const status = section.querySelector('#cw-bulk-status'), review = section.querySelector('#cw-bulk-review'), button = section.querySelector('#cw-bulk-extract');
    button.addEventListener('click', async () => {
      const files = [...(section.querySelector('#cw-bulk-files').files || [])];
      if (!files.length) { status.textContent = 'Choose at least one PDF.'; return; }
      if (files.length > 40) { status.textContent = 'Choose up to 40 PDFs per batch.'; return; }
      if (files.some(f => f.size > 30 * 1024 * 1024)) { status.textContent = 'Each PDF must be 30 MB or smaller.'; return; }
      if (!window.pdfjsLib) { status.textContent = 'PDF reader unavailable. Refresh and try again.'; return; }
      button.disabled = true; review.innerHTML = ''; status.textContent = 'Extracting PDF text…';
      const drafts = [];
      try {
        for (const file of files) {
          const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
          const pageTexts = [];
          for (let n = 1; n <= pdf.numPages; n++) {
            const page = await pdf.getPage(n), tc = await page.getTextContent();
            const items = tc.items.filter(x => x.str && x.str.trim()).map(x => ({ text: x.str, x: x.transform?.[4] || 0, y: x.transform?.[5] || 0 }));
            items.sort((a, b) => Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x);
            const lines = [];
            for (const it of items) { let line = lines.find(l => Math.abs(l.y - it.y) <= 3); if (!line) { line = { y: it.y, items: [] }; lines.push(line); } line.items.push(it); }
            lines.sort((a, b) => b.y - a.y);
            pageTexts.push(lines.map(l => l.items.sort((a, b) => a.x - b.x).map(x => x.text).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n'));
          }
          const passage = pageTexts.filter(Boolean).join('\n\n').trim();
          if (!passage) throw new Error(file.name + ' has no selectable text. Scanned PDFs require OCR.');
          drafts.push({ fileName: file.name, title: file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').slice(0, 160), passage });
        }
        review.innerHTML = drafts.map((d, i) => '<article class="cw-bulk-draft"><label class="cw-toggle-row"><span><strong>Include · ' + esc(d.fileName) + '</strong><small>' + d.passage.split(/\s+/).filter(Boolean).length + ' words · passage preview</small></span><input type="checkbox" data-include="' + i + '" checked></label><div class="cw-grid"><div class="cw-field"><label>Test title</label><input data-title="' + i + '" value="' + esc(d.title) + '" maxlength="160"></div><div class="cw-field"><label>Duration (minutes)</label><input data-duration="' + i + '" type="number" min="1" max="180" value="10"></div></div><div class="cw-field"><label>Passage preview / editable text</label><textarea data-passage="' + i + '" rows="5">' + esc(d.passage) + '</textarea></div></article>').join('');
        const save = document.createElement('button'); save.type = 'button'; save.className = 'cw-btn cw-btn-primary'; save.textContent = 'Save selected tests as drafts'; review.append(save);
        status.textContent = 'Review titles and passage text. Nothing is saved until you confirm.';
        save.addEventListener('click', async () => {
          const selected = drafts.map((d, i) => ({ d, i })).filter(({ i }) => review.querySelector('[data-include="' + i + '"]').checked);
          if (!selected.length) { status.textContent = 'Select at least one draft.'; return; }
          save.disabled = true;
          try {
            for (const { i } of selected) {
              const title = review.querySelector('[data-title="' + i + '"]').value.trim();
              const passage = review.querySelector('[data-passage="' + i + '"]').value.trim();
              const duration = Number(review.querySelector('[data-duration="' + i + '"]').value);
              if (!title || !passage || !Number.isFinite(duration) || duration < 1 || duration > 180) throw new Error('Check every selected title, passage and duration (1–180 minutes).');
              const { error } = await supabaseClient.from('tests').insert({ title, passage, folder_id: folderSelect.value || null, language: 'English', duration_minutes: duration, target_wpm: 35, mode: 'screen', active: false, sort_order: Date.now() + i });
              if (error) throw error;
            }
            status.textContent = 'Imported tests saved as inactive drafts. Refresh the module and enable them when ready.';
            document.getElementById('refresh-folders')?.click();
          } catch (error) { status.textContent = 'Import stopped: ' + (error.message || 'Could not save drafts.'); save.disabled = false; }
        });
      } catch (error) { status.textContent = error.message || 'Could not extract PDF files.'; }
      finally { button.disabled = false; }
    });
  }
  const observer = new MutationObserver(addImporter);
  document.addEventListener('DOMContentLoaded', () => {
    const view = document.getElementById('cw-view');
    if (view) observer.observe(view, { childList: true, subtree: true });
    addImporter();
  }, { once: true });
})();