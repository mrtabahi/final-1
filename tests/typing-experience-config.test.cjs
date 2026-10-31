const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sandbox = {};
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../js/typing/master-config.js'), 'utf8'),
  sandbox
);
vm.runInNewContext(
  fs.readFileSync(path.join(__dirname, '../js/typing/activity-registry.js'), 'utf8'),
  sandbox
);

test('shared typing defaults are immutable and provide a common scoring baseline', () => {
  const config = sandbox.TypingExperienceConfig;
  assert.equal(config.defaults.scoring.defaultFormula, 'bsf');
  assert.equal(config.defaults.scoring.penaltyPerError, 10);
  assert.equal(config.getScoringConfig().penaltyPerError, 10);
  assert.equal(config.getScoringConfig({ penaltyPerError: 7 }).penaltyPerError, 7);
  assert.equal(Object.isFrozen(config.defaults.scoring), true);
});

test('activity registry identifies shared and server-authoritative scoring modes', () => {
  const registry = sandbox.TypingActivityRegistry;
  assert.equal(registry.get('selfTest').scoring, 'master');
  assert.equal(registry.get('fixAccuracy').scoring, 'master-committed');
  assert.equal(registry.get('exam').scoring, 'server-authoritative');
  assert.equal(registry.get('unknown'), null);
});

test('legacy free-error percentage remains documented compatibility, not an admin formula knob', () => {
  const config = sandbox.TypingExperienceConfig.getScoringConfig();
  assert.equal(config.freeErrorPct, 0.05);
  assert.match(
    fs.readFileSync(path.join(__dirname, '../js/typing/master-config.js'), 'utf8'),
    /does not alter that rule/
  );
});
