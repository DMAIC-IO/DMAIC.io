import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseSpec, loadIconMap, lucideNames } from './icon-map.mjs';

test('parseSpec splits kind and file', () => {
  assert.deepEqual(parseSpec('lucide:trash-2'), { kind: 'lucide', file: 'trash-2' });
  assert.deepEqual(parseSpec('own:chart-thumb-pie'), { kind: 'own', file: 'chart-thumb-pie' });
});

test('parseSpec rejects an unknown prefix', () => {
  assert.throws(() => parseSpec('feather:trash'), /unknown icon source "feather"/);
});

test('parseSpec rejects an empty file name', () => {
  assert.throws(() => parseSpec('lucide:'), /empty icon file name/);
});

test('parseSpec rejects a spec without a colon', () => {
  assert.throws(() => parseSpec('trash-2'), /expected "<source>:<file>"/);
});

function writeMap(obj) {
  const dir = mkdtempSync(join(tmpdir(), 'icon-map-'));
  const file = join(dir, 'icon-map.json');
  writeFileSync(file, JSON.stringify(obj));
  return file;
}

test('loadIconMap returns the parsed object', () => {
  const file = writeMap({ 'action.delete': 'lucide:trash-2' });
  assert.deepEqual(loadIconMap(file), { 'action.delete': 'lucide:trash-2' });
});

test('loadIconMap names the offending key when a value is invalid', () => {
  const file = writeMap({ 'action.delete': 'nope' });
  assert.throws(() => loadIconMap(file), /action\.delete/);
});

test('lucideNames is sorted, deduplicated and skips own sources', () => {
  const map = {
    'a': 'lucide:trash-2',
    'b': 'own:chart-thumb-pie',
    'c': 'lucide:plus',
    'd': 'lucide:trash-2',
  };
  assert.deepEqual(lucideNames(map), ['plus', 'trash-2']);
});
