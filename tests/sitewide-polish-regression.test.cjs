'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('shared theme includes compact neon surfaces, form focus and reduced-motion support', () => {
  const css = read('css/main.css');
  assert.match(css, /--neon-cyan:\s*#22d3ee/i);
  assert.match(css, /body:not\(\.admin-body\).*background/s);
  assert.match(css, /width:\s*min\(440px,calc\(100vw - 24px\)\)/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.admin-ledger-table/);
});

test('admin navigation exposes payment ledger and guarded roles modules without future placeholders', () => {
  const html = read('admin.html');
  const js = read('js/admin.js');
  assert.match(html, /data-module="payments"[^>]*>[\s\S]*?Ledger/);
  assert.match(html, /data-module="roles"[^>]*>[\s\S]*?Guarded/);
  assert.doesNotMatch(html, /Future module|<em>Future<\/em>/i);
  assert.match(js, /async function renderPaymentsModule/);
  assert.match(js, /async function renderRolesModule/);
  assert.match(js, /from\('orders'\)/);
  assert.match(js, /from\('profiles'\)/);
  assert.match(js, /showAdminView\('candidates'\)/);
});

test('payment module does not mutate payment or refund state from the browser', () => {
  const js = read('js/admin.js');
  const start = js.indexOf('async function renderPaymentsModule');
  const end = js.indexOf('async function renderRolesModule', start);
  assert.ok(start >= 0 && end > start, 'payment module function boundaries exist');
  const moduleSource = js.slice(start, end);
  assert.doesNotMatch(moduleSource, /\.update\s*\(|\.insert\s*\(|\.delete\s*\(/);
  assert.match(moduleSource, /read-only/i);
  assert.match(moduleSource, /coupon-code table is configured/i);
});
test('home page internal HTML links point to files that exist in the repository', () => {
  const html = read('index.html');
  const localTargets = [...html.matchAll(/href=["']\/(?!\/)([^"'?#]+\.html)(?:[?#][^"']*)?["']/g)]
    .map(match => match[1]);
  const missing = [...new Set(localTargets)].filter(target => !fs.existsSync(path.join(root, target)));
  assert.deepEqual(missing, [], 'missing internal links: ' + missing.join(', '));
});
test('site-wide paywall preserves login, signup, password recovery, pricing and legal routes', () => {
  const access = read('js/feature-access.js');
  assert.match(access, /alwaysPublicPages=new Set\(\[[^\]]*'login\.html'[^\]]*'forgot\.html'[^\]]*'reset\.html'[^\]]*'premium\.html'[^\]]*'privacy-policy\.html'/);
  assert.match(access, /event\.key==='Escape'/);
  assert.match(access, /aria-describedby="feature-upgrade-copy"/);
  const css = read('css/main.css');
  assert.match(css, /\.feature-upgrade-backdrop\.is-open/);
  assert.match(css, /\.feature-site-lock-card/);
});

