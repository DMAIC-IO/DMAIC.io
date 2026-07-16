import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Papa } from '../../js/core/vendor/papaparse.js';
import { opentype } from '../../js/core/vendor/opentype.js';

test('papaparse + opentype re-exports load', () => {
  assert.equal(typeof Papa.parse, 'function');
  assert.equal(typeof opentype.parse, 'function');
});
