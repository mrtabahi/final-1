'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('highlight OFF neutralizes generated character feedback in all three workspaces', () => {
  const main = fs.readFileSync(path.join(__dirname, '../css/typing.css'), 'utf8');
  const self = fs.readFileSync(path.join(__dirname, '../css/self-test.css'), 'utf8');
  const fix = fs.readFileSync(path.join(__dirname, '../css/fix-accuracy.css'), 'utf8');
  assert.match(main, /\.passage-display\.no-highlight\s+\[class\*="char-"\]/u);
  assert.match(self, /\.self-passage-card:not\(\.self-highlight-enabled\).*\.self-char-correct/u);
  assert.match(fix, /#fix-passage-display\.no-highlight\s+\.char-incorrect/u);
});

test('Fix Accuracy keeps the current passage position visible after input', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/fix-accuracy.js'), 'utf8');
  assert.match(source, /function keepCurrentPassageVisible\(\)/u);
  assert.match(source, /renderPassage\(\);keepCurrentPassageVisible\(\);processCommittedWords\(\);tick\(\)/u);
  assert.match(source, /host\.scrollTop\+=margin-bottomGap/u);
});


test('Fix Accuracy keeps live source passage clean and annotates mistakes only in result comparison', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/fix-accuracy.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../fix-accuracy.html'), 'utf8');
  const liveStart = source.indexOf('function renderPassage()');
  const liveEnd = source.indexOf('function keepCurrentPassageVisible()', liveStart);
  const liveRenderer = source.slice(liveStart, liveEnd);
  assert.doesNotMatch(liveRenderer, /char-correct|char-incorrect|alignCharacters/u);
  assert.match(source, /function renderResultComparison\(expectedText,typedText\)/u);
  assert.match(source, /mistake-extra|mistake-wrong|mistake-omitted/u);
  assert.match(source, /originalHost\.textContent=activePassage/u);
  assert.match(html, /id="fix-result-original"/u);
  assert.match(html, /id="fix-result-typed"/u);
});


test('Fix Accuracy result includes detailed error analysis sourced from canonical score breakdown', () => {
  const html = fs.readFileSync(path.join(__dirname, '../fix-accuracy.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '../js/fix-accuracy.js'), 'utf8');
  for (const id of ['omissions','substitutions','spelling','incomplete','extra','repeated','spacing','capitalization','punctuation','not-reached']) {
    assert.match(html, new RegExp('id="fix-analysis-' + id + '"'));
  }
  assert.match(source, /const breakdown=score\.errorBreakdown\|\|\{\}/u);
  assert.match(html, /Original Passage/u);
  assert.match(html, /Typed Passage — Mistakes Annotated/u);
});
