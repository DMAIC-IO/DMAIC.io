/**
 * Guards die Leitfaden-Kapitel im statischen Handbuch — modulfreie Kapitel
 * aus `js/help/<id>-help.js`.
 *
 * Zwei Dinge gehen hier still schief, wenn niemand hinsieht:
 *
 *   1. Die Überschrift. `getModuleName` fällt für eine Kennung ohne
 *      `modules.<id>.name`-Eintrag auf die großgeschriebene Kennung zurück —
 *      „Ai Assistant". Darum nimmt `renderModulePage` einen Namen-Überschreiber.
 *   2. Der Verweis im Sprachindex. `renderLangIndex` rendert die Modulkarten
 *      ausschließlich über `CONSTANTS.PHASES`, und dort steht `guide` nicht.
 *      Eine Gruppe mit `phase: 'guide'` würde angelegt und nie gerendert —
 *      ohne Fehlermeldung, die Seite wird gebaut, nur der Verweis fehlt.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderModulePage, renderLangIndex } from './pages.mjs';
import { AI_ASSISTANT_CHAPTER_ID, AI_ASSISTANT_CHAPTER_KEY } from '../../../js/help/help-keys.js';

test('renderModulePage nimmt einen Namen-Überschreiber für modulfreie Kapitel', async () => {
  const page = await renderModulePage({
    module: { id: AI_ASSISTANT_CHAPTER_ID, phase: 'guide', help: { sections: {} }, references: [] },
    lang: 'de',
    i18n: { de: { modules: {} } },
    name: 'KI-Assistent',
  });
  assert.equal(page.pathFromRoot, '/de/guide/ai-assistant.html');
  assert.match(page.html, /KI-Assistent/);
  // Ohne Überschreiber würde `getModuleName` „Ai Assistant" erfinden.
  assert.doesNotMatch(page.html, /Ai Assistant/);
});

test('renderLangIndex verlinkt die Leitfaden-Kapitel', () => {
  const index = renderLangIndex({
    modules: [],
    guides: [{ id: AI_ASSISTANT_CHAPTER_ID, phase: 'guide', help: { sections: {} } }],
    lang: 'de',
    i18n: { de: { modules: {}, moduleHelp: { [AI_ASSISTANT_CHAPTER_KEY]: 'KI-Assistent' } } },
    examples: [],
  });
  assert.match(index.html, /\/de\/guide\/ai-assistant\.html|\.\/guide\/ai-assistant\.html/);
  assert.match(index.html, /KI-Assistent/);
});

test('renderLangIndex ohne Leitfäden baut keinen leeren Abschnitt', () => {
  const index = renderLangIndex({
    modules: [], lang: 'de', i18n: { de: { modules: {} } }, examples: [],
  });
  assert.doesNotMatch(index.html, /id="guide"/);
});

test('eine Leitfadenseite behauptet keine Zyklus-Zuordnung', async () => {
  // `renderModulePage` listet für jedes Modul die Zyklen, in denen es steckt,
  // und schreibt für ein nicht zugeordnetes Modul „ohne feste Phase (im
  // ‚Weitere‘-Tile)". Für ein modulfreies Kapitel ist das schlicht falsch: es
  // ist in keinem Zyklus eine Kachel. Nur `phase: 'data'` war davon
  // ausgenommen — `guide` muss es ebenfalls sein.
  const page = await renderModulePage({
    module: { id: AI_ASSISTANT_CHAPTER_ID, phase: 'guide', help: { sections: {} }, references: [] },
    lang: 'de',
    i18n: { de: { modules: {}, cycles: { dmaic: { name: 'DMAIC' } } } },
    name: 'KI-Assistent',
  });
  assert.doesNotMatch(page.html, /id="cycles"/);
});
