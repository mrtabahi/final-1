const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('manual account creation uses only email, mobile, password and confirmation', () => {
  const html = read('login.html');
  for (const token of ['id="signup-form"', 'id="signup-email"', 'id="signup-phone"', 'id="signup-password"', 'id="signup-confirm"', 'Forgot password?', 'forgot.html', 'auth-shell']) {
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

test('site navigation rewrites My Account links based on auth state', () => {
  const nav = read('js/account-nav.js');
  assert.ok(nav.includes('my_account.html'));
  assert.ok(nav.includes("signedIn ? 'My Account' : 'Login'"));
  assert.ok(nav.includes('supabaseClient.auth.onAuthStateChange'));
  for (const file of ['index.html', 'Typing_test.html', 'dashboard.html', 'my_account.html']) {
    assert.ok(read(file).includes('js/account-nav.js'), file + ' should load account navigation');
  }
});

test('login page supports manual password login and does not expose Google OAuth', () => {
  const html = read('login.html');
  assert.ok(html.includes('id="login-password"'));
  assert.ok(!html.includes('google-signin-button'));
  assert.ok(!html.includes('google-signup-button'));
  assert.ok(!html.includes('signInWithOAuth'));
  assert.ok(!html.includes('oauth=1'));
  assert.ok(!read('js/auth.js').includes('signInWithGoogle'));
  assert.ok(!read('js/auth.js').includes("provider: 'google'"));
  assert.ok(!html.includes('sendMagicLink('));
  assert.ok(!html.includes('resendConfirmation('));
});

test('password reset emails a link and reset page asks for new password plus confirmation', () => {
  const forgot = read('forgot.html');
  const reset = read('reset.html');
  assert.ok(forgot.includes('resetPasswordForEmail'));
  assert.ok(forgot.includes("new URL('/reset.html',window.location.origin)"));
  assert.ok(forgot.includes('resetPasswordForEmail'));
  assert.ok(forgot.includes('If this email is registered'));
  assert.ok(!forgot.includes('phone-form') && !forgot.includes('otp-form'));
  assert.ok(reset.includes('id="new-password"'));
  assert.ok(reset.includes('id="confirm-password"'));
  assert.ok(reset.includes("event === 'PASSWORD_RECOVERY'"));
  assert.ok(reset.includes('auth.updateUser({password})'));
  assert.ok(reset.includes('Passwords do not match.'));
  assert.ok(reset.includes('This reset link is invalid or expired.'));
  assert.ok(reset.includes("window.location.href = 'login.html?passwordReset=success'"));
  assert.ok(!forgot.includes('decoding-hcm.vercel.app'));
  assert.ok(!reset.includes('decoding-hcm.vercel.app'));
});


test('admin navigation excludes public Pro menu and resets shared module shell', () => {
  const html = read('admin.html');
  const js = read('js/admin.js');
  assert.equal(html.includes('data-module="workspace-banner"'), false);
  assert.match(js, /Legacy modules may replace #view-module\.innerHTML/);
  assert.match(js, /views\.module\.innerHTML =/);
  assert.match(js, /renderEmbeddedAdminTool\(view, renderSequence\)/);
  assert.match(js, /new DOMParser\(\)/, 'legacy tool pages should render inline rather than inside iframes');
  assert.match(js, /admin-tool-ready/, 'inline controls should initialize after markup is inserted');
  assert.doesNotMatch(js, /<iframe class="admin-tool-frame"/, 'admin modules should not depend on iframe rendering');
});
