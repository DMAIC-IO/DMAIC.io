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

test('renderLabDataModule emits INDEX/ALGOS/SOURCES/ENGINES exports', () => {
  const text = renderLabDataModule({ index: { categories: [] }, algos: {}, sources: {} });
  for (const name of ['INDEX', 'ALGOS', 'SOURCES', 'ENGINES']) {
    assert.match(text, new RegExp(`export const ${name}`));
  }
});
