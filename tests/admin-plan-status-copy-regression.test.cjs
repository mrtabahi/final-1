const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin-plans.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'js/admin-plans.js'), 'utf8');

test('admin plan catalog describes checkout as implemented but still release-gated', () => {
  assert.match(html, /Paid activation is still gated/);
  assert.match(html, /Razorpay Test Mode secrets/);
  assert.match(html, /authenticated checkout, webhook, refund, and access-control tests/);
  assert.doesNotMatch(html, /Checkout is not connected yet/);
  assert.doesNotMatch(html, /Keep plans inactive until server-side checkout and payment verification are implemented/);
});

test('plan loading and save statuses do not misrepresent checkout as unimplemented', () => {
  assert.match(script, /Paid checkout is implemented; activation remains gated pending Razorpay Test Mode configuration and end-to-end verification/);
  assert.match(script, /Paid activation remains gated pending Razorpay Test Mode configuration and payment lifecycle verification/);
  assert.doesNotMatch(script, /Checkout and payment verification are not connected yet/);
  assert.doesNotMatch(script, /Checkout remains disabled until payment verification is implemented/);
});
