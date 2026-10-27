const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('login page provides Google and email account creation with recovery actions', () => {
  const html = read('login.html');
  assert.match(html, /id="google-signin-button"/);
  assert.match(html, /id="google-signup-button"/);
  assert.match(html, /id="signup-form"/);
  assert.match(html, /id="signup-email"/);
  assert.match(html, /id="signup-password"/);
  assert.match(html, /id="forgot-password"|"Forgot password\?"/);
  assert.match(html, /forgot\.html/);
  assert.match(html, /id="signup-phone"[^>]*placeholder="\+91…"/);
  assert.match(html, /auth-shell/);
});

test('Google signup respects the registration pause and callback uses Google display name', () => {
  const auth = read('js/auth.js');
  const html = read('login.html');
  assert.match(auth, /async signInWithGoogle\(\{ isSignup = false \} = \{\}\)/);
  assert.match(auth, /settings\.registration_enabled === false/);
    assert.match(html, /user_metadata\\?\\.full_name \\|\\| data\\.session\\.user\\.user_metadata\\?\\.name/);
  assert.match(html, /AuthManager\.updateName\(googleName\)/);
});

test('site navigation only rewrites My Account links based on auth state', () => {
  const nav = read('js/account-nav.js');
    assert.match(nav, /my_account/);
  assert.match(nav, /signedIn \? 'My Account' : 'Login'/);
  assert.match(nav, /supabaseClient\.auth\.onAuthStateChange/);
  for (const file of ['index.html', 'Typing_test.html', 'dashboard.html', 'my_account.html']) {
    assert.match(read(file), /js\/account-nav\.js/);
  }
});

test('password recovery page keeps email reset and mobile OTP options', () => {
  const html = read('forgot.html');
  assert.match(html, /id="email-form"/);
  assert.match(html, /id="phone-form"/);
  assert.match(html, /id="otp-form"/);
  assert.match(html, /recovery-card/);
});
