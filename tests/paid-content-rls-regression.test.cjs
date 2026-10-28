const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('paid tests and study materials use server-side entitlement policies', () => {
  const migration = fs.readFileSync(
    path.join(root, 'supabase/migrations/20261028173500_restore_paid_content_rls_enforcement.sql'),
    'utf8'
  );
  assert.match(migration, /create policy tests_candidate_select[\s\S]*?using\s*\(public\.is_current_user_admin\(\)\s+or\s+public\.can_access_test\(id,\s*auth\.uid\(\)\)\)/i);
  assert.match(migration, /create policy study_materials_candidate_select[\s\S]*?using\s*\(public\.is_current_user_admin\(\)\s+or\s+public\.can_access_material\(id,\s*auth\.uid\(\)\)\)/i);
  assert.doesNotMatch(migration, /using\s*\(\s*active\s*=\s*true\s*\)/i);

  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  const tests = fs.readFileSync(path.join(root, 'js/test-list.js'), 'utf8');
  const materials = fs.readFileSync(path.join(root, 'js/materials.js'), 'utf8');
  assert.match(app, /rpc\(['"]get_test_for_candidate['"]/);
  assert.match(tests, /rpc\(['"]list_test_catalog['"]/);
  assert.match(materials, /rpc\(['"]list_material_catalog['"]/);
  assert.match(materials, /rpc\(['"]get_material_link['"]/);
});
