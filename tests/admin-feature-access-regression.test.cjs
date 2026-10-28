const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin access controls and member lifecycle actions are wired', () => {
  const root = path.join(__dirname, '..');
  const admin = fs.readFileSync(path.join(root, 'js/admin-subscriptions.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261028170000_admin_feature_access_rules.sql'), 'utf8');
  const gate = fs.readFileSync(path.join(root, 'js/feature-access.js'), 'utf8');
  const testList = fs.readFileSync(path.join(root, 'js/test-list.js'), 'utf8');
  const materials = fs.readFileSync(path.join(root, 'js/materials.js'), 'utf8');

  assert.match(admin, /feature-access-form/);
  assert.match(admin, /toggleAccessRule/);
  assert.match(admin, /saveMembershipExpiry/);
  assert.match(admin, /expireMembership/);
  assert.match(admin, /resetPasswordForEmail/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /Admins manage access rules/);
  assert.match(migration, /feature_access_audit/);
  assert.match(gate, /Upgrade your plan/);
  assert.match(gate, /user_subscriptions/);
  assert.match(testList, /data-test-id/);
  assert.match(materials, /data-access-key="feature:/);
});
