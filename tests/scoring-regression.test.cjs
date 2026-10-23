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
  assert.equal(bsf.errorBreakdown.notReached, 2);
  assert.equal(bsf.errorBreakdown.omissions, 0);
  assert.equal(bsf.alignment.some(item => item.type === 'delete'), false);
  assert.equal(bsf.accuracy, 100);
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

test('accuracy is measured over typed characters, not untyped trailing passage text', () => {
  const score = scoring.calculateScore('one two three four', 'one two', 60, config, 7, 'bsf');
  assert.equal(score.accuracy, 100);
  assert.equal(score.errorBreakdown.notReached, 2);
  assert.equal(score.errorBreakdown.omissions, 0);
  assert.equal(score.alignment.some(item => item.type === 'delete'), false);
  assert.equal(score.totalErrors, 0);
});

test('detailed error categories identify omission, spelling, incomplete, extra and repeated words', () => {
  const omission = scoring.calculateScore('one two three', 'one three', 60, {freeErrorPct:0, penaltyPerError:10}, 9, 'bsf');
  const spelling = scoring.calculateScore('one correct word end', 'one corrext word end', 60, {freeErrorPct:0, penaltyPerError:10}, 20, 'bsf');
  const incomplete = scoring.calculateScore('one correct word end', 'one correc word end', 60, {freeErrorPct:0, penaltyPerError:10}, 19, 'bsf');
  const repeated = scoring.calculateScore('one word end', 'one word word end', 60, {freeErrorPct:0, penaltyPerError:10}, 17, 'bsf');
  assert.equal(omission.errorBreakdown.omissions, 1);
  assert.equal(spelling.errorBreakdown.spellingErrors, 1);
  assert.equal(incomplete.errorBreakdown.incompleteWords, 1);
  assert.equal(repeated.errorBreakdown.extraWords, 1);
  assert.equal(repeated.errorBreakdown.repeatedWords, 1);
});

test('capitalization and punctuation are reported as separate primary categories', () => {
  const caps = scoring.calculateScore('Hello world.', 'hello world.', 60, {freeErrorPct:0, penaltyPerError:10}, 12, 'bsf');
  const punct = scoring.calculateScore('Hello world.', 'Hello world', 60, {freeErrorPct:0, penaltyPerError:10}, 11, 'bsf');
  assert.equal(caps.errorBreakdown.capitalizationErrors, 1);
  assert.equal(punct.errorBreakdown.punctuationErrors, 1);
});


test('gross-speed keystrokes are capped by original word lengths and separators', () => {
  const passage = 'cat dog';
  const normal = scoring.calculateScore(passage, 'cat dog', 60, config, null, 'bsf');
  const inflated = scoring.calculateScore(passage, 'cat extraordinarilylongword dog', 60, config, null, 'bsf');
  assert.equal(normal.totalKeystrokes, 7);
  assert.equal(inflated.totalKeystrokes, 7);
  assert.equal(inflated.grossWpm, normal.grossWpm);
});

test('allowed errors are an exact 5 percent of capped equivalent words', () => {
  const score = scoring.calculateScore('abcdefghij', 'abcdefghij', 60, config, null, 'bsf');
  assert.equal(score.totalKeystrokes, 10);
  assert.equal(score.allowedErrors, 0.1);
  assert.equal(score.freeErrors, 0.1);
});


test('BSF duplicate words align to the earliest optimal original index', () => {
  const score = scoring.calculateScore(
    'start red middle red finish',
    'start red finish',
    60,
    config,
    null,
    'bsf'
  );
  const redMatches = score.alignment.filter(item => item.type === 'match' && item.expected === 'red');
  assert.equal(redMatches.length, 1);
  assert.equal(score.alignment.findIndex(item => item.type === 'match' && item.expected === 'red'), 1);
  assert.equal(score.errorBreakdown.omissions, 2);
  assert.equal(score.alignment.filter(item => item.type === 'delete').length, 2);
});

test('BSF duplicate at end does not make earlier correct words look omitted', () => {
  const score = scoring.calculateScore(
    'alpha same beta same gamma',
    'alpha same beta gamma',
    60,
    config,
    null,
    'bsf'
  );
  assert.deepEqual(
    score.alignment.filter(item => item.type === 'match').map(item => item.expected),
    ['alpha', 'same', 'beta', 'gamma']
  );
  assert.equal(score.errorBreakdown.omissions, 1);
});


test('BSF treats a short prefix as a spelling/incomplete error without shifting later matches', () => {
  const score = scoring.calculateScore('the quick brown', 'th quick brown', 60, config, null, 'bsf');
  assert.equal(score.alignment[0].type, 'substitute');
  assert.equal(score.alignment[0].expected, 'the');
  assert.equal(score.alignment[0].typed, 'th');
  assert.deepEqual(score.alignment.filter(item => item.type === 'match').map(item => item.expected), ['quick', 'brown']);
  assert.equal(score.errorBreakdown.incompleteWords, 1);
  assert.equal(score.errorBreakdown.omissions, 0);
});

test('BSF does not count unreached trailing words as errors', () => {
  const score = scoring.calculateScore('Why the cat comming and why cat dancing', 'Why the', 60, config, null, 'bsf');
  assert.equal(score.errorBreakdown.notReached, 6);
  assert.equal(score.errorBreakdown.omissions, 0);
  assert.equal(score.totalErrors, 0);
});

test('BSF keeps early duplicate-word alignment when later duplicate also exists', () => {
  const score = scoring.calculateScore('Why the cat comming and why cat dancing', 'Why the cat comming', 60, config, null, 'bsf');
  assert.deepEqual(score.alignment.filter(item => item.type === 'match').map(item => item.expected), ['Why', 'the', 'cat', 'comming']);
  assert.equal(score.errorBreakdown.omissions, 0);
  assert.equal(score.totalErrors, 0);
});
