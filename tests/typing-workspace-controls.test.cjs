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


test('shared visibility helper toggles the hidden state without changing content', () => {
  const target = { hidden: false, textContent: 'passage' };
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/typing/workspace-controls.js'), 'utf8'), sandbox);
  const controls = sandbox.TypingWorkspaceControls;
  assert.equal(controls.setHidden(target, true), true);
  assert.equal(target.hidden, true);
  assert.equal(target.textContent, 'passage');
  assert.equal(controls.setHidden(target, false), false);
  assert.equal(target.hidden, false);
});

test('shared display and highlight helpers apply and reverse presentation state', () => {
  const classes = new Set();
  const target = {
    style: { display: 'block' },
    classList: {
      toggle(name, enabled) {
        if (enabled) classes.add(name);
        else classes.delete(name);
      }
    }
  };
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/typing/workspace-controls.js'), 'utf8'), sandbox);
  const controls = sandbox.TypingWorkspaceControls;
  controls.setDisplay(target, false);
  assert.equal(target.style.display, 'none');
  controls.setDisplay(target, true, 'block');
  assert.equal(target.style.display, 'block');
  controls.setClassState(target, 'highlight-on', true);
  assert.equal(classes.has('highlight-on'), true);
  controls.setClassState(target, 'highlight-on', false);
  assert.equal(classes.has('highlight-on'), false);
});

\ntest('Fix Accuracy toolbar exposes icons and pressed colour states for toggles', () => {
  const html = fs.readFileSync(path.join(__dirname, '../fix-accuracy.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../js/fix-accuracy.js'), 'utf8');
  for (const id of ['fix-toggle-highlight', 'fix-toggle-passage']) {
    const match = html.match(new RegExp('<button[^>]*id="' + id + '"[^>]*>', 'u'));
    assert.ok(match, id + ' button exists');
    assert.match(match[0], /data-icon=/u);
    assert.match(match[0], /data-tooltip=/u);
    assert.match(match[0], /aria-pressed="false"/u);
  }
  for (const id of ['fix-font-down', 'fix-font-up']) {
    const match = html.match(new RegExp('<button[^>]*id="' + id + '"[^>]*>', 'u'));
    assert.ok(match, id + ' button exists');
    assert.match(match[0], /data-icon=/u);
    assert.match(match[0], /data-tooltip=/u);
  }
  assert.match(script, /function syncToggleButton\(button, enabled/u);
  assert.match(script, /setAttribute\('aria-pressed', String\(Boolean\(enabled\)\)\)/u);
  assert.match(script, /syncToggleButton\(\$\('fix-toggle-passage'\),passageHidden/u);
  assert.match(script, /syncToggleButton\(\$\('fix-toggle-highlight'\),highlightEnabled/u);
});
