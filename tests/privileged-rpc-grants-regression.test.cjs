const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('privileged helper RPCs revoke anonymous execution and retain authenticated execution', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'supabase/migrations/20261028100000_revoke_anon_execute_privileged_helpers.sql'),
    'utf8'
  );

  for (const signature of [
    'public.admin_get_candidate_emails(uuid[])',
    'public.has_candidate_permission(text)',
    'public.is_head_admin()'
  ]) {
    assert.ok(
      migration.includes(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon;`),
      `must revoke PUBLIC and anon execution for ${signature}`
    );
    assert.ok(
      migration.includes(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated;`),
      `must retain authenticated execution for ${signature}`
    );
  }

  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /^COMMIT;/m);
});
