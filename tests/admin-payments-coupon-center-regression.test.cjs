const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Payments & Coupons admin view keeps ledger rendering alive and exposes reconciliation fields', () => {
  const root = path.join(__dirname, '..');
  const admin = fs.readFileSync(path.join(root, 'js/admin.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'css/admin-payments-center.css'), 'utf8');

  assert.match(admin, /id="admin-ledger-open-plans"/);
  assert.match(admin, /\$\('admin-ledger-open-plans'\)\?\.addEventListener/);
  assert.match(admin, /subtotal_minor,discount_minor,total_minor,coupon_id/);
  assert.match(admin, /subscription_coupons\(code\)/);
  assert.match(admin, /<th>Coupon<\/th>/);
  assert.match(admin, /Discount minor units/);
  assert.match(html, /css\/admin-payments-center\.css/);
  assert.match(styles, /@media\(max-width:760px\)/);
});

test('coupon admin can target all active plans or a selected subset only', () => {
  const root = path.join(__dirname, '..');
  const coupons = fs.readFileSync(path.join(root, 'js/admin-coupons.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261106190000_subscription_coupon_engine.sql'), 'utf8');

  assert.match(coupons, /coupon-scope/);
  assert.match(coupons, /All currently active plans/);
  assert.match(coupons, /Only selected plans/);
  assert.match(coupons, /eq\('is_active',true\)/);
  assert.match(coupons, /plans\.map\(p=>p\.id\)/);
  assert.match(coupons, /Select one or more active plans/);
  assert.match(migration, /cardinality\(v_coupon\.plan_ids\) > 0/);
  assert.match(migration, /Admins create subscription coupons/);
  assert.match(migration, /Admins update subscription coupons/);
});
