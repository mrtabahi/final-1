const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('admin PDF manager uploads private PDF files and exposes pin controls', () => {
  const page = read('admin-materials.html');
  const admin = read('js/admin-materials.js');
  const migration = read('supabase/migrations/20261106120000_pdf_library_direct_uploads.sql');
  assert.match(page, /type="file" accept="application\/pdf,\.pdf"/);
  assert.match(page, /material-pinned/);
  assert.match(admin, /20\*1024\*1024/);
  assert.match(admin, /bucket\.upload\(/);
  assert.match(admin, /data-pin/);
  assert.match(admin, /pinned:!row\.pinned/);
  assert.match(migration, /values \('study-pdfs', 'study-pdfs', false, 20971520, array\['application\/pdf'\]\)/);
  assert.match(migration, /Admins upload study PDFs/);
  assert.match(migration, /Eligible candidates download study PDFs/);
});

test('PDF downloads use signed URLs and material entitlement RLS', () => {
  const materials = read('js/materials.js');
  const home = read('js/home-command-center.js');
  const migration = read('supabase/migrations/20261106120000_pdf_library_direct_uploads.sql');
  assert.match(materials, /createSignedUrl\(item\.storage_path,60,\{download:true\}\)/);
  assert.match(home, /createSignedUrl\(item\.storage_path,60,\{download:true\}\)/);
  assert.match(migration, /can_access_material\(sm\.id, \(select auth\.uid\(\)\)\)/);
  assert.match(migration, /revoke all on function public\.list_material_catalog\(\) from public, anon/i);
});

test('homepage replaces side rails with a login-locked PDF mini-panel', () => {
  const page = read('index.html');
  const styles = read('css/home-command-center.css');
  const home = read('js/home.js');
  assert.doesNotMatch(page, /home-command-left/);
  assert.match(page, /home-pdf-mini is-locked/);
  assert.match(page, /home-pdf-lock/);
  assert.match(styles, /rotate\(39deg\)/);
  assert.match(styles, /rotate\(-39deg\)/);
  assert.match(styles, /home-quick-nav\{display:flex;flex-wrap:nowrap/);
  assert.match(home, /'materials\.html'/);
  assert.match(home, /showLoginPrompt/);
});
