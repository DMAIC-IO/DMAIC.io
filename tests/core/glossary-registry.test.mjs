import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GlossaryRegistry } from '../../js/core/glossary-registry.js';

test('glossary registry loads bundled catalog + terms without fetch', async () => {
  const r = new GlossaryRegistry();
  await r.init();                       // no network — data is bundled
  assert.ok(r.getAll().length > 0, 'index populated from bundle');
  assert.ok(r.getAllCached().length > 0, 'terms warmed at init (no lazy fetch)');
});

test('glossary-registry source has no runtime fetch / computed imports', () => {
  const src = readFileSync(new URL('../../js/core/glossary-registry.js', import.meta.url), 'utf8');
  assert.equal(/\bfetch\s*\(/.test(src), false, 'no fetch() left');
  assert.equal(/import\(new URL/.test(src), false, 'no computed import()');
});
