import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectLabData, renderLabDataModule } from './lab-data.mjs';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('collectLabData: SOURCES text equals the engine file on disk (identity)', async () => {
  const { algos, sources } = await collectLabData(APP_DIR);
  const sample = Object.values(algos).find((a) => a.source && a.source.file_path);
  assert.ok(sample, 'has an algo with source.file_path');
  const fp = sample.source.file_path;
  const onDisk = readFileSync(join(APP_DIR, fp), 'utf8');
  assert.equal(sources[fp], onDisk, 'SOURCES text is the exact engine file');
});

test('renderLabDataModule emits INDEX/ALGOS/SOURCES/ENGINES/FIXTURES exports', () => {
  const text = renderLabDataModule({ index: { categories: [] }, algos: {}, sources: {}, fixtures: {} });
  for (const name of ['INDEX', 'ALGOS', 'SOURCES', 'ENGINES', 'FIXTURES']) {
    assert.match(text, new RegExp(`export const ${name}`));
  }
});

test('collectLabData inlines validation fixtures so the Lab needs no tests/ fetch', async () => {
  const { fixtures } = await collectLabData(APP_DIR);
  // The tests/ directory is not shipped in frozen releases; fixtures must be inline.
  assert.ok(Object.keys(fixtures).length > 0, 'at least one algorithm has inlined fixtures');
  const cpk = fixtures.cpk;
  assert.ok(cpk && Array.isArray(cpk.test_cases) && cpk.test_cases.length > 0,
    'cpk fixtures inlined with test_cases');
});
