const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'js/admin-subscriptions.js'), 'utf8');
const pricing = fs.readFileSync(path.join(root, 'js/premium.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261106120000_plan_purchase_limits_and_fixed_expiry.sql'), 'utf8');
const checkout = fs.readFileSync(path.join(root, 'supabase/functions/create-checkout/index.ts'), 'utf8');
const verify = fs.readFileSync(path.join(root, 'supabase/functions/verify-razorpay-payment/index.ts'), 'utf8');
const coupons = fs.readFileSync(path.join(root, 'supabase/migrations/20261106190000_subscription_coupon_engine.sql'), 'utf8');
const checkoutGuards = fs.readFileSync(path.join(root, 'supabase/migrations/20261107120000_checkout_candidate_entitlement_guards.sql'), 'utf8');

test('admin plan editor exposes expiry mode, fixed date and both purchase caps', () => {
  for (const id of ['sub-plan-expiry-mode', 'sub-plan-fixed-expiry', 'sub-plan-total-limit', 'sub-plan-user-limit']) {
    assert.match(admin, new RegExp('id="' + id + '"'));
  }
  assert.match(admin, /expiry_mode:expiryMode/);
  assert.match(admin, /fixed_expiry_date:expiryMode==='fixed_date'\?fixedExpiry:null/);
  assert.match(admin, /purchase_limit_total:totalLimit/);
  assert.match(admin, /purchase_limit_per_user:userLimit/);
});

test('fixed expiry is presented as a calendar date on public pricing cards', () => {
  assert.match(pricing, /expiry_mode,fixed_expiry_date,purchase_limit_total,purchase_limit_per_user/);
  assert.match(pricing, /Access until/);
  assert.match(pricing, /total purchases/);
  assert.match(pricing, /per account/);
  assert.match(pricing, /fixed_expiry_date>=todayIst/);
});

test('checkout transaction serializes capacity checks and reserves active pending orders', () => {
  assert.match(migration, /for update/);
  assert.match(migration, /o\.status in \('paid', 'free'\)/);
  assert.match(migration, /o\.status = 'pending' and o\.expires_at > v_now/);
  assert.match(migration, /purchase_limit_total/);
  assert.match(migration, /purchase_limit_per_user/);
});

test('fixed expiry is snapshotted onto orders and applied to membership in India time', () => {
  assert.match(migration, /add column if not exists expiry_mode/);
  assert.match(migration, /add column if not exists fixed_expiry_date date/);
  assert.match(migration, /v_plan\.fixed_expiry_date/);
  assert.match(migration, /Asia\/Kolkata/);
  assert.match(migration, /least\(v_now \+ interval '30 minutes', v_fixed_end\)/);
  assert.match(migration, /create trigger user_subscriptions_apply_plan_expiry/);
});

test('Razorpay server-side payment verification remains the activation gate', () => {
  assert.match(checkout, /rpc\("create_checkout_order"/);
  assert.match(verify, /rpc\("service_mark_order_paid"/);
  assert.match(verify, /Payment signature verification failed/);
});


test('payment retry checks the existing order before allowing another checkout', () => {
  assert.match(pricing, /async function checkPendingOrder\(btn\)/);
  assert.match(pricing, /from\('orders'\)\.select\('id,status,expires_at'\)/);
  assert.match(pricing, /if\(btn\.dataset\.pendingOrderId\)\{await checkPendingOrder\(btn\);return;\}/);
  assert.match(pricing, /btn\.textContent='Check payment status'/);
  assert.match(pricing, /delete btn\.dataset\.pendingOrderId/);
});

test('coupon engine validates eligibility and redemption limits in the checkout transaction', () => {
  assert.ok(coupons.includes('create table if not exists public.subscription_coupons'));
  assert.ok(coupons.includes('create policy "Admins read subscription coupons"'));
  assert.ok(coupons.includes('revoke all on public.subscription_coupons from anon'));
  assert.match(coupons, /for update/);
  assert.match(coupons, /max_redemptions_per_user/);
  assert.ok(coupons.includes("o.status in ('paid','free')"));
  assert.ok(coupons.includes("o.status = 'pending' and o.expires_at > v_now"));
  assert.match(coupons, /discount_minor/);
  assert.ok(coupons.includes('greatest(0, v_plan.price_minor - v_discount)'));
  assert.ok(coupons.includes('Asia/Kolkata'));
  assert.ok(coupons.includes('Cannot switch orders.coupon_id to subscription_coupons'));
  assert.match(coupons, /drop constraint if exists orders_coupon_id_fkey/);
});

test('checkout and coupon preview remain candidate-only and require configured entitlements', () => {
  assert.match(checkoutGuards, /role = 'candidate'/);
  assert.ok(checkoutGuards.includes('public.plan_entitlements'));
  assert.match(checkoutGuards, /Candidate sign-in required/);
  assert.match(checkoutGuards, /access entitlements are configured/);
});

test('premium checkout sends the coupon code to the server and displays the server-calculated discount', () => {
  assert.match(pricing, /coupon_code:appliedCouponCode/);
  assert.match(pricing, /securely validated/);
  assert.match(checkout, /p_coupon_code:/);
  assert.ok(checkout.includes('discount_minor: Number(order.discount_minor)'));
  assert.ok(checkout.includes('coupon_code: order.coupon_code'));
});
