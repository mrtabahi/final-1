const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const webhook = fs.readFileSync(path.join(root, 'supabase/functions/razorpay-webhook/index.ts'), 'utf8');
const verify = fs.readFileSync(path.join(root, 'supabase/functions/verify-razorpay-payment/index.ts'), 'utf8');
const checkout = fs.readFileSync(path.join(root, 'supabase/functions/create-checkout/index.ts'), 'utf8');
const premium = fs.readFileSync(path.join(root, 'js/premium.js'), 'utf8');

test('Razorpay payment.failed webhook resolves the exact local order and validates amount/currency', () => {
  assert.match(webhook, /event\.event === "payment\.failed"/);
  assert.match(webhook, /\.eq\("provider_order_id", payment\.order_id\)/);
  assert.match(webhook, /Number\(payment\.amount\) !== Number\(order\.total_minor\)/);
  assert.match(webhook, /payment\.currency !== order\.currency/);
});

test('failed payment closes only pending orders and never downgrades paid orders', () => {
  assert.match(webhook, /\.update\(\{ status: "failed" \}\)/);
  assert.match(webhook, /\.eq\("status", "pending"\)/);
  assert.match(webhook, /A captured\/paid or already-closed order must never be downgraded/);
  assert.match(webhook, /order\.status === "pending"/);
});

test('client retry becomes available after failed order status is confirmed', () => {
  assert.match(premium, /\['failed','expired','cancelled'\]\.includes\(order\.status\)/);
  assert.match(premium, /delete btn\.dataset\.pendingOrderId/);
  assert.match(premium, /You can safely start a new checkout now/);
  assert.match(checkout, /update\(\{ status: "failed" \}\)/);
});

test('failed payment cannot activate membership; only captured payment reaches paid finalization', () => {
  assert.match(webhook, /payment\.status !== "captured" \|\| payment\.captured !== true/);
  assert.match(webhook, /rpc\("service_mark_order_paid"/);
  assert.match(verify, /payment\.status !== "captured" \|\| payment\.captured !== true/);
  assert.match(verify, /rpc\("service_mark_order_paid"/);
});
