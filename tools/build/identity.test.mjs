import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectLabData } from './lab-data.mjs';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('every algo source.file_path exists and is inlined verbatim', async () => {
  const { algos, sources } = await collectLabData(APP_DIR);
  for (const algo of Object.values(algos)) {
    const fp = algo.source?.file_path;
    if (!fp) continue;
    const onDisk = readFileSync(join(APP_DIR, fp), 'utf8');
    assert.equal(sources[fp], onDisk, `${algo.id}: displayed == on-disk source`);
  }
});
