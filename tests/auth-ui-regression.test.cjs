const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('manual account creation uses only email, mobile, password and confirmation', () => {
  const html = read('login.html');
  for (const token of ['id="google-signin-button"', 'id="google-signup-button"', 'id="signup-form"', 'id="signup-email"', 'id="signup-phone"', 'id="signup-password"', 'id="signup-confirm"', 'Forgot password?', 'forgot.html', 'auth-shell']) {
    assert.ok(html.includes(token), 'missing auth UI token: ' + token);
  }
  assert.ok(!html.includes('id="signup-name"'), 'manual signup should not request a name');
  assert.ok(!html.includes('(optional)'), 'mobile number should be requested');
  assert.ok(html.includes('No OTP or email confirmation step is used for manual registration'));
  assert.ok(!html.includes('magic-link-button'), 'magic sign-in link option should be removed');
  assert.ok(!html.includes('resend-confirmation-button'), 'resend confirmation option should be removed');
  assert.ok(!html.includes('Email me a secure sign-in link'));
  assert.ok(!html.includes('Resend confirmation email'));
  assert.ok(!html.includes('Email confirmation may still be required'));
  assert.ok(html.includes('AuthManager.register({email:$('));
});

test('manual signup stores phone as metadata and does not trigger phone OTP', () => {
  const auth = read('js/auth.js');
  assert.ok(auth.includes('async register({ email, phone, password, fullName = \'\' })'));
  assert.ok(auth.includes('phone: normalizedPhone'));
  assert.ok(auth.includes('Do not call updateUser({phone})'));
  assert.ok(!auth.includes('await supabaseClient.auth.updateUser({\n          phone: normalizedPhone'));
});

test('Google signup respects registration pause and uses Google display name', () => {
  const auth = read('js/auth.js');
  const html = read('login.html');
  assert.ok(auth.includes('async signInWithGoogle({ isSignup = false } = {})'));
  assert.ok(auth.includes('settings.registration_enabled === false'));
  assert.ok(html.includes('user_metadata?.full_name || data.session.user.user_metadata?.name'));
  assert.ok(html.includes('AuthManager.updateName(googleName)'));
});

test('site navigation rewrites My Account links based on auth state', () => {
  const nav = read('js/account-nav.js');
  assert.ok(nav.includes('my_account.html'));
  assert.ok(nav.includes("signedIn ? 'My Account' : 'Login'"));
  assert.ok(nav.includes('supabaseClient.auth.onAuthStateChange'));
  for (const file of ['index.html', 'Typing_test.html', 'dashboard.html', 'my_account.html']) {
    assert.ok(read(file).includes('js/account-nav.js'), file + ' should load account navigation');
  }
});

test('login page only offers password login, Google and email/password signup', () => {
  const html = read('login.html');
  assert.ok(html.includes('id="login-password"'));
  assert.ok(html.includes('id="google-signin-button"'));
  assert.ok(html.includes('id="google-signup-button"'));
  assert.ok(!html.includes('sendMagicLink('));
  assert.ok(!html.includes('resendConfirmation('));
});

test('password reset emails a link and reset page asks for new password plus confirmation', () => {
  const forgot = read('forgot.html');
  const reset = read('reset.html');
  assert.ok(forgot.includes('resetPasswordForEmail'));
  assert.ok(forgot.includes("new URL('/reset.html',window.location.origin)"));
  assert.ok(!forgot.includes('phone-form') && !forgot.includes('otp-form'));
  assert.ok(reset.includes('id="new-password"'));
  assert.ok(reset.includes('id="confirm-password"'));
  assert.ok(reset.includes('auth.updateUser({password})'));
});


test('admin navigation excludes public Pro menu and resets shared module shell', () => {
  const html = read('admin.html');
  const js = read('js/admin.js');
  assert.equal(html.includes('data-module="workspace-banner"'), false);
  assert.match(js, /Legacy modules may replace #view-module\.innerHTML/);
  assert.match(js, /views\.module\.innerHTML =/);
  assert.match(js, /renderEmbeddedAdminTool\(view, renderSequence\)/);
});
