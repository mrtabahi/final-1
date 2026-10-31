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


test('Fix Accuracy scorecard uses canonical capped keystrokes and equivalent words', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/fix-accuracy.js'), 'utf8');
  assert.match(source, /score\.equivalentTypedWords\?\?\(Number\(score\.totalKeystrokes\|\|0\)\/5\)/u);
  assert.match(source, /score\.totalKeystrokes\?\?0/u);
  assert.doesNotMatch(source, /fix-result-typed-words.*input\.value\|\|''\)\.length/u);
});


test('Self Test auto-scroll follows actual rendered character geometry', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/self-test.js'), 'utf8');
  assert.match(source, /data-char-index/);
  assert.match(source, /getBoundingClientRect\(\)/u);
  assert.match(source, /passage\.scrollTop\+=margin-bottomGap/u);
  assert.doesNotMatch(source, /approxChars|passageCharsPerLine/u);
});


test('Self Test live keystrokes use canonical passage-capped count', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/self-test.js'), 'utf8');
  assert.match(source, /self-live-keystrokes'\)\.textContent=String\(score\.totalKeystrokes\?\?0\)/u);
  assert.doesNotMatch(source, /self-live-keystrokes'\)\.textContent=String\(input\.length\)/u);
});


test('Main Typing Test auto-scroll uses measured character bounds, not estimated line counts', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.match(source, /const box=display\.getBoundingClientRect\(\),charBox=current\.getBoundingClientRect\(\)/u);
  assert.match(source, /charBox\.bottom>box\.bottom-margin/u);
  assert.match(source, /charBox\.top<box\.top\+margin/u);
  assert.doesNotMatch(source, /currentLine=|visibleLines=/u);
});


test('Fix Accuracy auto-scroll uses a non-visual position marker when highlight is OFF', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/fix-accuracy.js'), 'utf8');
  assert.match(source, /word-position-current/u);
  assert.match(source, /querySelector\('\.word-position-current'\)/u);
  assert.match(source, /passageHidden\|\|typingMode!=='screen'/u);
  assert.match(source, /if\(highlightEnabled\)wordNode\.classList\.add\('word-current'\)/u);
});


test('all three typing activities expose fullscreen and typing-mode controls', () => {
  const root = path.join(__dirname, '..');
  const html = {
    exam: fs.readFileSync(path.join(root, 'start_test.html'), 'utf8'),
    self: fs.readFileSync(path.join(root, 'self-test.html'), 'utf8'),
    fix: fs.readFileSync(path.join(root, 'fix-accuracy.html'), 'utf8')
  };
  assert.match(html.exam, /id="btn-fullscreen"/u);
  assert.match(html.exam, /id="btn-mode-switch"/u);
  assert.match(html.self, /id="self-fullscreen"/u);
  assert.match(html.self, /id="self-mode-switch"/u);
  assert.match(html.fix, /id="fix-fullscreen"/u);
  assert.match(html.fix, /id="fix-mode-switch"/u);
  const scripts = {
    exam: fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'),
    self: fs.readFileSync(path.join(root, 'js/self-test.js'), 'utf8'),
    fix: fs.readFileSync(path.join(root, 'js/fix-accuracy.js'), 'utf8')
  };
  assert.match(scripts.exam, /requestFullscreen\(/u);
  assert.match(scripts.exam, /selectedTypingMode=selectedTypingMode==='page'\?'screen':'page'/u);
  assert.match(scripts.self, /workspace\.requestFullscreen\(/u);
  assert.match(scripts.self, /typingMode=typingMode==='screen'\?'offscreen':'screen'/u);
  assert.match(scripts.fix, /game\.requestFullscreen\(/u);
  assert.match(scripts.fix, /typingMode=typingMode==='screen'\?'offscreen':'screen'/u);
});

test('admin preference save writes activity overrides and resolver reads the same keys', () => {
  const root = path.join(__dirname, '..');
  const admin = fs.readFileSync(path.join(root, 'js/admin.js'), 'utf8');
  const resolver = fs.readFileSync(path.join(root, 'js/typing/interface-preferences.js'), 'utf8');
  assert.match(admin, /typing_interface_preferences:\{default:'master',overrides:\{exam:/u);
  assert.match(admin, /'self-test':\$\('typing-interface-self-test'\)/u);
  assert.match(admin, /'fix-accuracy':\$\('typing-interface-fix-accuracy'\)/u);
  assert.match(resolver, /prefs\?\.overrides\?\.\[activity\]/u);
  assert.match(resolver, /publish\(allowed\.has\(override\)/u);
});


test('Main Typing Test loads the shared AuthManager script only once', () => {
  const html = fs.readFileSync(path.join(__dirname, '../start_test.html'), 'utf8');
  const authScriptCount = html.split('js/auth.js').length - 1;
  assert.equal(authScriptCount, 1, 'duplicate top-level AuthManager declarations break the page script');
});
