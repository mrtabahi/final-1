const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'premium-modal.js'), 'utf8');

test('premium upgrade modal does not duplicate its visible title or subtitle', () => {
  assert.match(source, /premium-global-dialog \.premium-right:before,.premium-global-dialog \.premium-right:after\{content:none!important;display:none!important\}/);
  assert.match(source, /<h2>UPGRADE PASS<\/h2>/);
  assert.match(source, /role="dialog" aria-modal="true" aria-label="Upgrade Pass"/);
});

test('premium upgrade modal traps keyboard focus while open', () => {
  assert.match(source, /if\(e\.key!=='Tab'\)return/);
  assert.match(source, /backdrop\.querySelectorAll\('a\[href\],button:not\(\[disabled\]\),input:not\(\[disabled\]\),select:not\(\[disabled\]\),textarea:not\(\[disabled\]\),\[tabindex\]:not\(\[tabindex="-1"\]\)'\)/);
  assert.match(source, /e\.shiftKey&&\(document\.activeElement===first\|\|!backdrop\.contains\(document\.activeElement\)\)/);
  assert.match(source, /!e\.shiftKey&&\(document\.activeElement===last\|\|!backdrop\.contains\(document\.activeElement\)\)/);
  assert.match(source, /closeBtn\.focus\(\{preventScroll:true\}\)/);
});
