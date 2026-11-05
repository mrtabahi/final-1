'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const games = [
  {html:'speed-sprint.html', js:'js/arcade/speed-sprint.js', css:'css/speed-sprint.css', marker:'sprint', ids:['sprint-clock','sprint-car','sprint-target','sprint-result-distance','sprint-result-crpf-net','sprint-result-crpf-accuracy','sprint-result-crpf-errors']},
  {html:'word-accuracy.html', js:'js/arcade/word-accuracy.js', css:'css/word-accuracy.css', marker:'precision', ids:['precision-shields','precision-streak','precision-target','precision-result-correct','precision-result-crpf-net','precision-result-crpf-accuracy','precision-result-crpf-errors']},
  {html:'time-attack.html', js:'js/arcade/time-attack.js', css:'css/time-attack.css', marker:'mission', ids:['mission-clock','mission-sectors','mission-target','mission-result-waves','mission-result-crpf-net','mission-result-crpf-accuracy','mission-result-crpf-errors']}
];

test('each arcade game loads its own interface, stylesheet and gameplay module', () => {
  for (const game of games) {
    const html = read(game.html);
    assert.match(html, new RegExp('css/' + path.basename(game.css)));
    assert.match(html, new RegExp('js/arcade/' + path.basename(game.js)));
    assert.match(html, /typing-result\/typing-master\.js/);
    assert.match(html, /js\/arcade\/scoring\.js/);
    assert.match(html, /fix-accuracy\.html/);
    for (const id of game.ids) assert.match(html, new RegExp('id="' + id + '"'));
    assert.doesNotMatch(html, /js\/arcade-games\.js/);
  }
});

test('the three experiences have different interaction and challenge mechanics', () => {
  const sprint = read('js/arcade/speed-sprint.js');
  const precision = read('js/arcade/word-accuracy.js');
  const mission = read('js/arcade/time-attack.js');
  assert.match(sprint, /const duration = 30/);
  assert.match(sprint, /sprint-car/);
  assert.match(precision, /let startedAt = 0, backspaces = 0, shields = 3/);
  assert.match(precision, /bestStreak/);\n  assert.match(precision, /resilience/);
  assert.match(mission, /const duration = 60/);
  assert.match(mission, /const waves =/);
  assert.match(mission, /mission-sectors/);
  for (const source of [sprint, precision, mission]) assert.doesNotThrow(() => new vm.Script(source));
});

test('all three games delegate metrics to the shared Fix Accuracy scoring adapter', () => {
  const helper = read('js/arcade/scoring.js');
  assert.match(helper, /TypingMaster\.calculateCommittedScore/);
  assert.match(helper, /'bsf'/);
  assert.match(helper, /'crpf'/);
  for (const game of games) {
    const source = read(game.js);
    assert.match(source, /ArcadeScoring\.calculate/);
    assert.doesNotMatch(source, /grossWpm\s*=|netWpm\s*=|accuracy\s*=/);
  }
});

test('shared arcade adapter preserves Fix Accuracy committed scoring values', () => {
  const context = { console };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(read('supabase/functions/typing-result/typing-master.js'), context);
  vm.runInNewContext(read('js/arcade/scoring.js'), context);
  const perfect = context.ArcadeScoring.calculate(['one','two'], ['one'], '', 60, 0, true).bsf;
  assert.equal(perfect.grossWpm, 0.8);
  assert.equal(perfect.netWpm, 0.8);
  assert.equal(perfect.accuracy, 100);
  assert.equal(perfect.totalKeystrokes, 4);
  assert.equal(perfect.totalErrors, 0);

  const wrong = context.ArcadeScoring.calculate(['one','two'], ['one','wrong'], '', 60, 0, true).bsf;
  assert.equal(wrong.grossWpm, 1.4);
  assert.equal(wrong.netWpm, 0);
  assert.equal(wrong.accuracy, 28.57);
  assert.equal(wrong.totalErrors, 1);
  assert.equal(wrong.allowedErrors, 0);
  assert.equal(wrong.penaltyWpm, 10);

  const livePartial = context.ArcadeScoring.calculate(['one'], [], 'on', 60, 0, false).bsf;
  const finalPartial = context.ArcadeScoring.calculate(['one'], [], 'on', 60, 0, true).bsf;
  assert.equal(livePartial.totalErrors, 0);
  assert.equal(finalPartial.totalErrors, 1);
  assert.equal(finalPartial.accuracy, 0);

  const empty = context.ArcadeScoring.calculate(['one'], [], '', 60, 0, true).bsf;
  assert.equal(empty.grossWpm, 0);
  assert.equal(empty.netWpm, 0);
  assert.equal(empty.accuracy, 0);

  const formulaDifference = context.ArcadeScoring.calculate(['one','two'], ['one','extra','two'], '', 60, 0, true);
  assert.equal(formulaDifference.bsf.totalErrors, 1);
  assert.equal(formulaDifference.crpf.totalErrors, 2);
  assert.equal(formulaDifference.crpf.accuracy, 0);
});

test('arcade landing page keeps all three playable destinations', () => {
  const html = read('fix-accuracy.html');
  for (const route of ['speed-sprint.html','word-accuracy.html','time-attack.html']) {
    assert.match(html, new RegExp('href="/' + route + '"'));
  }
  assert.doesNotMatch(html, /class="game-tile coming"/);
});
