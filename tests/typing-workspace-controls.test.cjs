'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function control() {
  const listeners = {};
  return {
    style: {},
    addEventListener(name, callback) { listeners[name] = callback; },
    click(name) { listeners[name](); }
  };
}

test('shared font controls bind both directions and clamp the configured range', () => {
  const down = control(), up = control(), passage = control(), input = control();
  const sandbox = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../js/typing/workspace-controls.js'), 'utf8'),
    sandbox
  );
  const changes = [];
  const font = sandbox.TypingWorkspaceControls.bindFontControls({
    downButton: down,
    upButton: up,
    targets: [passage, input],
    initialSize: 18,
    min: 14,
    max: 20,
    step: 2,
    onChange: size => changes.push(size)
  });

  assert.equal(font.get(), 18);
  assert.equal(passage.style.fontSize, '18px');
  assert.equal(input.style.fontSize, '18px');
  up.click('click');
  assert.equal(font.get(), 20);
  up.click('click');
  assert.equal(font.get(), 20);
  down.click('click');
  assert.equal(font.get(), 18);
  assert.equal(changes.at(-1), 18);
  font.set(1);
  assert.equal(font.get(), 14);
});
