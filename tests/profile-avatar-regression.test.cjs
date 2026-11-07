const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const avatar = read('js/profile-avatar.js');
const migration = read('supabase/migrations/20261107235900_sitewide_profile_avatars.sql');
const account = read('my_account.html');
const leaderboard = read('js/leaderboard.js');
const report = read('start_test.html');
const config = read('js/config.js');

test('avatar upload validates formats and size, then exports a 512px square JPEG crop', () => {
  assert.ok(avatar.includes('const MAX_BYTES = 3 * 1024 * 1024;'));
  assert.ok(avatar.includes('image\\/(jpeg|png|webp)'));
  assert.ok(avatar.includes('toBlob(async blob'));
  assert.ok(avatar.includes('output.width=512;output.height=512'));
});
test('avatar storage policies restrict select, insert, update and delete to the signed-in user folder', () => {
  assert.ok(migration.includes('storage.foldername(name)'));
  assert.ok(migration.includes('(select auth.uid())::text'));
  for (const action of ['select','insert','update','delete']) {
    assert.ok(migration.includes('profile_avatars_owner_' + action));
  }
});
test('profile editor has separate upload, crop, change and delete controls', () => {
  for (const id of ['profile-avatar-editor','profile-avatar-change','profile-avatar-delete','profile-avatar-input','profile-avatar-preview']) {
    assert.ok(account.includes(id), 'missing account editor control: ' + id);
  }
});
test('public leaderboard projection exposes avatar separately from candidate identity', () => {
  assert.ok(migration.includes('add column if not exists avatar_url text'));
  assert.ok(migration.includes('sync_profile_avatar_to_public_leaderboard'));
  assert.ok(leaderboard.includes('avatar_url'));
  assert.ok(leaderboard.includes('leaderboard-avatar-cell'));
  assert.ok(leaderboard.includes('candidate_name'));
});
test('site-wide avatar assets load from the shared Supabase bootstrap', () => {
  assert.ok(config.includes('/js/profile-avatar.js'));
  assert.ok(config.includes('/css/profile-avatar.css'));
  assert.ok(avatar.includes('res-candidate-name'));
  assert.ok(avatar.includes('dh-result-avatar-column'));
});
test('typing result PDF preserves name and result status fields beside an independent avatar column', () => {
  assert.ok(report.includes('profile-avatar.js'));
  assert.ok(report.includes('id="res-candidate-name"'));
  assert.ok(report.includes('id="res-candidate-id"'));
  assert.ok(avatar.includes('disp-candidate-avatar-slot'));
});
test('admin candidate and history views request avatar_url without replacing candidate name or id fields', () => {
  const candidates = read('js/admin-candidates.js');
  const adminLogins = read('js/admin-logins.js');
  const adminLeaderboard = read('js/admin-leaderboard.js');
  const admin = read('js/admin.js');
  assert.ok(candidates.includes('full_name,avatar_url,email'));
  assert.ok(adminLogins.includes('full_name,email,avatar_url'));
  assert.ok(adminLeaderboard.includes('profiles(avatar_url)'));
  assert.ok(admin.includes('profiles(avatar_url)'));
  assert.ok(admin.includes('Candidate name / ID'));
});
test('all changed avatar-related JavaScript parses successfully', () => {
  for (const file of ['js/profile-avatar.js','js/leaderboard.js','js/admin.js','js/admin-candidates.js','js/admin-logins.js','js/admin-leaderboard.js']) {
    assert.doesNotThrow(() => new vm.Script(read(file), { filename:file }), file);
  }
});
