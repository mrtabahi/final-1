const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

 test('direct typing-test links fetch the authorized full passage before auto-start', () => {
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.match(app, /rpc\(['"]get_test_for_candidate['"],\s*\{p_test_id:\s*requestedTestId\}\)/);
  assert.match(app, /authorizedPassage\.passage/);
  assert.match(app, /currentPassage=authorizedPassage/);
  assert.match(app, /if\(requestedTestId&&currentPassage\)\{\$\('btn-start-test'\)\.click\(\);\}/);
});

test('feature access batches dynamic label updates instead of rescanning for every DOM mutation', () => {
  const access = fs.readFileSync(path.join(root, 'js/feature-access.js'), 'utf8');
  assert.match(access, /labelRefreshTimer=setTimeout\(\(\)=>\{/);
  assert.match(access, /\},100\);/);
});
