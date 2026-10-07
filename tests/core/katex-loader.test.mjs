import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureKaTeX } from '../../js/core/katex-loader.js';

test('ensureKaTeX resolves to the KaTeX library', async () => {
  const katex = await ensureKaTeX();
  assert.equal(typeof katex.render, 'function');
});
