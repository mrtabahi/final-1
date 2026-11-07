const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const loader = fs.readFileSync('js/ads-loader.js', 'utf8');
const adsTxt = fs.readFileSync('ads.txt', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const typing = fs.readFileSync('Typing_test.html', 'utf8');

test('ads.txt contains the exact AdSense publisher declaration from the review screen', () => {
  assert.equal(adsTxt.trim(), 'google.com, pub-2757719583090087, DIRECT, f08c47fec0942fa0');
  assert.ok(index.includes('google-adsense-account" content="ca-pub-2757719583090087"'));
  assert.ok(typing.includes('google-adsense-account" content="ca-pub-2757719583090087"'));
});

test('AdSense loader requires admin global and page-level switches', () => {
  assert.ok(loader.includes('settings.ads_enabled !== true'));
  assert.ok(loader.includes('settings[pageKey] !== true'));
});

test('signed-in users are checked by server-side paid subscription entitlement', () => {
  assert.ok(loader.includes('supabaseClient.auth.getUser()'));
  assert.ok(loader.includes("rpc('has_active_paid_subscription')"));
  assert.ok(loader.includes('hasPaid === true'));
  assert.ok(loader.includes('hasPaid !== false'));
});

test('ads fail closed when authentication or membership cannot be verified', () => {
  assert.ok(loader.includes('if (authError) return'));
  assert.ok(loader.includes('if (entitlementError || hasPaid === true || hasPaid !== false) return'));
});

test('AdSense loader remains syntactically valid JavaScript', () => {
  assert.doesNotThrow(() => new vm.Script(loader, { filename: 'js/ads-loader.js' }));
});
