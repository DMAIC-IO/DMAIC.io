import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureKaTeX } from '../../js/core/katex-loader.js';

test('ensureKaTeX resolves without a global window.katex', async () => {
  await assert.doesNotReject(ensureKaTeX());
});
