/**
 * Interaction guard: the gesture core under js/core/interaction/ reads and
 * writes only `data-id` and attributes owned by a gesture
 * (`data-gesture-*`, `data-reorder-*`, `data-resize-*`), also as
 * `dataset.<name>`. Everything else belongs to the host markup.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../js/core/interaction');

const OWNED = /^(gesture|reorder|resize)-/;
const OWNED_CAMEL = /^(gesture|reorder|resize)[A-Z]/;

/**
 * Lists every foreign data attribute a source text touches.
 * @param {string} src
 * @returns {string[]}
 */
export function foreignAttrs(src) {
  const hits = [];
  for (const m of src.matchAll(/data-([a-z][a-z0-9-]*)/g)) {
    if (m[1] !== 'id' && !OWNED.test(m[1])) hits.push(`data-${m[1]}`);
  }
  for (const m of src.matchAll(/dataset\.([A-Za-z][A-Za-z0-9]*)/g)) {
    if (m[1] !== 'id' && !OWNED_CAMEL.test(m[1])) hits.push(`dataset.${m[1]}`);
  }
  return hits;
}

test('a foreign dataset name is a finding', () => {
  assert.deepEqual(foreignAttrs('el.dataset.group = 1'), ['dataset.group']);
  assert.deepEqual(foreignAttrs("q('[data-column]')"), ['data-column']);
  assert.deepEqual(foreignAttrs("el.dataset.id; el.dataset.reorderGroup; 'data-resize-edge'"), []);
});

test('js/core/interaction touches only data-id and owned attributes', () => {
  const files = readdirSync(DIR, { recursive: true }).map(String).filter((f) => f.endsWith('.js'));
  assert.ok(files.length > 0, 'interaction has source files');
  const hits = [];
  for (const f of files) {
    for (const h of foreignAttrs(readFileSync(join(DIR, f), 'utf8'))) hits.push(`${f}: ${h}`);
  }
  assert.deepEqual(hits, []);
});
