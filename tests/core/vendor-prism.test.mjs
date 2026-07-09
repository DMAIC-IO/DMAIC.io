import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Prism } from '../../js/core/vendor/prism.js';

test('vendor/prism exposes javascript + python grammars', () => {
  assert.ok(Prism.languages.javascript, 'javascript grammar registered');
  assert.ok(Prism.languages.python, 'python grammar registered');
  assert.equal(typeof Prism.tokenize, 'function');
});
