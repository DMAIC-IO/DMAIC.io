import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectHelpIds, renderHelpRegistryModule } from './help-data.mjs';

/** Ein Wegwerf-App-Verzeichnis mit Modul-Handbüchern. */
function fixture({ modules = [] }) {
  const root = mkdtempSync(join(tmpdir(), 'help-'));
  mkdirSync(join(root, 'js', 'modules'), { recursive: true });
  for (const id of modules) {
    const dir = join(root, 'js', 'modules', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${id}-help.js`), 'export default { sections: {} };');
  }
  return root;
}

test('collectHelpIds findet die Modul-Handbücher', () => {
  const root = fixture({ modules: ['five-why', 'sipoc'] });
  assert.deepEqual(collectHelpIds(root), ['five-why', 'sipoc']);
});

test('renderHelpRegistryModule nimmt nur Modul-Handbücher auf', () => {
  const src = renderHelpRegistryModule(['five-why']);
  assert.match(src, /import h0 from '\.\.\/modules\/five-why\/five-why-help\.js';/);
  assert.match(src, /"five-why": h0/);
  assert.doesNotMatch(src, /\/help\//);
});

test('help-data kennt keine modulfreien Kapitel mehr', async () => {
  const mod = await import('./help-data.mjs');
  assert.equal('collectGuideIds' in mod, false);
});
