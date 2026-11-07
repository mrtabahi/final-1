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
test('premium purchase entry points use one responsive modal and preserve checkout safety', () => {
  const root = path.join(__dirname, '..');
  const gate = fs.readFileSync(path.join(root, 'js/feature-access.js'), 'utf8');
  const premium = fs.readFileSync(path.join(root, 'premium.html'), 'utf8');
  const premiumScript = fs.readFileSync(path.join(root, 'js/premium.js'), 'utf8');
  const modal = fs.readFileSync(path.join(root, 'js/premium-modal.js'), 'utf8');
  assert.match(gate, /PremiumModal\.open\(\)/);
  assert.match(gate, /premium-modal\.js/);
  assert.doesNotMatch(gate, /<iframe title="Premium Pass plans"/);
  assert.match(premium, /location\.replace\("my_account\.html\?openPremium=1"\)/);
  assert.match(premium, /premium-dialog-cancel/);
  assert.match(premium, /premium-coupon-code/);
  assert.match(premium, /Coupon discount applies only after secure validation/);
  assert.match(premiumScript, /coupon_code:appliedCouponCode/);
  assert.match(premiumScript, /preview_subscription_coupon/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /premium-global-backdrop/);
  assert.match(modal, /initPremiumPurchase/);
  assert.match(modal, /width:min\(1040px,calc\(100vw - 32px\)\)!important/);
  assert.match(modal, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  const game = fs.readFileSync(path.join(root, 'fix-accuracy.html'), 'utf8');
  assert.doesNotMatch(game, /feature-access-pending/);
  assert.match(gate, /feature-route-pending/);
  assert.match(gate, /feature-access-sweep/);
  assert.match(gate, /client\.rpc\('can_access_test'/);
  assert.match(gate, /Membership is non-blocking on free routes/);
  assert.match(gate, /if\(rr\.error\)throw rr\.error/);
  assert.match(gate, /Access verification is temporarily unavailable/);
});


test('typing categories paint cached data immediately and refresh catalogue alongside auth', () => {
  const root = path.join(__dirname, '..');
  const page = fs.readFileSync(path.join(root, 'Typing_test.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'js/typing-tests.js'), 'utf8');
  const auth = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
  assert.match(page, /<script defer src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"><\/script>/);
  assert.match(page, /typing-tests\.js\?v=20261108-remove-self-card1/);
  assert.match(script, /decoding-hcm:typing-categories:v2/);
  assert.ok(script.indexOf('if (cachedFolders) renderCategories(cachedFolders, true)') < script.indexOf('AuthManager.requireCandidateGuard()'));
  assert.match(script, /Promise\.all\(\[candidateCheck,catalogueRequest\]\)/);
  assert.match(script, /rpc\('list_test_catalog'/);
  assert.match(auth, /setTimeout\(\(\) => \{ initialHeartbeatReady = true; heartbeat\(\); \}, 8000\)/);
  assert.match(auth, /nowMs - lastAttemptAt < 45000/);
});

test('admin membership history shows Auth email and linked order purchase timestamp; plan deletion preserves history', () => {
  const root = path.join(__dirname, '..');
  const moduleScript = fs.readFileSync(path.join(root, 'js/admin-subscriptions.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261107200000_admin_membership_purchase_details_rpc.sql'), 'utf8');
  assert.match(moduleScript, /rpc\('admin_recent_memberships'\)/);
  assert.match(moduleScript, /candidate_email/);
  assert.match(moduleScript, /order_created_at/);
  assert.match(moduleScript, /timeZone:'Asia\/Kolkata'/);
  assert.match(moduleScript, /data-delete-plan/);
  assert.match(moduleScript, /Unpublish it to preserve purchase history/);
  assert.match(migration, /join auth\.users au on au\.id = us\.user_id/);
  assert.match(migration, /left join public\.orders o on o\.id = us\.order_id/);
  assert.match(migration, /p\.role = 'admin'/);
  assert.match(migration, /revoke all on function public\.admin_recent_memberships\(\) from public, anon/i);
});
