const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const loginHtml = fs.readFileSync(path.join(__dirname, '../login.html'), 'utf8');

test('login page is a compact single-card layout without Google auth controls', () => {
  assert.doesNotMatch(loginHtml, /id="google-signin-button"|id="google-signup-button"/);
  assert.doesNotMatch(loginHtml, /Continue with Google|Sign up with Google/);
  assert.doesNotMatch(loginHtml, /<aside class="auth-showcase">/);
  assert.match(loginHtml, /width:min\(100%,390px\)/);
});

test('email/password login and manual registration remain available', () => {
  assert.match(loginHtml, /id="login-form"/);
  assert.match(loginHtml, /id="login-id"/);
  assert.match(loginHtml, /id="login-password"/);
  assert.match(loginHtml, /id="signup-form"/);
  assert.doesNotMatch(loginHtml, /id="signup-name"/);
  assert.match(loginHtml, /id="signup-email"/);
  assert.match(loginHtml, /id="signup-phone"/);
  assert.match(loginHtml, /id="signup-password"/);
  assert.match(loginHtml, /id="signup-confirm"/);
  assert.match(loginHtml, /aria-live="polite"/);
});
