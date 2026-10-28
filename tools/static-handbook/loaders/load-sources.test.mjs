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
import { loadAllSources } from './load-sources.mjs';

/** Wurzel von `app/dev` — gleiche Herleitung wie `build.mjs:50`. */
const REPO = path.resolve(new URL('../../..', import.meta.url).pathname);

test('loadAllSources liefert keine modulfreien Kapitel', async () => {
  const sources = await loadAllSources(REPO);
  assert.equal('guides' in sources, false, 'modulfreie Kapitel gibt es nicht mehr');
});
