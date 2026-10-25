const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const migration = read('supabase/migrations/20261026000100_access_monetization_foundation.sql');
const edge = read('supabase/functions/typing-result/index.ts');
const adminAccess = read('js/admin-access.js');
const auth = read('js/auth.js');

test('legacy content is backfilled Free while future content defaults Paid', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS access_mode text NOT NULL DEFAULT 'free'/);
  assert.match(migration, /ALTER TABLE public\.folders ALTER COLUMN access_mode SET DEFAULT 'paid'/);
  assert.match(migration, /ALTER TABLE public\.tests ALTER COLUMN access_mode SET DEFAULT 'paid'/);
});

test('candidate test reads use entitlement checks instead of the broad active-only policy', () => {
  assert.match(migration, /DROP POLICY IF EXISTS tests_candidate_select ON public\.tests/);
  assert.match(migration, /USING \(active = true AND public\.can_access_test\(id, auth\.uid\(\)\)\)/);
});

test('authenticated users cannot probe entitlement state for another user', () => {
  assert.match(migration, /p_user_id IS DISTINCT FROM auth\.uid\(\)/);
  assert.match(migration, /current_setting\('request\.jwt\.claim\.role', true\).*service_role/s);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.can_access_test\(uuid, uuid\) FROM PUBLIC, anon/);
});

test('admin CRUD helper recognizes admin and head_admin roles', () => {
  assert.match(migration, /role IN \('admin', 'head_admin'\)/);
  assert.match(auth, /\['admin', 'head_admin'\]\.includes\(String\(profile\.role \|\| ''\)\.toLowerCase\(\)\)/);
});

test('typing sessions check access before both start and submit', () => {
  const checks = edge.match(/db\.rpc\("can_access_test"/g) || [];
  assert.equal(checks.length, 2);
  assert.match(edge, /if \(accessError\)[\s\S]*?return reply\(503/);
  assert.match(edge, /if \(accessAllowed !== true\) return reply\(403/);
});

test('Paid cannot be enabled in the admin UI before server-side validation', () => {
  assert.match(adminAccess, /<option value="paid" disabled/);
  assert.match(adminAccess, /if \(mode === 'paid'\)/);
});

test('access policy changes are written to a server-managed audit trail', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.access_policy_audit/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.audit_access_mode_change\(\)/);
  assert.match(migration, /CREATE TRIGGER folders_access_mode_audit/);
  assert.match(migration, /CREATE TRIGGER tests_access_mode_audit/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.%I FROM anon, authenticated/);
});

test('migration replaces only the candidate test-read policy and preserves staff/admin policies', () => {
  assert.match(migration, /DROP POLICY IF EXISTS tests_candidate_select ON public\.tests/);
  assert.doesNotMatch(migration, /DROP POLICY IF EXISTS tests_(admin_all|staff_manage) ON public\.tests/);
  assert.match(migration, /CREATE POLICY tests_candidate_select ON public\.tests/);
});

test('subscription and payment tables are server-managed behind RLS', () => {
  assert.match(migration, /ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE public\.%I FROM anon, authenticated/);
  assert.match(migration, /GRANT ALL ON TABLE public\.%I TO service_role/);
  for (const table of ['subscription_plans', 'plan_entitlements', 'user_subscriptions', 'user_entitlement_overrides', 'coupons', 'orders', 'payment_transactions', 'coupon_redemptions', 'access_policies', 'access_policy_audit']) {
    assert.match(migration, new RegExp("'" + table + "'"));
  }
});

test('session submission is bound to the authenticated owner and server-measured duration', () => {
  assert.match(edge, /eq\("user_id", user\.id\)\.maybeSingle\(\)/);
  assert.match(edge, /const actualElapsed = Math\.max\(1, Math\.floor\(\(now - startedAt\) \/ 1000\)\)/);
  assert.match(edge, /if \(accessAllowed !== true\) return reply\(403/);
});

test('inactive parent folders deny access before the admin bypass', () => {
  const folderCheck = migration.indexOf('SELECT * INTO v_folder FROM public.folders WHERE id = v_test.folder_id AND active = true;');
  const adminBypass = migration.indexOf("role IN ('admin', 'head_admin') THEN");
  assert.ok(folderCheck >= 0 && adminBypass > folderCheck, 'folder active check must precede admin bypass');
});

test('submission revalidates that the test and parent folder remain active', () => {
  assert.match(edge, /select\("id,title,language,mode,duration_minutes,passage,target_wpm,min_accuracy,free_error_pct,penalty_per_error,active,folder_id"\)\.eq\("id", session\.test_id\)\.eq\("active", true\)/);
  assert.match(edge, /if \(test\.folder_id\)[\s\S]*?from\("folders"\)[\s\S]*?eq\("active", true\)/);
});
