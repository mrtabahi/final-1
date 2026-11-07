const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261107193000_public_leaderboard_projection_table.sql'), 'utf8');
const leaderboard = fs.readFileSync(path.join(root, 'js/leaderboard.js'), 'utf8');

test('public leaderboard is a narrow RLS-protected table, not a SECURITY DEFINER view', () => {
  assert.match(migration, /create table if not exists public\.public_leaderboard_attempts/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /create policy public_leaderboard_projection_read[\s\S]*using \(true\)/);
  assert.match(migration, /grant select on table public\.public_leaderboard_attempts to anon, authenticated, service_role/);
  assert.match(migration, /drop view if exists public\.public_leaderboard_attempts/);
  assert.doesNotMatch(migration, /create or replace view public\.public_leaderboard_attempts/i);
  assert.match(leaderboard, /from\("public_leaderboard_attempts"\)/);
});

test('only the public leaderboard projection fields are copied; private attempt fields are omitted', () => {
  assert.match(migration, /candidate_name,language,duration_seconds,created_at,gross_wpm,net_wpm,accuracy,test_name/);
  assert.doesNotMatch(migration, /user_id|typed_content|suspicious_events|result_snapshot/);
});

test('attempt and test triggers keep the projection in sync with leaderboard visibility', () => {
  assert.match(migration, /after insert or update or delete on public\.attempts/);
  assert.match(migration, /after update of title, leaderboard_enabled on public\.tests/);
  assert.match(migration, /if v_enabled then[\s\S]*insert into public\.public_leaderboard_attempts[\s\S]*else[\s\S]*delete from public\.public_leaderboard_attempts/);
  assert.match(migration, /if new\.leaderboard_enabled then[\s\S]*insert into public\.public_leaderboard_attempts[\s\S]*else[\s\S]*delete from public\.public_leaderboard_attempts/);
  assert.match(migration, /revoke all on function public\.sync_public_leaderboard_attempt_projection\(\) from public, anon, authenticated/);
  assert.match(migration, /revoke all on function public\.sync_public_leaderboard_test_projection\(\) from public, anon, authenticated/);
});
