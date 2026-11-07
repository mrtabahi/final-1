const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const typingPage = fs.readFileSync('Typing_test.html', 'utf8');
const categories = fs.readFileSync('js/typing-tests.js', 'utf8');

test('Self Test is not rendered as a Typing Tests category card', () => {
  assert.doesNotMatch(categories, /category-card-self/u);
  assert.doesNotMatch(categories, /const selfTestCard/u);
  assert.match(categories, /box\\.innerHTML\\s*=\\s*cards\\s*;/u);
});

test('Self Test remains directly accessible from the separate navigation menu', () => {
  assert.match(typingPage, /<a href="\\/self-test\\.html">Self Test<\\/a>/u);
  assert.match(typingPage, /js\\/typing-tests\\.js\\?v=20261108-remove-self-card1/u);
});
