
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const avatar = fs.readFileSync(path.join(root, 'js/profile-avatar.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261107235900_sitewide_profile_avatars.sql'), 'utf8');
const account = fs.readFileSync(path.join(root, 'my_account.html'), 'utf8');
const leaderboard = fs.readFileSync(path.join(root, 'js/leaderboard.js'), 'utf8');
const report = fs.readFileSync(path.join(root, 'start_test.html'), 'utf8');
const config = fs.readFileSync(path.join(root, 'js/config.js'), 'utf8');

test('avatar upload is cropped to square JPEG and validates file type and size', () => {
  assert.match(avatar, /MAX_BYTES = 3 \\* 1024 \\* 1024/u);
  assert.ok(avatar.includes('image\\/(jpeg|png|webp)'));
  assert.match(avatar, /toBlob\\(async blob/);
  assert.match(avatar, /output\\.width=512;output\\.height=512/u);
});
test('avatar storage writes are scoped to the authenticated user folder', () => {
  assert.match(migration, /storage\\.foldername\\(name\\).*auth\\.uid\\(\\)/su);
  assert.match(migration, /profile_avatars_owner_insert/u);
  assert.match(migration, /profile_avatars_owner_update/u);
  assert.match(migration, /profile_avatars_owner_delete/u);
  assert.match(migration, /profile_avatars_owner_select/u);
});
test('profile editor has isolated upload, crop, change and delete controls', () => {
  assert.match(account, /profile-avatar-editor/u);
  assert.match(account, /profile-avatar-change/u);
  assert.match(account, /profile-avatar-delete/u);
  assert.match(account, /profile-avatar-input/u);
});
test('public leaderboard projection exposes avatar separately from candidate name', () => {
  assert.match(migration, /add column if not exists avatar_url text/u);
  assert.match(leaderboard, /avatar_url/u);
  assert.match(leaderboard, /leaderboard-avatar-cell/u);
  assert.match(leaderboard, /candidate_name/u);
});
test('profile avatar assets are loaded site-wide without replacing account fields', () => {
  assert.match(config, /profile-avatar\\.js/u);
  assert.match(avatar, /res-candidate-name/u);
  assert.match(avatar, /dh-result-avatar-column/u);
});
test('typing result print report includes avatar module and keeps report identity fields', () => {
  assert.match(report, /profile-avatar\\.js/u);
  assert.match(report, /id="res-candidate-name"/u);
  assert.match(report, /id="res-candidate-id"/u);
});
