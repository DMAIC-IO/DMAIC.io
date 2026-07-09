import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XLSX } from '../../js/core/vendor/xlsx.js';

test('vendor/xlsx re-exports a usable XLSX namespace', () => {
  assert.equal(typeof XLSX.utils.book_new, 'function');
  assert.equal(typeof XLSX.read, 'function');
});
