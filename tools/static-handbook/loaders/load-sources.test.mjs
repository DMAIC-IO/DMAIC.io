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
import { readFileSync } from 'node:fs';
import { loadAllSources, loadExamples } from './load-sources.mjs';

/** Wurzel von `app/dev` — gleiche Herleitung wie `build.mjs:50`. */
const REPO = path.resolve(new URL('../../..', import.meta.url).pathname);

test('loadAllSources liefert keine modulfreien Kapitel', async () => {
  const sources = await loadAllSources(REPO);
  assert.equal('guides' in sources, false, 'modulfreie Kapitel gibt es nicht mehr');
});

test('loadExamples stellt die Szenarien in Reihenfolge von scenarios.json voran', async () => {
  const { scenarios } = JSON.parse(readFileSync(path.join(REPO, 'examples/shared/scenarios.json'), 'utf8'));
  const { entries } = await loadExamples(REPO);
  assert.deepEqual(entries.slice(0, scenarios.length).map((e) => e.id), scenarios.map((e) => e.id));
  assert.ok(entries.length > scenarios.length, 'danach folgen die Beispiele aus index.json');
});
