const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const loader = fs.readFileSync('js/ads-loader.js', 'utf8');
const adsTxt = fs.readFileSync('ads.txt', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const typing = fs.readFileSync('Typing_test.html', 'utf8');

test('ads.txt contains the exact AdSense publisher declaration from the review screen', () => {
  assert.ok(adsTxt.split(/\\r?\\n/).includes('google.com, pub-2757719583090087, DIRECT, f08c47fec0942fa0'));
  assert.match(index, /google-adsense-account" content="ca-pub-2757719583090087"/);
  assert.match(typing, /google-adsense-account" content="ca-pub-2757719583090087"/);
});

test('AdSense loader requires admin global and page-level switches', () => {
  assert.match(loader, /ads_enabled !== true/);
  assert.match(loader, /settings\\[pageKey\\] !== true/);
});

test('signed-in users are checked by server-side paid subscription entitlement', () => {
  assert.match(loader, /auth\\.getUser\\(\\)/);
  assert.match(loader, /rpc\\('has_active_paid_subscription'\\)/);
  assert.match(loader, /hasPaid === true/);
  assert.match(loader, /entitlementError \\|\\| hasPaid === true \\|\\| hasPaid !== false/);
});

test('ads fail closed when authentication or membership cannot be verified', () => {
  assert.match(loader, /if \\(authError\\) return/);
  assert.match(loader, /if \\(entitlementError \\|\\| hasPaid === true \\|\\| hasPaid !== false\\) return/);
});

test('AdSense loader remains syntactically valid JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(loader, { filename: 'js/ads-loader.js' }));
});
