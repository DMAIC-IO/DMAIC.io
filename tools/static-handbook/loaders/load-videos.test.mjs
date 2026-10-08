import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadVideos } from './load-videos.mjs';

const entry = { type: 'module', id: 'demo', modules: ['run-chart'] };

/** @param {string|undefined} content @returns {Promise<string>} ein Repo-Wurzel-Stand-in */
async function repo(content) {
  const root = await mkdtemp(path.join(tmpdir(), 'videos-'));
  if (content !== undefined) {
    await mkdir(path.join(root, 'videos'), { recursive: true });
    await writeFile(path.join(root, 'videos/index.json'), content);
  }
  return root;
}

test('the wrapper form yields its videos array', async () => {
  const root = await repo(JSON.stringify({ _comment: 'generated file - do not edit', videos: [entry] }));
  assert.deepEqual(await loadVideos(root), { entries: [entry] });
});

test('an empty mirror is still the wrapper', async () => {
  const root = await repo(JSON.stringify({ _comment: 'generated file - do not edit', videos: [] }));
  assert.deepEqual(await loadVideos(root), { entries: [] });
});

test('a missing file is not an error — a handbook without videos is valid', async () => {
  assert.deepEqual(await loadVideos(await repo(undefined)), { entries: [] });
});

test('the old bare-array form fails loudly instead of being accepted too', async () => {
  const root = await repo(JSON.stringify([entry]));
  await assert.rejects(() => loadVideos(root), /array form/);
});

test('a wrapper without a videos array fails loudly', async () => {
  const root = await repo(JSON.stringify({ _comment: 'x' }));
  await assert.rejects(() => loadVideos(root), /videos/);
});
