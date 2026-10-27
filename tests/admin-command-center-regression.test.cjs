const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin command center enhancements are wired into the admin page', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  const script = fs.readFileSync(path.join(root, 'js/admin-command-center.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'css/admin-command-center.css'), 'utf8');

  assert.match(html, /css\/admin-command-center\.css/);
  assert.match(html, /js\/admin-command-center\.js/);
  assert.match(script, /admin-command-trigger/);
  assert.match(script, /event\.key\.toLowerCase\(\) === 'k'/);
  assert.match(script, /item\.button\.click\(\)/);
  assert.match(script, /admin-compact/);
  assert.match(styles, /admin-command-backdrop/);
  assert.match(styles, /prefers-reduced-motion/);
});
