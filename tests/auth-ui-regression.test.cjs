const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('login page provides Google and email account creation with recovery actions', () => {
  const html = read('login.html');
  for (const token of ['id="google-signin-button"', 'id="google-signup-button"', 'id="signup-form"', 'id="signup-email"', 'id="signup-password"', 'Forgot password?', 'forgot.html', 'auth-shell']) {
    assert.ok(html.includes(token), 'missing login UI token: ' + token);
  }
  assert.ok(html.includes('id="signup-phone"') && html.includes('(optional)'), 'phone should be optional for email signup');
});

test('Google signup respects the registration pause and callback uses Google display name', () => {
  const auth = read('js/auth.js');
  const html = read('login.html');
  assert.ok(auth.includes('async signInWithGoogle({ isSignup = false } = {})'));
  assert.ok(auth.includes('settings.registration_enabled === false'));
  assert.ok(html.includes('user_metadata?.full_name || data.session.user.user_metadata?.name'));
  assert.ok(html.includes('AuthManager.updateName(googleName)'));
});

test('site navigation only rewrites My Account links based on auth state', () => {
  const nav = read('js/account-nav.js');
  assert.ok(nav.includes('my_account.html'));
  assert.ok(nav.includes("signedIn ? 'My Account' : 'Login'"));
  assert.ok(nav.includes('supabaseClient.auth.onAuthStateChange'));
  for (const file of ['index.html', 'Typing_test.html', 'dashboard.html', 'my_account.html']) {
    assert.ok(read(file).includes('js/account-nav.js'), file + ' should load account navigation');
  }
});

test('password recovery page keeps email reset and mobile OTP options', () => {
  const html = read('forgot.html');
  for (const token of ['id="email-form"', 'id="phone-form"', 'id="otp-form"', 'recovery-card']) {
    assert.ok(html.includes(token), 'missing recovery UI token: ' + token);
  }
});
