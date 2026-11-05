/**
 * Guards the shape of `loadAllSources()`: the static handbook is built from
 * module handbooks, algorithms, i18n, examples, glossary and videos — there
 * are no module-free chapters any more.
 *
 * Der Lauf liest die echten Quellen (keine Temp-Attrappe).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { loadAllSources, loadExamples } from './load-sources.mjs';

/** Wurzel von `app/dev` — gleiche Herleitung wie `build.mjs:50`. */
const REPO = path.resolve(new URL('../../..', import.meta.url).pathname);

test('loadAllSources liefert keine modulfreien Kapitel', async () => {
  const sources = await loadAllSources(REPO);
  assert.equal('guides' in sources, false, 'modulfreie Kapitel gibt es nicht mehr');
});

test('loadExamples hängt die Szenarien in Reihenfolge von scenarios.json an', async () => {
  const { scenarios } = JSON.parse(readFileSync(path.join(REPO, 'examples/shared/scenarios.json'), 'utf8'));
  const { entries } = await loadExamples(REPO);
  assert.deepEqual(entries.slice(-scenarios.length).map((e) => e.id), scenarios.map((e) => e.id));
  assert.ok(entries.length > scenarios.length, 'davor stehen die Beispiele aus index.json');
});

test('downloadName: Index-Beispiele flach, Beispiele umgestellter Module unter <modul>/', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hb-examples-'));
  mkdirSync(path.join(root, 'examples'), { recursive: true });
  writeFileSync(path.join(root, 'examples/index.json'), JSON.stringify({ examples: [
    { id: 'alt-a', type: 'project', file: 'projects/a.json', modules: ['alt'] },
  ] }));
  const resDir = path.join(root, 'js/modules/neu/resources/examples');
  mkdirSync(resDir, { recursive: true });
  writeFileSync(path.join(resDir, 'examples.json'), JSON.stringify({ examples: [
    { id: 'neu-a', type: 'project', file: 'projects/a.json' },
  ] }));
  const { entries } = await loadExamples(root, { converted: ['neu'], exampleRefs: {} });
  const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
  assert.equal(byId['alt-a'].downloadName, 'a.json');
  assert.equal(byId['neu-a'].downloadName, 'neu/a.json');
});
