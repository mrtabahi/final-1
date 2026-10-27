const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function readRepoFile(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("access-control page fails closed when admin dependencies or identity are unavailable", () => {
  const script = readRepoFile("js/admin-access.js");

  assert.match(script, /typeof AuthManager === 'undefined' \|\| typeof supabaseClient === 'undefined'/);
  assert.match(script, /AuthManager\.requireAdminGuard\(\)/);
  assert.match(script, /!auth\?\.user \|\| !auth\?\.profile/);
  assert.match(script, /\['admin','head_admin'\]\.includes\(String\(auth\.profile\.role \|\| ''\)\.toLowerCase\(\)\)/);

  const guardIndex = script.indexOf("AuthManager.requireAdminGuard()");
  const revealIndex = script.indexOf("app.hidden = false");
  assert.ok(guardIndex >= 0 && revealIndex > guardIndex, "admin UI must not be revealed before the guard runs");
});

test("access policy renderer escapes database values before inserting dynamic HTML", () => {
  const script = readRepoFile("js/admin-access.js");

  assert.match(script, /const escapeHtml = \(value\) => String\(value \?\? ''\)\.replace\(\/\[&<>'"\]\/g/);
  assert.match(script, /escapeHtml\(folder\.name\)/);
  assert.match(script, /escapeHtml\(folder\.description \|\| 'No description'\)/);
  assert.match(script, /escapeHtml\(test\.title\)/);
  assert.match(script, /escapeHtml\(resourceId\)/);
});

test("admin can configure Paid access while server-side candidate access enforcement remains required", () => {
  const html = readRepoFile("admin-access.html");
  const script = readRepoFile("js/admin-access.js");
  const migration = readRepoFile("supabase/migrations/20261026000100_access_monetization_foundation.sql");

  assert.match(html, /Paid access is enforced by the server-side test access check/);
  assert.match(script, /<option value="paid"[^>]*>Paid · subscription required/);
  assert.doesNotMatch(script, /<option value="paid" disabled/);
  assert.doesNotMatch(script, /Paid access is locked until passage delivery is enforced server-side/);
  assert.match(script, /modeSelect\('folder', folder\.id, folder\.access_mode \|\| 'paid'\)/);
  assert.match(script, /modeSelect\('test', test\.id, test\.access_mode \|\| 'inherit'\)/);
  assert.match(script, /update\(\{access_mode:mode\}\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.can_access_test/);
  assert.match(migration, /CREATE POLICY tests_candidate_select ON public\.tests/);
});

test("policy save reports database failures and refuses silent zero-row updates", () => {
  const script = readRepoFile("js/admin-access.js");

  assert.match(script, /\.update\(\{access_mode:mode\}\)\.eq\('id', id\)\.select\('id,access_mode'\)\.maybeSingle\(\)/);
  assert.match(script, /if \(!result\.data\) throw new Error\('No row updated/);
  assert.match(script, /Save failed:/);
  assert.match(script, /saving = true/);
  assert.match(script, /finally/);
});
