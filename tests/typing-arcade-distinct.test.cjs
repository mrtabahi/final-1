'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('each arcade theme has its own palette, typography and play-space metaphor', () => {
  const sprint = read('css/speed-sprint.css');
  const precision = read('css/word-accuracy.css');
  const mission = read('css/time-attack.css');
  assert.match(sprint, /#f4c65d/);
  assert.match(sprint, /sprint-track-base/);
  assert.match(sprint, /text-shadow/);
  assert.match(precision, /#315d49/);
  assert.match(precision, /precision-orbit/);
  assert.match(mission, /#e06d60/);
  assert.match(mission, /mission-clock-panel/);
  assert.match(mission, /mission-sectors/);
  assert.match(mission, /text-shadow/);
});

test('precision and mission challenges reward different skills', () => {
  const precision = read('js/arcade/word-accuracy.js');
  const mission = read('js/arcade/time-attack.js');
  assert.match(precision, /shields = 3/);
  assert.match(precision, /bestStreak/);
  assert.match(precision, /All 25 target words calibrated/);
  assert.match(mission, /const waves =/);
  assert.match(mission, /targetDeadline/);
  assert.match(mission, /combo\+\+/);
  assert.match(mission, /missedTargets\+\+/);
  assert.match(mission, /bestCombo/);
});

test('all three routes enforce candidate access and expose distinct result summaries', () => {
  for (const [html,script] of [
    ['speed-sprint.html','js/arcade/speed-sprint.js'],
    ['word-accuracy.html','js/arcade/word-accuracy.js'],
    ['time-attack.html','js/arcade/time-attack.js']
  ]) {
    assert.match(read(html), /js\/auth\.js/);
    assert.match(read(script), /AuthManager\.requireCandidateGuard/);
    assert.match(read(html), /BSF METHOD/);
    assert.match(read(html), /CRPF METHOD/);
  }
  assert.match(read('speed-sprint.html'), /RACE PROGRESS/);
  assert.match(read('word-accuracy.html'), /BEST CLEAN STREAK/);
  assert.match(read('time-attack.html'), /BEST COMBO/);
});
