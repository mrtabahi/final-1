'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Typing Game uses the existing home login prompt without navigating on cancel', () => {
  const home = read('js/home.js');
  const protectedList = home.split('const protectedTargets = new Set([')[1]?.split(']);')[0] || '';
  assert.ok(protectedList.includes("'fix-accuracy.html'"));
  assert.ok(!protectedList.includes('my_account.html'));
  assert.ok(home.includes('function showLoginPrompt(url)'));
  assert.ok(home.includes('data-login-cancel'));
  assert.ok(home.includes('data-login-ok'));
  assert.ok(home.includes('function closeLoginPrompt()'));
  assert.ok(home.includes('function navigateProtected(url)'));
  assert.ok(home.includes("location.href='login.html?redirect='"));
  assert.ok(read('index.html').includes('href="/fix-accuracy.html"'));
});

test('My Account is login-only and its content stays hidden until the session check resolves', () => {
  const gate = read('js/feature-access.js');
  const account = read('my_account.html');
  const publicRoutes = gate.split('alwaysPublicPages=new Set([')[1]?.split(']);')[0] || '';
  const loginRoutes = gate.split('loginRequiredPages=new Set([')[1]?.split(']);')[0] || '';
  assert.ok(loginRoutes.includes("'my_account.html'"));
  assert.ok(!publicRoutes.includes('my_account.html'));
  assert.ok(gate.includes('if(loginRequiredPages.has(currentPage))showAccessProgress(true)'));
  assert.ok(gate.includes('if(loginRequiredPages.has(currentPage)&&!user){'));
  assert.ok(gate.includes("classList.remove('arcade-auth-pending','account-auth-pending')"));
  assert.ok(account.includes('documentElement.classList.add("account-auth-pending")'));
  assert.ok(account.includes('html.account-auth-pending body{visibility:hidden!important}'));
  assert.ok(account.includes('js/feature-access.js'));
});
