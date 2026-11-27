/**
 * Kano: Handbuch aus den Hilfedateien des Moduls (resources/i18n/help.<lang>.json).
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const BASE = '../../../js/modules/kano/resources/i18n/';

async function load(lang) {
  const res = await fetch(new URL(`${BASE}help.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`help.${lang}.json: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

/** Alle Begriffslinks `{{term:id|…}}` eines Abschnitts, in Reihenfolge. */
const terms = (section) => [...JSON.stringify(section).matchAll(/\{\{term:([^|}]+)/g)].map((m) => m[1]);

suite('kano: Handbuch aus help.<lang>.json', () => {
  test('dieselben drei Abschnitte in DE und EN, je mit Titel und Blöcken', async () => {
    const de = await load('de');
    const en = await load('en');
    assertDeepEqual(Object.keys(de.sections), ['overview', 'methodology', 'pitfalls']);
    assertDeepEqual(Object.keys(en.sections), Object.keys(de.sections));
    const def = helpDefFromFiles('kano', { de, en });
    assertEqual(def.moduleId, 'kano');
    for (const id of Object.keys(de.sections)) {
      for (const lang of ['de', 'en']) {
        const localized = def.sections[id][lang];
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0, `${id} ${lang}`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0, `${id} ${lang}`);
        assertEqual(localized.blocks.length, (lang === 'de' ? de : en).sections[id].blocks.length);
      }
    }
  });
  test('Begriffslinks im Überblick wie in der Altform', async () => {
    const de = await load('de');
    assertDeepEqual(terms(de.sections.overview).slice(0, 3), ['kano', 'voc', 'ctq']);
  });
  test('deutsche Texte mit echten Umlauten, ohne ASCII-Anführungszeichen', async () => {
    const all = JSON.stringify((await load('de')).sections);
    assertTrue(/[äöüÄÖÜß]/.test(all));
    assertTrue(!all.includes('\\"'), 'ASCII-Anführungszeichen im deutschen Handbuch');
  });
});
