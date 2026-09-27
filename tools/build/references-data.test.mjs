import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectReferenceIds, renderReferencesRegistryModule } from './references-data.mjs';

/** Build a throwaway app dir with the given module → file map. */
function fixture(modules) {
  const root = mkdtempSync(join(tmpdir(), 'refs-'));
  for (const [id, files] of Object.entries(modules)) {
    const dir = join(root, 'js', 'modules', id);
    mkdirSync(dir, { recursive: true });
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  }
  return root;
}

test('collectReferenceIds: only directories with <id>-references.js, sorted', () => {
  const root = fixture({
    'msa-typ1': { 'msa-typ1-references.js': 'export default [];' },
    'sipoc': { 'sipoc.js': '' },
    'capability': { 'capability-references.js': 'export default [];' },
  });
  assert.deepEqual(collectReferenceIds(root), ['capability', 'msa-typ1']);
});

test('renderReferencesRegistryModule emits eager imports and a REFS map', () => {
  const text = renderReferencesRegistryModule(['msa-typ1']);
  assert.match(text, /import r0 from '\.\.\/modules\/msa-typ1\/msa-typ1-references\.js';/);
  assert.match(text, /export const REFS = \{/);
  assert.match(text, /"msa-typ1": r0/);
});

test('renderReferencesRegistryModule with no modules still emits an empty REFS', () => {
  const text = renderReferencesRegistryModule([]);
  assert.match(text, /export const REFS = \{\s*\};/);
});
