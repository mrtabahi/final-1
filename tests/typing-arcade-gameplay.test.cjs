'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function makeElement(id) {
  const listeners = {};
  return {
    id, textContent:'', value:'', hidden:false, disabled:false, dataset:{}, style:{},
    listeners,
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    focus() {},
    fire(type, event = {}) { for (const callback of listeners[type] || []) callback(event); },
    querySelectorAll() { return id === 'mission-sectors' ? sectors : []; }
  };
}
const sectors = Array.from({length:4}, (_, wave) => ({dataset:{wave:String(wave),state:'locked'}}));

async function loadGame(htmlPath, scriptPath) {
  const html = read(htmlPath);
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(match => [match[1], makeElement(match[1])]));
  let ready = null, now = 1000, guardCalls = 0, intervalCallback = null;
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, makeElement(id)); return elements.get(id); },
    addEventListener(type, callback) { if (type === 'DOMContentLoaded') ready = callback; }
  };
  const context = {
    document, console:{log(){},warn(){},error(){}},
    AuthManager:{async requireCandidateGuard(){guardCalls++;return {ok:true};}},
    performance:{now(){return now;}},
    setInterval(callback){intervalCallback=callback;return 1;},
    clearInterval(){intervalCallback=null;},
    location:{href:'',reload(){}}
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read('supabase/functions/typing-result/typing-master.js'), context);
  vm.runInContext(read('js/typing/master-config.js'), context);
  vm.runInContext(read('js/arcade/scoring.js'), context);
  vm.runInContext(read(scriptPath), context);
  assert.equal(typeof ready, 'function', scriptPath + ' should wait for DOM readiness');
  await ready();
  assert.equal(guardCalls, 1, scriptPath + ' should enforce candidate access');
  return {
    get(id){return elements.get(id) || document.getElementById(id);},
    setNow(value){now=value;},
    get intervalCallback(){return intervalCallback;}
  };
}

test('Speed Sprint starts, advances race checkpoints and produces a canonical dual-formula result', async () => {
  const game = await loadGame('speed-sprint.html','js/arcade/speed-sprint.js');
  game.get('sprint-start').fire('click');
  assert.equal(game.get('sprint-play').hidden, false);
  const target = game.get('sprint-target').textContent;
  game.get('sprint-input').value = target + ' ';
  game.get('sprint-input').fire('input');
  assert.equal(game.get('sprint-word-count').textContent, '1 / 90');
  game.get('sprint-abort').fire('click');
  assert.equal(game.get('sprint-results').hidden, false);
  assert.match(game.get('sprint-result-bsf-gross').textContent, /WPM/);
  assert.match(game.get('sprint-result-crpf-net').textContent, /WPM/);
  assert.equal(game.get('sprint-result-bsf-keys').textContent, game.get('sprint-result-crpf-keys').textContent);
});

test('Word Accuracy spends shields on mismatches and records exact-match streaks', async () => {
  const game = await loadGame('word-accuracy.html','js/arcade/word-accuracy.js');
  game.get('precision-start').fire('click');
  const first = game.get('precision-target').textContent;
  game.get('precision-input').value = first + ' ';
  game.get('precision-input').fire('input');
  assert.equal(game.get('precision-correct').textContent, '1');
  assert.equal(game.get('precision-streak').textContent, '1');
  game.get('precision-input').value = ' ';
  game.get('precision-input').fire('input');
  const second = game.get('precision-target').textContent;
  game.get('precision-input').value = second + ' ';
  game.get('precision-input').fire('input');
  const third = game.get('precision-target').textContent;
  game.get('precision-input').value = 'not-' + third + ' ';
  game.get('precision-input').fire('input');
  assert.equal(game.get('precision-shields').textContent.trim(), '● ● ○');
  game.get('precision-finish').fire('click');
  assert.equal(game.get('precision-results').hidden, false);
  assert.equal(game.get('precision-result-correct').textContent, '1');
  assert.equal(game.get('precision-result-wrong').textContent, '1');
  assert.match(game.get('precision-result-crpf-accuracy').textContent, /%/);
});

test('Time Attack tracks target hits, misses, combos and completed mission reporting', async () => {
  const game = await loadGame('time-attack.html','js/arcade/time-attack.js');
  game.get('mission-start').fire('click');
  const first = game.get('mission-target').textContent;
  game.get('mission-input').value = first + ' ';
  game.get('mission-input').fire('input');
  assert.equal(game.get('mission-combo').textContent, '1');
  assert.equal(game.get('mission-best-combo').textContent, '1');
  const second = game.get('mission-target').textContent;
  game.get('mission-input').value = 'missed-' + second + ' ';
  game.get('mission-input').fire('input');
  assert.equal(game.get('mission-combo').textContent, '0');
  game.get('mission-abort').fire('click');
  assert.equal(game.get('mission-results').hidden, false);
  assert.equal(game.get('mission-result-correct').textContent, '1');
  assert.equal(game.get('mission-result-missed').textContent, '1');
  assert.equal(game.get('mission-result-best-combo').textContent, '1');
  assert.match(game.get('mission-result-bsf-net').textContent, /WPM/);
  assert.match(game.get('mission-result-crpf-net').textContent, /WPM/);
});
