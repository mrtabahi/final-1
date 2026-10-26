const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const monetizationPages = [
  "admin-access.html",
  "admin-plans.html",
  "admin-subscriptions.html",
  "admin-entitlements.html",
  "admin-payments.html",
];
const expectedLinks = [...monetizationPages];

function readRepoFile(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

test("monetization admin pages share complete navigation with one correct active item", () => {
  for (const page of monetizationPages) {
    const html = readRepoFile(page);
    const nav = html.match(/<nav class="admin-nav"[^>]*>[\s\S]*?<\/nav>/);
    assert.ok(nav, `${page} must have the admin navigation`);

    for (const href of expectedLinks) {
      assert.ok(nav[0].includes(`href="${href}"`), `${page} is missing navigation link ${href}`);
    }

    const activeHrefs = [...nav[0].matchAll(/<a\b([^>]*)href="([^"]+)"([^>]*)>/g)]
      .filter((match) => ` ${match[1]} ${match[3]} `.includes("admin-nav-link active"))
      .map((match) => match[2]);
    assert.deepEqual(activeHrefs, [page], `${page} must mark only itself active`);
  }
});

test("dashboard monetization cards navigate to real configuration pages", () => {
  const html = readRepoFile("admin.html");
  assert.match(html, /class="admin-module-card-link" href="admin-plans\.html"/);
  assert.match(html, /class="admin-module-card-link" href="admin-payments\.html"/);
  assert.match(html, /Checkout stays gated until payment E2E passes/);
  assert.match(html, /live payment activation remains gated/);
});

test("shared admin design system keeps keyboard focus and reduced-motion support", () => {
  const css = readRepoFile("css/admin.css");
  assert.match(css, /:where\(button,a,input,select,textarea,\[tabindex\]\):focus-visible/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.admin-module-grid>\.admin-module-card-link:focus-visible/);
  assert.match(css, /@media\(max-width:760px\)/);
});
