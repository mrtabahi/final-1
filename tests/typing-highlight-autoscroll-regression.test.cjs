'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('highlight OFF neutralizes generated character feedback in all three workspaces', () => {
  const main = fs.readFileSync(path.join(__dirname, '../css/typing.css'), 'utf8');
  const self = fs.readFileSync(path.join(__dirname, '../css/self-test.css'), 'utf8');
  const fix = fs.readFileSync(path.join(__dirname, '../css/fix-accuracy.css'), 'utf8');
  assert.match(main, /\.passage-display\.no-highlight/u);
  assert.match(main, /class\*="char-"/u);
  assert.match(self, /\.self-passage-card:not\(\.self-highlight-enabled\)/u);
  assert.match(self, /\.self-char-correct/u);
  assert.match(fix, /#fix-passage-display\.no-highlight/u);
  assert.match(fix, /\.char-incorrect/u);
});

test('Fix Accuracy keeps the current passage position visible after input', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/fix-accuracy.js'), 'utf8');
  assert.ok(source.includes('function keepCurrentPassageVisible()'));
  assert.ok(source.includes('const committedSpace=/\\s$/u.test(input.value)'));
  assert.ok(source.includes('if(!committedSpace)keepCurrentPassageVisible()'));
  assert.ok(source.includes('processCommittedWords();tick()'));
  assert.ok(source.includes('const markerRect=marker.getBoundingClientRect()'));
  assert.ok(source.includes('const contentBottom=hostRect.bottom-number(style.borderBottomWidth)-number(style.paddingBottom)'));
  assert.ok(source.includes('const lowerOverflow=markerRect.bottom-safeBottom'));
  assert.ok(source.includes("host.scrollTo({top:target,behavior:reduceMotion?'auto':'smooth'})"));
  assert.ok(source.includes('getComputedStyle(host)'));
  assert.ok(source.includes('dataset.wordIndex'));
  assert.ok(source.includes('prefers-reduced-motion: reduce'));
});
test('Fix Accuracy keeps live source passage clean and annotates mistakes only in result comparison', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/fix-accuracy.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../fix-accuracy-game.html'), 'utf8');
  const liveStart = source.indexOf('function renderPassage()');
  const liveEnd = source.indexOf('function keepCurrentPassageVisible()', liveStart);
  const liveRenderer = source.slice(liveStart, liveEnd);
  assert.doesNotMatch(liveRenderer, /char-correct|char-incorrect|alignCharacters/u);
  assert.match(source, /function renderResultComparison\(expectedText,typedText\)/u);
  assert.match(source, /mistake-extra|mistake-wrong|mistake-omitted/u);
  assert.match(source, /visibleLength.*aligned\.length/u);
  assert.match(source, /aligned\[visibleLength-1\]\.type==='delete'/u);
  assert.doesNotMatch(html, /fix-result-original|Original Passage/u);
  assert.match(html, /id="fix-result-typed"/u);
  assert.match(html, /fix-print-brand/u);
});

test('Fix Accuracy result includes detailed error analysis sourced from canonical score breakdown', () => {
  const html = fs.readFileSync(path.join(__dirname, '../fix-accuracy-game.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '../js/fix-accuracy.js'), 'utf8');
  for (const id of ['omissions','substitutions','spelling','incomplete','extra','repeated','spacing','capitalization','punctuation']) {
    assert.match(html, new RegExp('id="fix-analysis-' + id + '"'));
  }
  assert.match(source, /const breakdown=score\.errorBreakdown\|\|\{\}/u);
  assert.doesNotMatch(html, /Words not reached|Original Passage/u);
  assert.match(html, /Typed Passage &amp; Mistake Analysis/u);
  assert.match(html, /https:\/\/decodinghcm\.online/u);
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
  assert.match(source, /adjustedCharBox\.bottom>box\.bottom-margin/u);
  assert.match(source, /adjustedCharBox\.top<box\.top\+margin/u);
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
    fix: fs.readFileSync(path.join(root, 'fix-accuracy-game.html'), 'utf8')
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
  assert.ok(scripts.fix.includes('else if(target?.requestFullscreen)'));
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

test('Fix Accuracy treats the configured maximum error count as inclusive for both formulas', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/fix-accuracy.js'), 'utf8');
  assert.ok(source.includes('bsfScore.totalErrors>currentConfig.maxErrors&&crpfScore.totalErrors>currentConfig.maxErrors'));
  assert.ok(source.includes('const grossPass=currentConfig.minGross<=0||gross>=currentConfig.minGross'));
  assert.ok(source.includes('const netPass=currentConfig.minNet<=0||net>=currentConfig.minNet'));
  assert.ok(source.includes('const passed=errorCount<=currentConfig.maxErrors&&grossPass&&netPass'));
  assert.ok(source.includes("if(initialBsf.totalErrors>currentConfig.maxErrors&&initialCrpf.totalErrors>currentConfig.maxErrors&&reason==='Passage complete')"));
});

test('Fix Accuracy toolbar active states preserve icon nodes and use green styling', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/fix-accuracy.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../css/fix-accuracy.css'), 'utf8');
  assert.ok(source.includes("button.classList.toggle('is-active', Boolean(enabled))"));
  assert.ok(source.includes("b.classList.toggle('is-active',typingMode==='offscreen')"));
  assert.ok(source.includes("const label=b.querySelector('.control-label')"));
  assert.ok(css.includes('.compact-tip-control.is-active'));
  assert.ok(css.includes('#22c55e'));
});

test('Fix Accuracy result screen can restore fullscreen and tracks fullscreen state', () => {
  const html = fs.readFileSync(path.join(__dirname, '../fix-accuracy-game.html'), 'utf8');
  const source = fs.readFileSync(path.join(__dirname, '../js/fix-accuracy.js'), 'utf8');
  assert.ok(html.includes('id="fix-result-fullscreen"'));
  assert.match(html, /id="fix-result-fullscreen"[^>]*aria-label="Restore result screen"/u);
  assert.ok(source.includes("$('fix-result-fullscreen')?.addEventListener('click',()=>toggleWorkspaceFullscreen(result))"));
  assert.ok(source.includes("document.addEventListener('fullscreenchange',syncFullscreenButtons)"));
});


test('Main Typing Test live highlighting uses fixed original word positions, not global duplicate matching', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.ok(source.includes('TypingMaster.alignWordsByPosition(expectedWords.map(item=>item[0]),typedWords)'));
  assert.ok(!source.includes('const aligned=TypingMaster.alignWords(expectedWords.map(item=>item[0]),typedWords)'));
});

test('Self Test live character highlighting uses fixed original word positions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/self-test.js'), 'utf8');
  assert.ok(source.includes('TypingMaster.alignWordsByPosition(expectedTokens.map(x=>x.text),typedTokens.map(x=>x.text))'));
});

test('Fix Accuracy live current-word marker uses fixed original word positions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/fix-accuracy.js'), 'utf8');
  assert.ok(source.includes('TypingMaster.alignWordsByPosition(expectedWords.map(match=>match[0]),typedWords)'));
});


test('Fix Accuracy advances live highlight immediately after Space commits a word', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/fix-accuracy.js'), 'utf8');
  assert.match(source, /const hasCommittedSpace=\/\\s\$\/u\.test\(typed\)/u);
  assert.match(source, /typedWords\.length-\(hasCommittedSpace\?0:1\)/u);
});

test('Fix Accuracy action buttons keep setup and result actions in ordered columns', () => {
  const html = fs.readFileSync(path.join(__dirname, '../fix-accuracy-game.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../css/fix-accuracy.css'), 'utf8');
  assert.match(html, /id="fix-restart"[^>]*>Back to setup[\s\S]*?id="fix-submit"/u);
  assert.match(html, /id="fix-again"[^>]*>Return To setup/u);
  assert.match(css, /\.fix-game-actions\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/u);
  assert.match(css, /#result-panel>\.fix-actions\{display:grid;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/u);
});



test('Main Typing Test scrolls only after Space commits the final word on the third visible line from bottom', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.ok(source.includes('word.dataset.wordIndex=String(wordIndex)'));
  assert.ok(source.includes(String.raw`/\s$/u.test(typed)&&committedCount>0`));
  assert.ok(source.includes('lastCommittedTypedIndex=committedCount-1'));
  assert.ok(source.includes('isLastWordOfLine=sameLine.length>0&&sameLine[sameLine.length-1]===committedWord'));
  assert.ok(source.includes('linePositionFromBottom===3&&isLastWordOfLine'));
  assert.ok(source.includes('display.scrollTop+lineHeight'));
  assert.ok(source.includes('autoScrolledWordIndices.has(committedExpectedIndex)'));
});

test('Main Typing Test cancel and early-submit confirmations render inside the active fullscreen element', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
  assert.ok(source.includes("document.fullscreenElement||$('app-root')||document.body"));
  assert.ok(source.includes("showTypingConfirm('Reset this typing attempt?"));
  assert.ok(source.includes("showTypingConfirm('End this test now"));
  assert.ok(!source.includes("confirm('Reset this typing attempt"));
  assert.ok(!source.includes("confirm('End this test now"));
});

test('Typing toolbar assigns stable visible glyphs and exam dialog follows the active fullscreen subtree', () => {
  const source = fs.readFileSync(path.join(__dirname, '../js/interface-switcher.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../css/typing.css'), 'utf8');
  assert.ok(source.includes("'btn-sound':'♪'"));
  assert.ok(source.includes("'btn-highlight':'✎'"));
  assert.ok(source.includes("const getDialogHost=()=>document.fullscreenElement||document.getElementById('app-root')||document.body"));
  assert.ok(source.includes('getDialogHost().append(dialog)'));
  assert.ok(source.includes("document.addEventListener('fullscreenchange'"));
  assert.ok(css.includes('#typing-section .typing-controls .compact-tip-control::before'));
  assert.ok(css.includes('-webkit-text-fill-color:#234b70!important'));
});
