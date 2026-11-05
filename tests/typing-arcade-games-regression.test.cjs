'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const games = [
  {name:'Speed Sprint',html:'speed-sprint.html',js:'js/arcade/speed-sprint.js',css:'css/speed-sprint.css',prefix:'sprint'},
  {name:'Word Accuracy',html:'word-accuracy.html',js:'js/arcade/word-accuracy.js',css:'css/word-accuracy.css',prefix:'precision'},
  {name:'Time Attack',html:'time-attack.html',js:'js/arcade/time-attack.js',css:'css/time-attack.css',prefix:'mission'}
];
const resultFields = ['gross','net','accuracy','errors','allowed','excess','penalty','correct','backspace','keys'];

test('each game loads its own page, stylesheet, module, shared scorer and candidate guard', () => {
  for (const game of games) {
    const html = read(game.html), js = read(game.js);
    assert.match(html, new RegExp('css/' + path.basename(game.css)));
    assert.match(html, new RegExp('js/arcade/' + path.basename(game.js)));
    assert.match(html, /typing-result\/typing-master\.js/);
    assert.match(html, /js\/arcade\/scoring\.js/);
    assert.match(html, /js\/typing\/master-config\.js/);
    assert.match(html, /js\/config\.js/);
    assert.match(html, /js\/auth\.js/);
    assert.match(html, /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/);
    assert.match(html, /fix-accuracy\.html/);
    assert.match(js, /AuthManager\.requireCandidateGuard/);
    assert.doesNotMatch(html, /js\/arcade-games\.js/);
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
    const selectors = [...js.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
    for (const id of selectors) assert.ok(ids.has(id), game.name + ' missing #' + id);
  }
});

test('the three games have intentionally different visual identities', () => {
  const sprint = read('css/speed-sprint.css');
  const precision = read('css/word-accuracy.css');
  const mission = read('css/time-attack.css');
  assert.match(sprint, /background:#07121d/);
  assert.match(sprint, /sprint-track/);
  assert.match(precision, /background:#f1f0e9/);
  assert.match(precision, /precision-orbit/);
  assert.match(precision, /font-family:Georgia/);
  assert.match(mission, /background:#0b0e16/);
  assert.match(mission, /font-family:'Courier New'/);
  assert.match(mission, /mission-sectors/);
  assert.doesNotMatch(sprint, /precision-orbit|mission-sectors/);
  assert.doesNotMatch(precision, /sprint-track|mission-sectors/);
  assert.doesNotMatch(mission, /sprint-track|precision-orbit/);
});

test('challenge rules and lengths are different for all three games', () => {
  const sprint = read('js/arcade/speed-sprint.js');
  const precision = read('js/arcade/word-accuracy.js');
  const mission = read('js/arcade/time-attack.js');
  assert.match(sprint, /const duration = 30/);
  assert.match(sprint, /Array\.from\(\{length:90\}/);
  assert.match(sprint, /sprint-car/);
  assert.match(precision, /shields = 3/);
  assert.match(precision, /bestStreak/);
  const wordList = precision.match(/const expected = '([^']+)'/);
  assert.ok(wordList);
  assert.equal(wordList[1].split(' ').length, 25);
  assert.match(read('word-accuracy.html'), /25 TARGETS/);
  assert.match(precision, /All 25 target words calibrated/);
  assert.match(mission, /const duration = 60/);
  assert.match(mission, /const waves =/);
  assert.match(mission, /combo\+\+/);
  assert.match(mission, /bestCombo/);
  assert.equal((mission.match(/\.split\(' '\)/g) || []).length, 4);
});

test('each result screen exposes complete BSF and CRPF metrics plus unique game outcomes', () => {
  for (const game of games) {
    const html = read(game.html);
    for (const formula of ['bsf','crpf']) {
      for (const field of resultFields) {
        assert.match(html, new RegExp('id="' + game.prefix + '-result-' + formula + '-' + field + '"'));
      }
    }
  }
  assert.match(read('speed-sprint.html'), /sprint-result-distance/);
  assert.match(read('word-accuracy.html'), /precision-result-streak/);
  assert.match(read('word-accuracy.html'), /precision-result-wrong/);
  assert.match(read('time-attack.html'), /mission-result-waves/);
  assert.match(read('time-attack.html'), /mission-result-best-combo/);
  assert.match(read('time-attack.html'), /mission-result-missed/);
});

test('all game modules delegate every official metric to the shared Fix Accuracy adapter', () => {
  const helper = read('js/arcade/scoring.js');
  assert.match(helper, /TypingMaster\.calculateCommittedScore/);
  assert.match(helper, /TypingExperienceConfig\?\.getScoringConfig/);
  assert.match(helper, /'bsf'/);
  assert.match(helper, /'crpf'/);
  for (const game of games) {
    const source = read(game.js);
    assert.match(source, /ArcadeScoring\.calculate/);
    assert.doesNotMatch(source, /grossWpm\s*=|netWpm\s*=|accuracy\s*=/);
    assert.doesNotThrow(() => new vm.Script(source));
  }
});

test('arcade adapter exactly reuses Fix Accuracy defaults and committed-score behavior', () => {
  const context = { console };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(read('supabase/functions/typing-result/typing-master.js'), context);
  vm.runInNewContext(read('js/typing/master-config.js'), context);
  vm.runInNewContext(read('js/arcade/scoring.js'), context);
  assert.equal(context.TypingExperienceConfig.getScoringConfig().penaltyPerError, 10);
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

  const difference = context.ArcadeScoring.calculate(['one','two'], ['one','extra','two'], '', 60, 0, true);
  assert.equal(difference.bsf.totalErrors, 1);
  assert.equal(difference.crpf.totalErrors, 2);
  assert.equal(difference.crpf.accuracy, 0);

  const spacing = context.ArcadeScoring.calculate(['one','two'], 'one  two ', '', 60, 0, true);
  assert.equal(spacing.bsf.doubleSpaceErrors, 1);
  assert.equal(spacing.bsf.totalErrors, 1);
  assert.equal(spacing.crpf.totalErrors, 2);
  assert.equal(spacing.typedText, 'one  two ');
});

test('arcade hub exposes all three separate game destinations', () => {
  const html = read('fix-accuracy.html');
  for (const route of ['speed-sprint.html','word-accuracy.html','time-attack.html']) {
    assert.match(html, new RegExp('href="/' + route + '"'));
  }
  assert.doesNotMatch(html, /class="game-tile coming"/);
});
