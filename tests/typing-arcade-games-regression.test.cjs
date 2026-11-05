'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('all three arcade game routes are wired to the shared game workspace', () => {
  const routes = [
    ['speed-sprint.html', 'sprint', 'Speed Sprint'],
    ['word-accuracy.html', 'accuracy', 'Word Accuracy'],
    ['time-attack.html', 'time', 'Time Attack']
  ];
  for (const [file, mode, title] of routes) {
    const html = read(file);
    assert.match(html, new RegExp('data-arcade-game="' + mode + '"'));
    assert.match(html, new RegExp('<title>' + title));
    assert.match(html, /css\/arcade-games\.css/);
    assert.match(html, /js\/arcade-games\.js/);
    assert.match(html, /id="game-input"/);
    assert.match(html, /id="game-result"/);
    assert.match(html, /fix-accuracy\.html/);
  }
});

test('arcade menu exposes all three playable routes', () => {
  const html = read('fix-accuracy.html');
  for (const route of ['speed-sprint.html', 'word-accuracy.html', 'time-attack.html']) {
    assert.match(html, new RegExp('href="/' + route + '"'));
  }
  assert.doesNotMatch(html, /class="game-tile coming"/);
});

test('shared game engine parses and defines distinct challenge rules', () => {
  const source = read('js/arcade-games.js');
  assert.doesNotThrow(() => new vm.Script(source));
  assert.match(source, /sprint:\s*\{[^}]*duration:30/s);
  assert.match(source, /accuracy:\s*\{[^}]*goal:25/s);
  assert.match(source, /time:\s*\{[^}]*duration:60/s);
  assert.match(source, /typed===target/);
  assert.match(source, /bestStreak/);
  assert.match(source, /function finish\(/);
  assert.match(source, /result-retry/);
});
