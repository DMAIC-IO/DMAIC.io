/**
 * VoC → CTx-Baum: Handbuch aus den Hilfedateien des Moduls.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const BASE = '../../../js/modules/voc-ctx-tree/resources/i18n/';

async function load(lang) {
  const res = await fetch(new URL(`${BASE}help.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`help.${lang}.json: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

/** Alle Begriffslinks `{{term:id|…}}` eines Abschnitts, in Reihenfolge. */
const terms = (section) => [...JSON.stringify(section).matchAll(/\{\{term:([^|}]+)/g)].map((m) => m[1]);

suite('voc-ctx-tree: Handbuch aus help.<lang>.json', () => {
  test('dieselben Abschnitte in DE und EN, je mit Titel und Blöcken', async () => {
    const de = await load('de');
    const en = await load('en');
    assertDeepEqual(Object.keys(de.sections), Object.keys(en.sections));
    assertTrue(Object.keys(de.sections).length >= 3);
    const def = helpDefFromFiles('voc-ctx-tree', { de, en });
    assertEqual(def.moduleId, 'voc-ctx-tree');
    for (const id of Object.keys(de.sections)) {
      for (const lang of ['de', 'en']) {
        const localized = def.sections[id][lang];
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0, `${id} ${lang}`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0, `${id} ${lang}`);
      }
    }
  });
  test('Begriffslinks im Überblick wie in der Altform', async () => {
    const de = await load('de');
    assertDeepEqual(terms(de.sections.overview).slice(0, 3), ['ctx-baum', 'voc', 'ctq']);
  });
  test('deutsche Texte mit echten Umlauten und typografisch geschlossenen Zitaten', async () => {
    const de = await load('de');
    const all = JSON.stringify(de.sections);
    assertTrue(/[äöüÄÖÜß]/.test(all));
    assertTrue(!all.includes('\\"'), 'ASCII-Anführungszeichen im deutschen Handbuch');
    assertEqual((all.match(/„[^“]*“/g) ?? []).length, 10, 'typografische Zitate');
  });
});
