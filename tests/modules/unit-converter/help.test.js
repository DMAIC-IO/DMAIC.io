/**
 * Einheitenumrechner: Handbuch aus den Hilfedateien des Moduls.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const SECTION_IDS = ['overview', 'pitfalls'];
const BASE = '../../../js/modules/unit-converter/resources/i18n/';

async function load(lang) {
  const res = await fetch(new URL(`${BASE}help.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`help.${lang}.json: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

suite('unit-converter: Handbuch aus help.<lang>.json', () => {
  test('zwei Abschnitte mit DE- und EN-Inhalt, in derselben Reihenfolge', async () => {
    const de = await load('de');
    const en = await load('en');
    assertDeepEqual(Object.keys(de.sections), SECTION_IDS);
    assertDeepEqual(Object.keys(en.sections), SECTION_IDS);
    const def = helpDefFromFiles('unit-converter', { de, en });
    assertEqual(def.moduleId, 'unit-converter');
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const localized = def.sections[id][lang];
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0, `${id} (${lang}) Titel`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0, `${id} (${lang}) Blöcke`);
      }
    }
  });

  test('deutsche Texte verwenden echte Umlaute, keine ASCII-Anführungszeichen', async () => {
    const de = await load('de');
    const all = JSON.stringify(de.sections);
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections.overview)));
    assertTrue(!all.includes('\\"'));
  });
});
