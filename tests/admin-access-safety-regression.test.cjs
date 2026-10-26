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

test("paid access remains blocked until server-side passage delivery enforcement is ready", () => {
  const html = readRepoFile("admin-access.html");
  const script = readRepoFile("js/admin-access.js");

  assert.match(html, /UI locks alone do not protect paid content/);
  assert.match(script, /<option value="paid" disabled/);
  assert.match(script, /if \(mode === 'paid'\)/);
  assert.match(script, /Paid access is locked until passage delivery is enforced server-side/);
  assert.match(script, /select\.value = item\.access_mode \|\| 'free'/);
});

test("policy save reports database failures and refuses silent zero-row updates", () => {
  const script = readRepoFile("js/admin-access.js");

  assert.match(script, /\.update\(\{access_mode:mode\}\)\.eq\('id', id\)\.select\('id,access_mode'\)\.maybeSingle\(\)/);
  assert.match(script, /if \(!result\.data\) throw new Error\('No row updated/);
  assert.match(script, /Save failed:/);
  assert.match(script, /saving = true/);
  assert.match(script, /finally/);
});
