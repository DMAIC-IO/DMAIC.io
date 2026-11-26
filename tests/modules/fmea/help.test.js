/**
 * FMEA: Handbuch aus den Hilfedateien des Moduls.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const SECTION_IDS = ['overview', 'methodology', 'pitfalls'];
const BASE = '../../../js/modules/fmea/resources/i18n/';

async function load(lang) {
  const res = await fetch(new URL(`${BASE}help.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`help.${lang}.json: HTTP ${res.status}`);
  const { $schema, ...file } = await res.json();
  return file;
}

/** Alle Begriffslinks `{{term:id|…}}` eines Abschnitts, in Reihenfolge. */
const terms = (section) => [...JSON.stringify(section).matchAll(/\{\{term:([^|}]+)/g)].map((m) => m[1]);

suite('fmea: Handbuch aus help.<lang>.json', () => {
  test('drei Abschnitte mit DE- und EN-Inhalt, in derselben Reihenfolge', async () => {
    const de = await load('de');
    const en = await load('en');
    assertDeepEqual(Object.keys(de.sections), SECTION_IDS);
    assertDeepEqual(Object.keys(en.sections), SECTION_IDS);
    const def = helpDefFromFiles('fmea', { de, en });
    assertEqual(def.moduleId, 'fmea');
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const localized = def.sections[id][lang];
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0, `${id} (${lang})`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0, `${id} (${lang})`);
      }
    }
  });

  test('Begriffslinks sind je Abschnitt in DE und EN gleich, process-map in beiden', async () => {
    const de = await load('de');
    const en = await load('en');
    for (const id of SECTION_IDS) assertDeepEqual(terms(en.sections[id]), terms(de.sections[id]), id);
    assertTrue(terms(en.sections.methodology).includes('process-map'));
  });

  test('deutsche Zitate schließen typografisch', async () => {
    const de = await load('de');
    const all = JSON.stringify(de.sections);
    assertTrue(!all.includes('\\"'), 'ASCII-Anführungszeichen im deutschen Handbuch');
    assertEqual((all.match(/„[^“]*“/g) ?? []).length, 13, 'typografische Zitate');
  });
});
