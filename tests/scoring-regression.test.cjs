const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = {};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../supabase/functions/typing-result/typing-master.js'), 'utf8') + '\nthis.TypingMaster = TypingMaster;', sandbox);
const scoring = sandbox.TypingMaster;
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


test('gross speed caps each typed word at its original passage word length', () => {
  const passage = 'cat dog';
  const normal = scoring.calculateScore(passage, 'cat dog', 60, config, null, 'bsf');
  const longer = scoring.calculateScore(passage, 'cat extraordinarilylongword dog', 60, config, null, 'bsf');
  assert.equal(normal.totalKeystrokes, 7);
  assert.equal(longer.totalKeystrokes, 7);
  assert.equal(longer.grossWpm, normal.grossWpm);
});

test('incomplete words count actual typed length, while overlong words are capped', () => {
  const passage = 'Nathuram is ready';
  const incomplete = scoring.calculateScore(passage, 'Nathur', 60, config, null, 'bsf');
  const overlong = scoring.calculateScore(passage, 'Nathurammmmmmmmmmmmmmmmmdmdmd', 60, config, null, 'bsf');
  assert.equal(incomplete.totalKeystrokes, 6);
  assert.equal(overlong.totalKeystrokes, 8);
  assert.equal(overlong.grossWpm, Number((8 * 60 / (5 * 60)).toFixed(2)));
});

test('extra words and extra whitespace cannot inflate capped keystrokes', () => {
  const passage = 'cat dog';
  const score = scoring.calculateScore(passage, 'cat dog extraordinarilylongword          ', 60, config, null, 'bsf');
  assert.equal(score.totalKeystrokes, 7);
});

test('error allowance is the floored keystroke count divided by 100', () => {
  const score = scoring.calculateScore('abcdefghij', 'abcdefghij', 60, config, null, 'bsf');
  assert.equal(score.totalKeystrokes, 10);
  assert.equal(score.allowedErrors, 0);
  assert.equal(score.freeErrors, 0);
});

test('requested formulas calculate gross speed, extra errors, penalty speed, net speed, and accuracy', () => {
  const expected = Array(10).fill('a'.repeat(50)).join(' ');
  const typed = Array(10).fill('b'.repeat(50)).join(' ');
  const score = scoring.calculateScore(expected, typed, 60, config, typed.length, 'bsf');
  assert.equal(score.totalKeystrokes, 509);
  assert.equal(score.grossWpm, Number((509 * 60 / (5 * 60)).toFixed(2)));
  assert.equal(score.allowedErrors, 5);
  assert.equal(score.totalErrors, 10);
  assert.equal(score.excessErrors, 5);
  assert.equal(score.penaltyWpm, 50);
  assert.equal(score.netWpm, Number((score.grossWpm - 50).toFixed(2)));
  assert.equal(score.accuracy, Number(Math.max(0, 100 - 10 * 500 / 509).toFixed(2)));
});

test('accuracy never goes below zero and penalty speed rounds to two decimals', () => {
  const expected = 'a '.repeat(100);
  const typed = 'b '.repeat(100);
  const score = scoring.calculateScore(expected, typed, 37, config, typed.length, 'bsf');
  assert.equal(score.accuracy, 0);
  assert.equal(score.penaltyWpm, Number(score.penaltyWpm.toFixed(2)));
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


test('BSF keeps each correct leading word in its original slot with repeated later words', () => {
  const passage = 'Why the cat comming and why cat dancing';
  for (const typed of ['Why', 'Why the', 'Why the cat', 'Why the cat comming', 'Why the cat comming and why']) {
    const score = scoring.calculateScore(passage, typed, 60, config, null, 'bsf');
    const matched = score.alignment.filter(item => item.type === 'match').map(item => item.expected);
    assert.deepEqual(matched, typed.split(/\s+/));
    assert.equal(score.errorBreakdown.omissions, 0, typed);
    assert.equal(score.totalErrors, 0, typed);
  }
});


test('total correct word follows keystrokes divided by five minus total errors and rounds to two decimals', () => {
  const score = scoring.calculateScore('one two three four', 'one two thx four', 37, config, 17, 'bsf', 3);
  assert.equal(score.totalCorrectWord, Number((17 / 5 - score.totalErrors).toFixed(2)));
  assert.equal(score.backspacePresses, 3);
  assert.equal(score.netWpm, Number(score.netWpm.toFixed(2)));
});


test('master committed scoring waits for Space before counting the current word error', () => {
  const unfinished = scoring.calculateCommittedScore('one two three', 'one thx', 60, config, 'bsf', 0, false);
  const committed = scoring.calculateCommittedScore('one two three', 'one thx ', 60, config, 'bsf', 0, false);
  assert.equal(unfinished.totalErrors, 0);
  assert.equal(committed.totalErrors, 1);
  assert.equal(unfinished.totalKeystrokes, scoring.calculateScore('one two three', 'one thx', 60, config).totalKeystrokes);
});

test('master committed scoring can finalize the last word on passage completion', () => {
  const score = scoring.calculateCommittedScore('one two', 'one thx', 60, config, 'bsf', 0, true);
  assert.equal(score.totalErrors, 1);
  assert.equal(score.totalCorrectWord, Number((score.totalKeystrokes / 5 - 1).toFixed(2)));
});

test('master formula selector and paired formula helper use the same canonical calculations', () => {
  assert.equal(scoring.normalizeFormula('CRPF'), 'crpf');
  assert.equal(scoring.normalizeFormula('unknown'), 'bsf');
  const both = scoring.calculateBoth('one two three', 'one two three', 60, config, null, 2);
  assert.equal(both.bsf.totalErrors, 0);
  assert.equal(both.crpf.totalErrors, 0);
  assert.equal(both.bsf.backspacePresses, 2);
});

test('empty typed input reports no measured speed and treats the untouched passage as not reached', () => {
  const score = scoring.calculateScore('one two three', '', 0, config, null, 'bsf');
  assert.equal(score.totalKeystrokes, 0);
  assert.equal(score.grossWpm, 0);
  assert.equal(score.netWpm, 0);
  assert.equal(score.accuracy, 0);
  assert.equal(score.totalErrors, 0);
  assert.equal(score.errorBreakdown.notReached, 3);
  assert.equal(score.errorBreakdown.omissions, 0);
  assert.equal(score.elapsedSeconds, 1);
});

test('zero and negative durations are clamped to one second before speed calculations', () => {
  for (const duration of [0, -5]) {
    const score = scoring.calculateScore('a', 'a', duration, config, null, 'bsf');
    assert.equal(score.elapsedSeconds, 1);
    assert.equal(score.elapsedMinutes, 0.02);
    assert.equal(score.grossWpm, 12);
    assert.equal(score.netWpm, 12);
    assert.equal(score.accuracy, 100);
  }
});

test('Unicode words preserve exact-match accuracy and count their UTF-16 code units consistently', () => {
  const passage = 'café 東京';
  const score = scoring.calculateScore(passage, passage, 60, config, null, 'bsf');
  assert.equal(score.totalKeystrokes, 7);
  assert.equal(score.grossWpm, 1.4);
  assert.equal(score.totalErrors, 0);
  assert.equal(score.correctChars, passage.length);
  assert.equal(score.incorrectChars, 0);
  assert.equal(score.accuracy, 100);
});

