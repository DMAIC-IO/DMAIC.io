import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectHelpIds, collectGuideIds, renderHelpRegistryModule } from './help-data.mjs';

/** Ein Wegwerf-App-Verzeichnis mit Modul- und Leitfaden-Handbüchern. */
function fixture({ modules = [], guides = [] }) {
  const root = mkdtempSync(join(tmpdir(), 'help-'));
  mkdirSync(join(root, 'js', 'modules'), { recursive: true });
  for (const id of modules) {
    const dir = join(root, 'js', 'modules', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${id}-help.js`), 'export default { sections: {} };');
  }
  mkdirSync(join(root, 'js', 'help'), { recursive: true });
  for (const id of guides) {
    writeFileSync(join(root, 'js', 'help', `${id}-help.js`), 'export default { sections: {} };');
  }
  return root;
}

test('collectGuideIds findet modulfreie Handbücher in js/help', () => {
  const root = fixture({ modules: ['five-why'], guides: ['ai-assistant'] });
  assert.deepEqual(collectGuideIds(root), ['ai-assistant']);
  // Und mischt sich NICHT in die Modulliste.
  assert.deepEqual(collectHelpIds(root), ['five-why']);
});

test('collectGuideIds ist leer, wenn js/help fehlt', () => {
  // Der Fundort darf nicht zur Voraussetzung werden: ein Baum ohne js/help
  // ist kein Fehler.
  const root = mkdtempSync(join(tmpdir(), 'help-'));
  mkdirSync(join(root, 'js', 'modules'), { recursive: true });
  assert.deepEqual(collectGuideIds(root), []);
});

test('collectGuideIds nimmt nur <id>-help.js, keine Nachbardateien', () => {
  // In js/help liegen künftig auch Nicht-Handbücher (gemeinsame Konstanten,
  // Tests). Nur das Namensmuster zählt, sonst entsteht ein Import auf eine
  // Datei ohne Default-Export.
  const root = fixture({ guides: ['ai-assistant'] });
  writeFileSync(join(root, 'js', 'help', 'help-keys.js'), 'export const X = 1;');
  writeFileSync(join(root, 'js', 'help', 'README.md'), '# nope');
  assert.deepEqual(collectGuideIds(root), ['ai-assistant']);
});

test('renderHelpRegistryModule nimmt Modul- und Leitfaden-Handbücher in EINE Map', () => {
  const src = renderHelpRegistryModule(['five-why'], ['ai-assistant']);
  assert.match(src, /import h0 from '\.\.\/modules\/five-why\/five-why-help\.js';/);
  assert.match(src, /import g0 from '\.\.\/help\/ai-assistant-help\.js';/);
  assert.match(src, /"five-why": h0/);
  assert.match(src, /"ai-assistant": g0/);
});

test('renderHelpRegistryModule bleibt ohne Leitfaden-Liste benutzbar', () => {
  const src = renderHelpRegistryModule(['five-why']);
  assert.match(src, /"five-why": h0/);
  assert.doesNotMatch(src, /\/help\//);
});
