const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const webhook = read('supabase/functions/razorpay-webhook/index.ts');
const verifier = read('supabase/functions/verify-razorpay-payment/index.ts');

test('Razorpay webhook rejects non-POST requests and oversized/empty bodies', () => {
  assert.match(webhook, /if \(req\.method !== "POST"\) return json\(405/);
  assert.match(webhook, /rawBody\.length === 0 \|\| rawBody\.length > 1024 \* 1024/);
});

test('Razorpay webhook authenticates the exact raw body before parsing JSON', () => {
  const signatureCheck = webhook.indexOf('const expectedSignature = await hmacHex(webhookSecret, rawBody)');
  const parseJson = webhook.indexOf('event = JSON.parse(rawBody)');
  assert.ok(signatureCheck >= 0, 'HMAC must be calculated from raw request body');
  assert.ok(parseJson > signatureCheck, 'JSON parsing must happen only after signature verification');
  assert.match(webhook, /!\/\^\[a-f0-9\]\{64\}\$\/i\.test\(suppliedSignature\)/);
  assert.match(webhook, /constantTimeEqual\(expectedSignature\.toLowerCase\(\), suppliedSignature\.toLowerCase\(\)\)/);
  assert.match(webhook, /return json\(401, \{ error: "Invalid webhook signature\." \}\)/);
});

test('webhook retries with an existing provider event ID are idempotently acknowledged', () => {
  assert.match(webhook, /\.eq\("provider", "razorpay"\)\.eq\("provider_event_id", eventId\)\.maybeSingle\(\)/);
  assert.match(webhook, /if \(existing\) return json\(200, \{ received: true, duplicate: true \}\)/);
  assert.match(webhook, /if \(lookupError\) return json\(503/);
});

test('captured payments must match the local order amount and currency', () => {
  assert.match(webhook, /payment\.status !== "captured" && payment\.captured !== true/);
  assert.match(webhook, /Number\(payment\.amount\) !== Number\(order\.total_minor\) \|\| payment\.currency !== order\.currency/);
  assert.match(webhook, /return json\(400, \{ error: "Payment amount or currency mismatch\." \}\)/);
});

test('late captured payments use a guarded refund claim and reconcile existing refunds before creating another', () => {
  assert.match(webhook, /service_record_late_payment_for_refund/);
  assert.match(webhook, /service_claim_late_refund/);
  assert.match(webhook, /\/v1\/payments\/.*\/refunds/);
  assert.match(webhook, /if \(!fullRefund && refundedTotal > 0\)/);
  assert.match(webhook, /\/v1\/payments\/.*\/refund/);
  assert.match(webhook, /local_order_id: order\.id, reason: "late_payment_after_expiry"/);
});

test('payment callback verifier checks the authenticated owner, HMAC, and provider payment state', () => {
  assert.match(verifier, /auth\.getUser\(accessToken\)/);
  assert.match(verifier, /user_id.*user\.id|eq\("user_id", user\.id\)/s);
  assert.match(verifier, /RAZORPAY_KEY_SECRET/);
  assert.match(verifier, /hmac|signature/i);
  assert.match(verifier, /captured|status/i);
  assert.match(verifier, /service_mark_order_paid/);
});

test('webhook configuration errors fail closed and do not expose secret values', () => {
  assert.match(webhook, /if \(!supabaseUrl \|\| !serviceRoleKey \|\| !webhookSecret \|\| !keyId \|\| !keySecret\)/);
  assert.match(webhook, /console\.error\("Razorpay webhook configuration is incomplete\."\)/);
  assert.doesNotMatch(webhook, /console\.(log|error|warn)\([^\n]*(webhookSecret|keySecret|serviceRoleKey)/);
});
