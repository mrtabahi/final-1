const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const readFunction = (name) => fs.readFileSync(
  path.join(root, "supabase", "functions", name, "index.ts"),
  "utf8",
);

test("checkout verification routes captured payments after expiry to refund handling", () => {
  const source = readFunction("verify-razorpay-payment");
  const expiryGuard = source.indexOf(
    "providerCreatedAt.getTime() > new Date(order.expires_at).getTime()",
  );
  const latePaymentRpc = source.indexOf(
    'serviceClient.rpc("service_record_late_payment_for_refund"',
  );
  const paidRpc = source.indexOf(
    'serviceClient.rpc("service_mark_order_paid"',
  );

  assert.notEqual(expiryGuard, -1, "verification must compare provider capture time with order expiry");
  assert.notEqual(latePaymentRpc, -1, "late captures must be recorded for refund handling");
  assert.notEqual(paidRpc, -1, "on-time captures must retain the normal paid finalization path");
  assert.ok(expiryGuard < latePaymentRpc, "expiry must be checked before late-payment recording");
  assert.ok(latePaymentRpc < paidRpc, "late-payment handling must branch before subscription activation");
  assert.match(source, /refund_reason:\s*"late_payment_after_expiry"/);
  assert.match(source, /status:\s*"refund_required"/);
});

test("signed webhook retains its independent late-payment expiry handling", () => {
  const source = readFunction("razorpay-webhook");
  assert.match(
    source,
    /providerCreatedAt\s*\*\s*1000\s*>\s*new Date\(order\.expires_at\)\.getTime\(\)/,
  );
  assert.match(source, /service_record_late_payment_for_refund/);
  assert.match(source, /service_claim_late_refund/);
});
