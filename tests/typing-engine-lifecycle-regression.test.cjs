const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeEngine() {
  let now = 0;
  let intervalCallback = null;
  let intervalCleared = false;
  const listeners = new Map();
  const completed = [];
  const sandbox = {
    performance: { now: () => now },
    setInterval(fn) { intervalCallback = fn; return 17; },
    clearInterval(id) { assert.equal(id, 17); intervalCleared = true; },
    document: {
      addEventListener(name, fn) { listeners.set(name, fn); },
      removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
      hidden: false
    },
    TypingMaster: {
      calculateScore: (...args) => ({ args })
    },
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/typing-engine.js'), 'utf8') + '\\nthis.TypingEngine = TypingEngine;', sandbox);
  const engine = new sandbox.TypingEngine({
    passageText: 'hello world',
    durationSeconds: 10,
    onComplete: result => completed.push(result)
  });
  return {
    engine, completed, listeners,
    advance(ms) { now += ms; },
    fireInterval() { intervalCallback?.(); },
    get intervalCleared() { return intervalCleared; }
  };
}

test('typing timer starts once and reports elapsed time from monotonic clock', () => {
  const h = makeEngine();
  let ticks = 0;
  h.engine.onTick = (remaining, elapsed) => {
    ticks++;
    assert.equal(remaining, 8);
    assert.equal(elapsed, 2);
  };
  h.engine.start();
  h.engine.start();
  h.advance(2000);
  h.fireInterval();
  assert.equal(ticks, 1);
  assert.equal(h.engine.isActive, true);
  assert.equal(h.completed.length, 0);
});

test('typing timer completes once at duration and clears interval/listeners', () => {
  const h = makeEngine();
  h.engine.start();
  h.advance(10000);
  h.fireInterval();
  h.fireInterval();
  assert.equal(h.completed.length, 1);
  assert.equal(h.completed[0].reason, 'time');
  assert.equal(h.engine.isFinished, true);
  assert.equal(h.intervalCleared, true);
  assert.equal(h.listeners.has('visibilitychange'), false);
});

test('destroy stops timer and detaches visibility listener without submitting a score', () => {
  const h = makeEngine();
  h.engine.start();
  h.engine.destroy();
  assert.equal(h.engine.isActive, false);
  assert.equal(h.engine.isFinished, true);
  assert.equal(h.intervalCleared, true);
  assert.equal(h.listeners.has('visibilitychange'), false);
  assert.equal(h.completed.length, 0);
});


test('timer starts on the first printable key, including Space, but not modifier keys', () => {
  const h = makeEngine();
  const event = key => ({ key, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {}, stopPropagation() {} });
  h.engine.handleKeyDown(event('Shift'));
  h.engine.handleKeyDown(event('Control'));
  assert.equal(h.engine.isActive, false);
  h.engine.handleKeyDown(event(' '));
  assert.equal(h.engine.isActive, true);
  const startedAt = h.engine.startTimestamp;
  h.engine.handleKeyDown(event('a'));
  assert.equal(h.engine.startTimestamp, startedAt);
});

test('disabled Backspace is blocked without starting the timer', () => {
  const h = makeEngine();
  h.engine.allowBackspace = false;
  let prevented = false, stopped = false;
  h.engine.handleKeyDown({
    key: 'Backspace', preventDefault() { prevented = true; },
    stopPropagation() { stopped = true; }
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(h.engine.isActive, false);
});

test('enabled Backspace does not start the timer by itself', () => {
  const h = makeEngine();
  h.engine.allowBackspace = true;
  h.engine.handleKeyDown({
    key: 'Backspace', preventDefault() {}, stopPropagation() {}
  });
  assert.equal(h.engine.isActive, false);
});

test('passage completion submits exactly once and reports passage-complete reason', () => {
  const h = makeEngine();
  h.engine.handleInput('hello world');
  h.engine.handleInput('hello world!');
  assert.equal(h.completed.length, 1);
  assert.equal(h.completed[0].reason, 'passage-complete');
  assert.equal(h.engine.isFinished, true);
});
