'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('all three arcade routes load their unique interface and canonical scoring engine', () => {
  const routes = [['speed-sprint.html','sprint','Speed Sprint'],['word-accuracy.html','accuracy','Word Accuracy'],['time-attack.html','time','Time Attack']];
  for (const [file,mode,title] of routes) {
    const html=read(file);
    assert.match(html,new RegExp('data-arcade-game="'+mode+'"'));
    assert.match(html,new RegExp('<title>'+title));
    assert.match(html,/css\/arcade-games\.css/);
    assert.match(html,/js\/arcade-games\.js/);
    assert.match(html,/typing-result\/typing-master\.js/);
    assert.match(html,/id="game-input"/);
    assert.match(html,/id="game-result"/);
    assert.match(html,/id="result-retry"/);
    assert.match(html,/fix-accuracy\.html/);
  }
});
test('arcade menu exposes all three playable routes',()=>{const html=read('fix-accuracy.html');for(const route of ['speed-sprint.html','word-accuracy.html','time-attack.html'])assert.match(html,new RegExp('href="/'+route+'"'));assert.doesNotMatch(html,/class="game-tile coming"/);});
test('game engine parses and implements three different challenge loops',()=>{const source=read('js/arcade-games.js');assert.doesNotThrow(()=>new vm.Script(source));assert.match(source,/sprint:[\s\S]*?duration:45/);assert.match(source,/accuracy:[\s\S]*?goal:30/);assert.match(source,/time:[\s\S]*?duration:75/);assert.match(source,/ghost/);assert.match(source,/shield/);assert.match(source,/threat/);assert.match(source,/function finish\(/);});
test('all arcade results use Fix Accuracy committed scoring calculations',()=>{const source=read('js/arcade-games.js');assert.match(source,/TypingMaster\.calculateCommittedScore/);for(const field of ['grossWpm','netWpm','accuracy','allowedErrors','excessErrors','penaltyWpm'])assert.match(source,new RegExp(field));});
