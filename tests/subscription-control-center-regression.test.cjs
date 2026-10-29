const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('subscription admin controls are wired and server access remains role-gated', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  const admin = fs.readFileSync(path.join(root, 'js/admin.js'), 'utf8');
  const moduleScript = fs.readFileSync(path.join(root, 'js/admin-subscriptions.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261028150000_subscription_control_foundation.sql'), 'utf8');

  assert.match(html, /css\/subscription-control-center\.css/);
  assert.match(html, /js\/admin-subscriptions\.js/);
  assert.match(html, /data-module="subscriptions"/);
  assert.match(html, /module-ready">Active<\/em>/);
  assert.match(admin, /view === 'subscriptions'/);
  assert.match(admin, /window\.renderSubscriptionsModule\(\)/);
  assert.match(moduleScript, /subscription_plans/);
  assert.match(moduleScript, /user_subscriptions/);
  assert.match(moduleScript, /This is an administrative grant, not a payment confirmation/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /Admins manage subscription plans/);
  assert.match(migration, /Candidates read own subscriptions/);
  assert.match(migration, /Admins manage subscriptions/);
});

test('public pricing and account UI are connected to subscription records', () => {
  const root = path.join(__dirname, '..');
  const premium = fs.readFileSync(path.join(root, 'premium.html'), 'utf8');
  const premiumScript = fs.readFileSync(path.join(root, 'js/premium.js'), 'utf8');
  const account = fs.readFileSync(path.join(root, 'my_account.html'), 'utf8');
  const accountScript = fs.readFileSync(path.join(root, 'js/my-subscription.js'), 'utf8');
  const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(home, /href="\/?premium\.html"/);
  assert.match(premium, /premium-plan-grid/);
  assert.match(premium, /js\/premium\.js/);
  assert.match(premiumScript, /functions\.invoke\('create-checkout'/);
  assert.match(premiumScript, /No payment has been taken/);
  assert.match(account, /Subscription &amp; access/);
  assert.match(account, /js\/my-subscription\.js/);
  assert.match(accountScript, /user_subscriptions/);
  assert.match(accountScript, /LAST SUCCESSFUL PAYMENT/);
});