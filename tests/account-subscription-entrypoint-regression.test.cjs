const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('subscription UI is embedded in My Account with an accessible upgrade dialog', () => {
  const page = read('my_account.html');
  const script = read('js/account-subscription.js');
  const css = read('css/account-subscription.css');
  assert.match(page, /id="account-subscription"/);
  assert.match(page, /id="account-upgrade-modal"/);
  assert.match(page, /role="dialog" aria-modal="true"/);
  assert.match(page, /account-subscription\.css/);
  assert.match(page, /js\/account-subscription\.js/);
  assert.doesNotMatch(page, /href="my-subscription\.html"/);
  assert.match(script, /rpc\('get_active_subscription_plans'\)/);
  assert.match(script, /rpc\('get_my_subscription_overview'\)/);
  assert.match(script, /functions\.invoke\('create-checkout'/);
  assert.match(script, /functions\.invoke\('verify-razorpay-payment'/);
  assert.match(script, /event\.key==='Escape'/);
  assert.match(script, /prefers-reduced-motion/);
  assert.match(css, /accountGlow/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('legacy subscription URL redirects to My Account and the admin editor offers a reusable upgrade link', () => {
  const legacy = read('my-subscription.html');
  const adminContent = read('js/admin-content.js');
  const home = read('index.html');
  assert.match(legacy, /my_account\.html#upgrade-plan/);
  assert.doesNotMatch(home, /href="my-subscription\.html"/);
  assert.match(adminContent, /site-content-use-subscription-link/);
  assert.match(adminContent, /my_account\.html#upgrade-plan/);
});
