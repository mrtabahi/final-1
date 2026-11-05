'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('three arcade games use independent page layouts, stylesheets and gameplay modules', () => {
  const routes = [
    ['speed-sprint.html','sprint','css/speed-sprint.css','js/arcade/speed-sprint.js'],
    ['word-accuracy.html','precision','css/word-accuracy.css','js/arcade/word-accuracy.js'],
    ['time-attack.html','mission','css/time-attack.css','js/arcade/time-attack.js']
  ];
  for (const [file,marker,css,js] of routes) {
    const html = read(file);
    assert.match(html, new RegExp('class="' + marker + '-page"'));
    assert.match(html, new RegExp(css.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, new RegExp(js.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, /typing-result\\/typing-master\\.js/);
    assert.match(html, /js\\/arcade\\/scoring\\.js/);
    assert.match(html, /fix-accuracy\\.html/);
    assert.doesNotMatch(html, /js\\/arcade-games\\.js/);
  }
  assert.match(read('speed-sprint.html'), /sprint-track/);
  assert.match(read('word-accuracy.html'), /precision-orbit/);
  assert.match(read('time-attack.html'), /mission-sectors/);
});

test('each game keeps its own challenge mechanic and challenge length', () => {
  const sprint = read('js/arcade/speed-sprint.js');
  const precision = read('js/arcade/word-accuracy.js');
  const mission = read('js/arcade/time-attack.js');
  assert.match(sprint, /const duration = 30/);
  assert.match(sprint, /sprint-car/);
  assert.match(precision, /shields = 3/);
  assert.match(precision, /bestStreak/);
  assert.equal((precision.match(/'.*?'\.split\(' '\)/) || [''])[0].length > 0, true);
  assert.match(read('word-accuracy.html'), /25 TARGETS/);
  assert.match(mission, /const duration = 60/);
  assert.match(mission, /const waves =/);
  assert.match(mission, /mission-sectors/);
});

test('all games delegate both official formulas to Fix Accuracy committed scoring', () => {
  const adapter = read('js/arcade/scoring.js');
  assert.match(adapter, /TypingMaster\\.calculateCommittedScore/);
  assert.match(adapter, /'bsf'/);
  assert.match(adapter, /'crpf'/);
  for (const file of ['js/arcade/speed-sprint.js','js/arcade/word-accuracy.js','js/arcade/time-attack.js']) {
    const js = read(file);
    assert.match(js, /ArcadeScoring\\.calculate/);
    assert.doesNotMatch(js, /grossWpm\\s*=|netWpm\\s*=|accuracy\\s*=/);
  }
});
