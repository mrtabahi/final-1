'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const js = fs.readFileSync(path.join(__dirname, '../js/self-test.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../self-test.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../css/self-test.css'), 'utf8');

test('Self Test selected formula renders PASS or FAIL from the canonical engine result', () => {
  assert.match(js, /const passed=score\.passed===true/u);
  assert.match(js, /scoringFormula\.toUpperCase\(\)\+\(passed\?' PASS':' FAIL'\)/u);
  assert.match(html, /id="self-result-status"/u);
  assert.match(js, /value\.passed===true\?'PASS':'FAIL'/u);
});

test('Self Test preserves both formula outcomes and changes selected scorecard', () => {
  assert.match(js, /\['BSF',selfScores\.bsf\],\['CRPF',selfScores\.crpf\]/u);
  assert.match(js, /self-formula-bsf/u);
  assert.match(js, /self-formula-crpf/u);
  assert.match(js, /renderSelfResult\(selfScores\.crpf/u);
  assert.match(js, /renderSelfResult\(selfScores\.bsf/u);
});

test('Self Test result cards use distinct pastel status colours', () => {
  for (const tone of ['pink','yellow','sky','lavender','mint']) {
    assert.match(css, new RegExp('metric-' + tone));
  }
  assert.match(css, /\.self-result-status\.is-pass/u);
  assert.match(css, /\.self-result-status\.is-fail/u);
});

test('Self Test print-to-PDF includes status and both formula outcomes in a print-safe layout', () => {
  assert.match(html, /Print Scorecard \/ Save as PDF/u);
  assert.match(css, /@media print[\s\S]*self-result-status/u);
  assert.match(css, /break-inside:avoid!important/u);
  assert.match(css, /print-color-adjust:exact/u);
  assert.match(js, /value\.passed===true\?'Qualification achieved':'Qualification not achieved'/u);
});
