/**
 * Makigami: Handbuch aus den Hilfedateien des Moduls (1:1 aus der Altform).
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const SECTION_IDS = ['overview', 'workflow', 'fields', 'interpretation', 'tips'];
const BASE = '../../../js/modules/makigami/resources/i18n/';

async function load(lang) {
  const res = await fetch(new URL(`${BASE}help.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`help.${lang}.json: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

/** Alle Begriffslinks `{{term:id|…}}` eines Abschnitts, in Reihenfolge. */
const terms = (section) => [...JSON.stringify(section).matchAll(/\{\{term:([^|}]+)/g)].map((m) => m[1]);

suite('makigami: Handbuch aus help.<lang>.json', () => {
  test('fünf Abschnitte mit DE- und EN-Inhalt, in derselben Reihenfolge', async () => {
    const de = await load('de');
    const en = await load('en');
    assertDeepEqual(Object.keys(de), ['sections']);
    assertDeepEqual(Object.keys(de.sections), SECTION_IDS);
    assertDeepEqual(Object.keys(en.sections), SECTION_IDS);
    const def = helpDefFromFiles('makigami', { de, en });
    assertEqual(def.moduleId, 'makigami');
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const localized = def.sections[id][lang];
        assertTrue(!!localized, `Abschnitt "${id}" hat keine "${lang}"-Fassung`);
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0, `${id} (${lang}) ohne Titel`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0, `${id} (${lang}) ohne Blöcke`);
      }
    }
  });
  test('deutsche Texte verwenden echte Umlaute', async () => {
    const de = await load('de');
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections)), 'Kein Unicode-Umlaut');
    assertTrue(terms(de.sections.overview).includes('makigami'), 'Begriffslink makigami');
  });
});
