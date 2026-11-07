const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261108001000_keep_user_ids_private_in_avatar_projection.sql'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'js/admin.js'), 'utf8');

test('public leaderboard avatar projection does not expose account UUIDs', () => {
  assert.ok(migration.includes('drop column if exists user_id'));
  assert.ok(migration.includes('from public.attempts a'));
  assert.ok(migration.includes('and a.user_id = new.id'));
  assert.ok(!migration.includes('(id,user_id,avatar_url'));
  assert.ok(!migration.includes('(id,user_id,avatar_url,candidate_name'));
});
test('avatar updates continue to sync through private attempts.user_id mapping', () => {
  assert.ok(migration.includes('update public.public_leaderboard_attempts p'));
  assert.ok(migration.includes('where p.id = a.id'));
  assert.ok(migration.includes('avatar_url=excluded.avatar_url'));
});
test('admin PDF report preserves candidate ID in a separate field beside avatar column', () => {
  assert.ok(admin.includes('candidate-photo'));
  assert.ok(admin.includes('Candidate name / ID'));
  assert.ok(admin.includes('attempt.candidate_id'));
});
test('corrective migration parses as plain SQL source and admin script remains valid JavaScript', () => {
  assert.ok(migration.startsWith('-- Keep internal account UUIDs private'));
  assert.doesNotThrow(() => new vm.Script(admin, { filename:'js/admin.js' }));
});
