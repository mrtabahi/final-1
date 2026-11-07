const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'js/admin-materials.js'), 'utf8');
const publicMaterials = fs.readFileSync(path.join(root, 'js/materials.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'admin-materials.html'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261107180000_study_materials_pdf_upload_access.sql'), 'utf8');

test('admin PDF uploads validate extension, actual PDF signature and 50 MB limit', () => {
  assert.match(admin, /file\.name\.toLowerCase\(\)\.endsWith\('\.pdf'\)/);
  assert.match(admin, /file\.slice\(0,5\)\.text\(\)/);
  assert.match(admin, /signature!=='%PDF-'/);
  assert.match(admin, /50\*1024\*1024/);
  assert.match(admin, /contentType:'application\/pdf'/);
  assert.match(page, /admin-materials\.js\?v=20261107-pdf-signature1/);
});

test('uploaded PDFs remain private and downloads require the database entitlement RPC', () => {
  assert.match(migration, /values \('study-materials','study-materials',false,52428800,array\['application\/pdf'\]\)/);
  assert.match(migration, /public\.can_access_material\(sm\.id,auth\.uid\(\)\)/);
  assert.match(migration, /create policy "study_materials_file_authorized_read"/);
  assert.match(migration, /public\.get_material_link/);
  assert.match(publicMaterials, /rpc\('get_material_link'/);
  assert.match(publicMaterials, /createSignedUrl\(path,120/);
});

test('free material is available to signed-in candidates while premium access stays subscription-gated', () => {
  assert.match(migration, /if coalesce\(v_free,false\) then return true/);
  assert.match(migration, /has_active_paid_subscription/);
  assert.match(migration, /revoke all on function public\.can_access_material\(uuid,uuid\) from public,anon/);
  assert.match(migration, /grant execute on function public\.get_material_link\(uuid\) to authenticated/);
});
