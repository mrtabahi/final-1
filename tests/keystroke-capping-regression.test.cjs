'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadScorer() {
  const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/typing-result/typing-master.js'), 'utf8');
  const context = { console };
  vm.runInNewContext(source, context, { filename: 'typing-master.js' });
  return context.TypingMaster;
}

test('surplus characters inside a word never inflate measured keystrokes or gross WPM', () => {
  const scorer = loadScorer();
  const expected = 'cat dog';
  const normal = scorer.calculateScore(expected, 'cat dog', 60, {}, null, 'bsf');
  const padded = scorer.calculateScore(expected, 'cattttttttttt dog', 60, {}, null, 'bsf');
  assert.equal(padded.totalKeystrokes, normal.totalKeystrokes);
  assert.equal(padded.grossWpm, normal.grossWpm);
  assert.equal(padded.totalErrors, normal.totalErrors + 1);
  assert.equal(padded.errorBreakdown.substitutions, 1);
});

test('extra words are counted as errors but their letters and separators do not add measured keystrokes', () => {
  const scorer = loadScorer();
  const expected = 'cat dog';
  const baseline = scorer.calculateScore(expected, 'cat dog', 60, {}, null, 'bsf');
  const extra = scorer.calculateScore(expected, 'cat dog elephant', 60, {}, null, 'bsf');
  assert.equal(extra.totalKeystrokes, baseline.totalKeystrokes);
  assert.equal(extra.grossWpm, baseline.grossWpm);
  assert.equal(extra.errorBreakdown.extraWords, 1);
  assert.equal(extra.totalErrors, baseline.totalErrors + 1);
});

test('each expected word has an independent character cap', () => {
  const scorer = loadScorer();
  assert.equal(scorer.countCappedKeystrokes('a longword', 'aaaaaaa longword'), 9);
  assert.equal(scorer.countCappedKeystrokes('a longword', 'a longword extra'), 10);
});
