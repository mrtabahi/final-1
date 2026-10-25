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
  const functionStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.can_access_test');
  const functionBody = migration.slice(functionStart);
  const folderCheck = functionBody.indexOf('SELECT * INTO v_folder FROM public.folders WHERE id = v_test.folder_id AND active = true;');
  const adminBypass = functionBody.indexOf("role IN ('admin', 'head_admin')");
  assert.ok(folderCheck >= 0 && adminBypass > folderCheck, 'folder active check must precede admin bypass');
});

test('submission revalidates that the test and parent folder remain active', () => {
  assert.match(edge, /select\("id,title,language,mode,duration_minutes,passage,target_wpm,min_accuracy,free_error_pct,penalty_per_error,active,folder_id"\)\.eq\("id", session\.test_id\)\.eq\("active", true\)/);
  assert.match(edge, /if \(test\.folder_id\)[\s\S]*?from\("folders"\)[\s\S]*?eq\("active", true\)/);
});

test('plan management writes go through admin-only SECURITY DEFINER RPCs', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_upsert_subscription_plan\(/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_set_plan_entitlements\(/);
  assert.match(migration, /auth\.uid\(\) IS NULL OR NOT public\.is_current_user_admin\(\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_upsert_subscription_plan\([\s\S]*?FROM PUBLIC, anon/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_set_plan_entitlements\(uuid, jsonb\) FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admin_upsert_subscription_plan\([\s\S]*?TO authenticated/);
});

test('plan management validates prices, duration, currency and entitlement payloads', () => {
  assert.match(migration, /p_price_minor < 0/);
  assert.match(migration, /IF p_currency IS NULL OR p_currency !~ '\^\[A-Z\]\[A-Z\]\[A-Z\]' OR length\(p_currency\) <> 3 THEN/);
  assert.match(migration, /p_duration_days < 1 OR p_duration_days > 3650/);
  assert.match(migration, /jsonb_array_length\(p_entitlements\) > 500/);
  assert.match(migration, /e\.resource_type NOT IN \('site', 'menu', 'submenu', 'folder', 'test', 'materials'\)/);
  assert.match(migration, /DELETE FROM public\.plan_entitlements WHERE plan_id = p_plan_id/);
});

test('plan editor uses server-side admin RPCs and never writes billing tables directly', () => {
  const plansPage = read('admin-plans.html');
  const plansJs = read('js/admin-plans.js');
  const adminPage = read('admin.html');
  assert.match(plansPage, /checkout is not connected yet/i);
  assert.match(plansJs, /rpc\('admin_list_subscription_plans'\)/);
  assert.match(plansJs, /rpc\('admin_get_plan_entitlements'/);
  assert.match(plansJs, /rpc\('admin_save_subscription_plan'/);
  assert.doesNotMatch(plansJs, /from\(['"]subscription_plans['"]\)/);
  assert.doesNotMatch(plansJs, /from\(['"]plan_entitlements['"]\)/);
  assert.match(adminPage, /href="admin-plans\.html"/);
});

test('combined plan save is atomic and authenticated execution is limited to admins', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_save_subscription_plan\(/);
  assert.match(migration, /public\.admin_upsert_subscription_plan\([\s\S]*?public\.admin_set_plan_entitlements\(/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_save_subscription_plan\([\s\S]*?FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admin_save_subscription_plan\([\s\S]*?TO authenticated/);
});

test('coupon admin UI uses server RPCs and does not directly mutate billing tables', () => {
  const paymentsPage = read('admin-payments.html');
  const paymentsJs = read('js/admin-payments.js');
  const adminPage = read('admin.html');
  assert.match(paymentsPage, /Payment gateway not connected/i);
  assert.match(paymentsJs, /rpc\('admin_list_coupons'\)/);
  assert.match(paymentsJs, /rpc\('admin_get_coupon_plan_eligibility'/);
  assert.match(paymentsJs, /rpc\('admin_save_coupon'/);
  assert.doesNotMatch(paymentsJs, /from\(['"]coupons['"]\)/);
  assert.doesNotMatch(paymentsJs, /from\(['"]coupon_plan_eligibility['"]\)/);
  assert.match(adminPage, /href="admin-payments\.html"/);
});

test('coupon RPCs are admin-only and validate discount, date and redemption limits', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_save_coupon\(/);
  assert.match(migration, /auth\.uid\(\) IS NULL OR NOT public\.is_current_user_admin\(\)/);
  assert.match(migration, /p_discount_type IS NULL OR p_discount_type NOT IN \('percent', 'fixed'\)/);
  assert.match(migration, /p_discount_value > 100/);
  assert.match(migration, /id = p_user_id AND role = 'candidate'/);
  assert.match(migration, /p_ends_at <= p_starts_at/);
  assert.match(migration, /p_max_redemptions_per_user < 1/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_save_coupon\([\s\S]*?FROM PUBLIC, anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admin_save_coupon\([\s\S]*?TO authenticated/);
});

test('manual entitlement overrides use audited, role-checked server RPCs', () => {
  const page = read('admin-entitlements.html');
  const js = read('js/admin-entitlements.js');
  const adminPage = read('admin.html');
  assert.match(page, /Changes are audited/i);
  assert.match(js, /rpc\('admin_list_user_entitlement_overrides'\)/);
  assert.match(js, /rpc\('admin_save_user_entitlement_override'/);
  assert.match(js, /rpc\('admin_revoke_user_entitlement_override'/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.user_entitlement_override_audit/);
  assert.match(migration, /CREATE TRIGGER user_entitlement_override_audit_trigger/);
  assert.match(migration, /'user_entitlement_override_audit'/);
  assert.match(adminPage, /href="admin-entitlements\.html"/);
});

test('manual override RPC limits resources and modes to what can_access_test enforces', () => {
  assert.match(migration, /p_resource_type NOT IN \('test', 'folder'\)/);
  assert.match(migration, /p_access_mode NOT IN \('free', 'paid', 'grant'\)/);
  assert.match(migration, /p_ends_at <= p_starts_at/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_revoke_user_entitlement_override\(/);
  assert.match(migration, /ends_at = now\(\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_save_user_entitlement_override\([\s\S]*?FROM PUBLIC, anon/);
});

test('subscription operations UI uses admin RPCs and does not write subscription tables directly', () => {
  const page = read('admin-subscriptions.html');
  const js = read('js/admin-subscriptions.js');
  const adminPage = read('admin.html');
  assert.match(page, /Manual grants immediately grant paid access/i);
  assert.match(js, /rpc\('admin_list_user_subscriptions'\)/);
  assert.match(js, /rpc\('admin_grant_user_subscription'/);
  assert.match(js, /confirm\('This will immediately grant this candidate/);
  assert.match(js, /rpc\('admin_cancel_user_subscription'/);
  assert.doesNotMatch(js, /from\(['"]user_subscriptions['"]\)/);
  assert.match(adminPage, /href="admin-subscriptions\.html"/);
});

test('manual subscriptions are admin-only, candidate-scoped and audited', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.user_subscription_audit/);
  assert.match(migration, /CREATE TRIGGER user_subscription_audit_trigger/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_grant_user_subscription\(/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.admin_cancel_user_subscription\(/);
  assert.match(migration, /id = p_user_id AND role = 'candidate'/);
  assert.match(migration, /A reason of 1-500 characters is required for manual grants/);
  assert.match(migration, /A cancellation reason of 1-500 characters is required/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_grant_user_subscription\([\s\S]*?FROM PUBLIC, anon/);
});

test('checkout order creation prices plans and coupons server-side with redemption reservations', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.create_checkout_order\(/);
  assert.match(migration, /role = 'candidate'/);
  assert.match(migration, /WHERE id = p_plan_id AND is_active = true FOR SHARE/);
  assert.match(migration, /FROM public\.coupons WHERE code = v_code FOR UPDATE/);
  assert.match(migration, /max_redemptions_per_user/);
  assert.match(migration, /CASE WHEN v_total = 0 THEN 'free' ELSE 'pending' END/);
  assert.match(migration, /INSERT INTO public\.coupon_redemptions/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.create_checkout_order\(uuid, text\) TO authenticated/);
});

test('only trusted service role can mark an order paid and activate a subscription', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.service_mark_order_paid\(/);
  assert.match(migration, /current_setting\('request\.jwt\.claim\.role', true\).*service_role/s);
  assert.match(migration, /p_amount_minor <> v_order\.total_minor OR p_currency <> v_order\.currency/);
  assert.match(migration, /v_order\.expires_at <= now\(\)/);
  assert.match(migration, /UPDATE public\.orders SET status = 'paid'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.service_mark_order_paid\([\s\S]*?FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.service_mark_order_paid\([\s\S]*?TO service_role/);
});
