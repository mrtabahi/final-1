const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = {};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../js/scoring.js'), 'utf8') + '\nthis.ScoringEngine = ScoringEngine;', sandbox);
const scoring = sandbox.ScoringEngine;
const config = { freeErrorPct: 0.05, penaltyPerError: 10 };

test('perfect same-position passage has identical BSF and CRPF metrics', () => {
  const passage = 'The quick brown fox jumps over the lazy dog.';
  const bsf = scoring.calculateScore(passage, passage, 60, config, passage.length, 'bsf');
  const crpf = scoring.calculateScore(passage, passage, 60, config, passage.length, 'crpf');
  for (const key of ['totalErrors', 'freeErrors', 'excessErrors', 'penaltyWords', 'grossWpm', 'netWpm', 'accuracy']) {
    assert.equal(bsf[key], crpf[key], key);
  }
  assert.equal(bsf.totalErrors, 0);
  assert.equal(bsf.accuracy, 100);
});

test('BSF sequence alignment avoids cascading errors; CRPF retains position errors', () => {
  const passage = 'one two three four five six';
  const typed = 'one three four five six';
  const bsf = scoring.calculateScore(passage, typed, 60, config, typed.length, 'bsf');
  const crpf = scoring.calculateScore(passage, typed, 60, config, typed.length, 'crpf');
  assert.equal(bsf.totalErrors, 1);
  assert.ok(crpf.totalErrors > bsf.totalErrors);
  assert.ok(crpf.accuracy < bsf.accuracy);
});

test('unfinished trailing passage is not penalized as a missing word', () => {
  const passage = 'one two three four';
  const typed = 'one two';
  const bsf = scoring.calculateScore(passage, typed, 60, config, typed.length, 'bsf');
  assert.equal(bsf.totalErrors, 0);
});

test('repeated internal spaces are counted once in BSF and occupy CRPF positions', () => {
  const passage = 'one two three four';
  const typed = 'one  two three four';
  const bsf = scoring.calculateScore(passage, typed, 60, config, typed.length, 'bsf');
  const crpf = scoring.calculateScore(passage, typed, 60, config, typed.length, 'crpf');
  assert.equal(bsf.doubleSpaceErrors, 1);
  assert.equal(bsf.totalErrors, 1);
  assert.ok(crpf.totalErrors > bsf.totalErrors);
});

test('same-position substitutions produce identical BSF and CRPF penalties', () => {
  const passage = 'one two three four five';
  const typed = 'one too three four five';
  const bsf = scoring.calculateScore(passage, typed, 60, config, typed.length, 'bsf');
  const crpf = scoring.calculateScore(passage, typed, 60, config, typed.length, 'crpf');
  assert.equal(bsf.totalErrors, crpf.totalErrors);
  assert.equal(bsf.penaltyWords, crpf.penaltyWords);
  assert.equal(bsf.grossWpm, crpf.grossWpm);
  assert.equal(bsf.netWpm, crpf.netWpm);
});
