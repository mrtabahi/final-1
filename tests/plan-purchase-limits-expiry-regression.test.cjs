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
  assert.match(pricing, /total purc¶»§q«^