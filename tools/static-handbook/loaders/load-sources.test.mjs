/**
 * Guards the modul-freie Handbuchkapitel in `js/help/<id>-help.js`.
 *
 * Diese Kapitel gehören zu keinem der 72 Module — das Rollen-Briefing der
 * Agentenfläche heute, ein „Arbeiten mit Qprovement" morgen. Sie tragen
 * `phase: 'guide'`, und genau das setzt ihre Seite auf
 * `/<lang>/guide/<id>.html`: `renderModulePage` baut den Pfad aus `phase`.
 *
 * Der Lauf liest die echten Quellen (keine Temp-Attrappe), weil der Fund,
 * den dieser Test absichert, genau dort liegt: ein Kapitel, das existiert,
 * aber nicht geladen wird, bleibt sonst unbemerkt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadGuides, loadAllSources } from './load-sources.mjs';
import { AI_ASSISTANT_CHAPTER_ID } from '../../../js/help/help-keys.js';

/** Wurzel von `app/dev` — gleiche Herleitung wie `build.mjs:50`. */
const REPO = path.resolve(new URL('../../..', import.meta.url).pathname);

test('loadGuides lädt modulfreie Handbücher aus js/help mit phase: guide', async () => {
  const guides = await loadGuides(REPO);
  const briefing = guides.find(g => g.id === AI_ASSISTANT_CHAPTER_ID);
  assert.ok(briefing, 'das Briefing-Kapitel wurde nicht gefunden');
  assert.equal(briefing.phase, 'guide');
  assert.deepEqual(briefing.references, []);
  // Die sechs Abschnitte der Spec, in Deklarationsreihenfolge.
  assert.deepEqual(Object.keys(briefing.help.sections),
    ['rolle', 'arbeitsweise', 'ausschliesslich', 'vertrag', 'fehlgriffe', 'grenzen']);
  // Zweisprachig, beide Seiten gefüllt.
  for (const key of Object.keys(briefing.help.sections)) {
    for (const lang of ['de', 'en']) {
      const localized = briefing.help.sections[key][lang];
      assert.ok(localized?.title, `${key}/${lang}: keine Überschrift`);
      assert.ok((localized.blocks ?? []).length > 0, `${key}/${lang}: keine Blöcke`);
    }
  }
});

test('loadGuides übergeht help-keys.js — nur `<id>-help.js` ist ein Kapitel', async () => {
  const guides = await loadGuides(REPO);
  assert.ok(!guides.some(g => g.id === 'help-keys'),
    'help-keys.js ist eine Kennungsdatei, kein Kapitel');
});

test('loadAllSources gibt guides mit zurück', async () => {
  const sources = await loadAllSources(REPO);
  assert.ok(Array.isArray(sources.guides));
  assert.ok(sources.guides.some(g => g.id === AI_ASSISTANT_CHAPTER_ID));
});
