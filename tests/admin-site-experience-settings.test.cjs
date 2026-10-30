'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin.js'), 'utf8');

test('website settings render every site-experience field used by the handlers', () => {
  for (const id of [
    'experience-landing',
    'experience-audio-file',
    'experience-audio-current',
    'experience-audio-enabled',
    'experience-audio-loop',
    'experience-audio-logged-in'
  ]) {
    assert.match(source, new RegExp('id="' + id + '"|name="' + id + '"'), id + ' must be present in the settings UI');
  }
});

test('site-experience settings save through the existing singleton row', () => {
  assert.match(source, /from\('site_experience_settings'\)\.update\(/);
  assert.match(source, /\.eq\('id',1\)\.select\('id,updated_at'\)\.maybeSingle\(\)/);
  assert.match(source, /if\(!expResult\.data\)throw new Error\('Site experience settings were not saved/);
});

test('audio uploads are type- and size-checked before storage upload', () => {
  assert.match(source, /if\(!file\.type\.startsWith\('audio\/'\)\)/);
  assert.match(source, /file\.size>10\*1024\*1024/);
  assert.match(source, /from\('public-site-audio'\)\.upload\(/);
});
