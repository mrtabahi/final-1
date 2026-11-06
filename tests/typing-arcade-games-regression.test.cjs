'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const games = [
  {name:'Velocity Circuit',html:'speed-sprint.html',js:'js/arcade/speed-sprint.js',css:'css/speed-sprint.css',prefix:'sprint'},
  {name:'Flawless Forge',html:'word-accuracy.html',js:'js/arcade/word-accuracy.js',css:'css/word-accuracy.css',prefix:'precision'},
  {name:'Target Blitz',html:'time-attack.html',js:'js/arcade/time-attack.js',css:'css/time-attack.css',prefix:'mission'}
];
const resultFields = ['gross','net','accuracy','errors','allowed','excess','penalty','correct','backspace','keys'];

test('each game loads its own page, stylesheet, module, shared scorer and candidate guard', () => {
  for (const game of games) {
    const html = read(game.html), js = read(game.js);
    assert.match(html, new RegExp('css/' + path.basename(game.css)));
    assert.match(html, new RegExp('js/arcade/' + path.basename(game.js)));
    assert.match(html, /typing-result\/typing-master\.js/);
    assert.match(html, /js\/arcade\/word-bank\.js/);
    assert.match(html, /js\/arcade\/character-levels\.js/);
    assert.match(html, new RegExp('id="' + game.prefix + '-difficulty"'));
    assert.match(html, /js\/arcade\/scoring\.js/);
    assert.match(html, /js\/typing\/master-config\.js/);
    assert.match(html, /js\/config\.js/);
    assert.match(html, /js\/auth\.js/);
    assert.match(html, /js\/feature-access\.js/);
    assert.match(html, /arcade-auth-pending/);
    assert.match(html, /cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/);
    assert.match(html, /fix-accuracy\.html/);
    assert.match(js, /AuthManager\.requireCandidateGuard/);
    assert.doesNotMatch(html, /js\/arcade-games\.js/);
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
    const selectors = [...js.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
    for (const id of selectors) assert.ok(ids.has(id), game.name + ' missing #' + id);
  }
});

test('all three games offer character levels and a refined Game Lab return link', () => {
  for (const game of games) {
    const html = read(game.html), css = read(game.css);
    assert.match(html, /EASY · LOWERCASE/);
    assert.match(html, /MEDIUM · CAPS \+ NUMBERS/);
    assert.match(html, /HARD · CAPS \+ NUMBERS \+ SYMBOLS/);
    assert.match(html, /BACK TO GAME LAB/);
    assert.match(css, new RegExp('\\.' + game.prefix + '-back\\{display:inline-flex'));
  }
  const context = { Math };
  context.window = context;
  vm.runInNewContext(read('js/arcade/character-levels.js'), context);
  const source = ['alpha','bravo','charlie','delta'];
  assert.deepEqual(Array.from(context.ArcadeCharacterLevels.apply(source,'easy')), source);
  const medium = Array.from(context.ArcadeCharacterLevels.apply(source,'medium'));
  assert.ok(medium.every(word => /^[A-Z]/.test(word)));
  assert.ok(medium.some(word => /[0-9]/.test(word)));
  const hard = Array.from(context.ArcadeCharacterLevels.apply(source,'hard'));
  assert.ok(hard.every(word => /[A-Z]/.test(word) && /[0-9]/.test(word) && /[!@#$%&*?+=]/.test(word)));
});

test('the three games have intentionally different visual identities', () => {
  const sprint = read('css/speed-sprint.css');
  const precision = read('css/word-accuracy.css');
  const mission = read('css/time-attack.css');
  assert.match(sprint, /background:#07121d/);
  assert.match(sprint, /sprint-track/);
  assert.match(sprint, /\.sprint-target-wrap strong\\{text-transform:none/);
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
  assert.match(sprint, /ArcadeWordBank\.takeWords\(90\)/);
  assert.match(sprint, /sprint-car/);
  assert.match(precision, /shields = 3/);
  assert.match(precision, /bestStreak/);
  assert.match(precision, /ArcadeWordBank\.takeWords\(25\)/);
  assert.match(read('word-accuracy.html'), /25 TARGETS/);
  assert.match(precision, /All 25 target words calibrated/);
  assert.match(mission, /const duration = 60/);
  assert.match(mission, /const waves =/);
  assert.match(mission, /combo\+\+/);
  assert.match(mission, /bestCombo/);
  assert.match(mission, /ArcadeWordBank\.takeWords\(20\)/);
  assert.match(mission, /targetDeadline/);
  for (const game of [sprint,precision,mission]) assert.match(game, /ArcadeWordBank\.takeWords/);
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

test('persistent word bank serves fresh words across restarts and game routes', () => {
  const storage = new Map();
  const context = { Math, localStorage: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); }
  }};
  context.window = context;
  vm.runInNewContext(read('js/arcade/word-bank.js'), context);
  const firstRun = context.ArcadeWordBank.takeWords(70);
  const secondRun = context.ArcadeWordBank.takeWords(70);
  assert.ok(context.ArcadeWordBank.wordCount >= 140);
  assert.equal(new Set(firstRun).size, firstRun.length);
  assert.equal(new Set(secondRun).size, secondRun.length);
  assert.equal(firstRun.filter(word => secondRun.includes(word)).length, 0);
  const nextPage = { Math, localStorage: context.localStorage };
  nextPage.window = nextPage;
  vm.runInNewContext(read('js/arcade/word-bank.js'), nextPage);
  const thirdRun = nextPage.ArcadeWordBank.takeWords(20);
  assert.equal([...firstRun, ...secondRun].filter(word => thirdRun.includes(word)).length, 0);
});


test('all arcade routes are gated before first paint and preserve normalized route matching', () => {
  for (const page of ['fix-accuracy.html','fix-accuracy-game.html','speed-sprint.html','word-accuracy.html','time-attack.html']) {
    const html = read(page);
    assert.match(html, /arcade-auth-pending/, page + ' must hide protected content before auth initializes');
    assert.match(html, /js\/feature-access\.js/, page + ' must load the shared session gate');
  }
  const gate = read('js/feature-access.js');
  assert.match(gate, /location\.pathname\.split\('\/'\)\.filter\(Boolean\)/);
  assert.match(gate, /if\(loginRequiredPages\.has\(currentPage\)\)showAccessProgress\(true\)/);
  assert.match(gate, /location\.pathname\+location\.search\+location\.hash/);
  for (const route of ['fix-accuracy','fix-accuracy.html','fix-accuracy-game','fix-accuracy-game.html','speed-sprint','speed-sprint.html','word-accuracy','word-accuracy.html','time-attack','time-attack.html']) {
    assert.ok(gate.includes("'" + route + "'"), 'Missing protected route ' + route);
  }
});

test('arcade hub no longer contains the previously rendered escaped newline text', () => {
  const html = read('fix-accuracy.html');
  assert.doesNotMatch(html, /<meta[^>]+>\\n/);
  assert.match(html, /<\/head>\s*<body>/);
});
