const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const premium = fs.readFileSync(path.join(root, 'js/premium.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'premium.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css/premium-coupons.css'), 'utf8');
const modal = fs.readFileSync(path.join(root, 'js/premium-modal.js'), 'utf8');
const checkout = fs.readFileSync(path.join(root, 'supabase/functions/create-checkout/index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261107180000_razorpay_minimum_order_amount.sql'), 'utf8');

test('Apply validates the coupon through the authenticated preview RPC before checkout', () => {
  assert.match(premium, /client\.rpc\('preview_subscription_coupon'/);
  assert.match(premium, /p_plan_id:plan\.id,p_coupon_code:code/);
  assert.match(premium, /data\.valid!==true/);
  assert.match(premium, /appliedCouponCode=code/);
  assert.match(premium, /This coupon is not valid for this plan/);
  assert.match(premium, /couponPreviewByPlan\.has\(planId\)/);
});

test('only eligible plan cards receive server-calculated prices and coupon animation', () => {
  assert.match(premium, /data-plan-price=/);
  assert.match(premium, /preview\.total_minor/);
  assert.match(premium, /preview\.discount_minor/);
  assert.match(premium, /sub-price-original/);
  assert.match(premium, /sub-price-discounted/);
  assert.match(styles, /@keyframes coupon-price-glow/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(html, /premium-coupons\.css/);
  assert.match(modal, /premium\.js\?v=20261107-coupon-preview1/);
});

test('invalidating or editing coupon input clears the applied state and restores plan prices', () => {
  assert.match(premium, /couponInput\?\.addEventListener\('input',resetCouponState\)/);
  assert.match(premium, /couponPreviewByPlan\.clear\(\)/);
  assert.match(premium, /couponPreviewByPlan\.has\(planId\)/);
});

test('Razorpay minimum amount is enforced before provider order creation', () => {
  assert.match(checkout, /Number\(order\.total_minor\) < 100/);
  assert.match(checkout, /Razorpay requires a minimum payment of ₹1/);
  assert.match(checkout, /orders_razorpay_minimum_amount_check/);
  assert.match(migration, /status = 'free' and total_minor = 0/);
  assert.match(migration, /status in \('pending', 'paid'\) and total_minor >= 100/);
});

test('zero-total coupon orders still activate free memberships without opening Razorpay', () => {
  assert.match(premium, /data\?\.mode==='free'/);
  assert.match(checkout, /order\.status === "free" \|\| Number\(order\.total_minor\) === 0/);
  assert.match(checkout, /mode: "free", order/);
});
