'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Typing Game uses the existing home login prompt without navigating on cancel', () => {
  const home = read('js/home.js');
  assert.match(home, /protectedTargets = new Set\(\[[^\]]*'fix-accuracy\.html'/);
  const protectedList = home.match(/protectedTargets = new Set\(\[([^\]]+)\]\)/)?.[1] || '';
  assert.doesNotMatch(protectedList, /my_account\.html/);
  assert.match(home, /function showLoginPrompt\(url\)/);
  assert.match(home, /data-login-cancel/);
  assert.match(home, /data-login-ok/);
  assert.match(home, /function closeLoginPrompt\(\)/);
  assert.match(home, /function navigateProtected\(url\)/);
  assert.match(home, /location\.href='login\.html\?redirect='/);
  assert.match(read('index.html'), /href="\/fix-accuracy\.html"/);
});

test('My Account is login-only and its content stays hidden until the session check resolves', () => {
  const gate = read('js/feature-access.js');
  const account = read('my_account.html');
  assert.match(gate, /loginRequiredPages = new Set\([^;]*'my_account\.html'/);
  assert.doesNotMatch(gate.match(/const alwaysPublicPages = new Set\(\[([^\]]+)\]\)/)?.[1] || '', /my_account\.html/);
  assert.match(gate, /if\(loginRequiredPages\.has\(currentPage\)\)showAccessProgress\(true\)/);
  assert.match(gate, /if\(loginRequiredPages\.has\(currentPage\)&&!user\)\{\s*redirectToLogin\(\)/);
  assert.match(gate, /classList\.remove\('arcade-auth-pending','account-auth-pending'\)/);
  assert.match(account, /documentElement\.classList\.add\("account-auth-pending"\)/);
  assert.match(account, /html\.account-auth-pending body\{visibility:hidden!important\}/);
  assert.match(account, /js\/feature-access\.js/);
});
