/**
 * Datentransformation: Handbuch aus den Hilfedateien des Moduls.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const SECTION_IDS = ['overview', 'whenToUse', 'whenNotToUse', 'methodology', 'workflow', 'pitfalls'];
const BASE = '../../../js/modules/data-transformation/resources/i18n/';

async function load(lang) {
  const res = await fetch(new URL(`${BASE}help.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`help.${lang}.json: HTTP ${res.status}`);
  const { $schema, ...file } = await res.json();
  return file;
}

suite('data-transformation: Handbuch aus help.<lang>.json', () => {
  test('sechs Abschnitte mit DE- und EN-Inhalt, in derselben Reihenfolge', async () => {
    const de = await load('de');
    const en = await load('en');
    assertDeepEqual(Object.keys(de.sections), SECTION_IDS);
    assertDeepEqual(Object.keys(en.sections), SECTION_IDS);
    const def = helpDefFromFiles('data-transformation', { de, en });
    assertEqual(def.moduleId, 'data-transformation');
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const localized = def.sections[id][lang];
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0, `${id} ${lang} Titel`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0, `${id} ${lang} Blöcke`);
      }
    }
  });

  test('deutsche Texte schließen Zitate typografisch', async () => {
    const all = JSON.stringify((await load('de')).sections);
    assertTrue(!all.includes('\\"'), 'ASCII-Anführungszeichen im deutschen Handbuch');
    assertEqual((all.match(/„[^“]*“/g) ?? []).length, 4, 'typografische Zitate');
  });

  test('λ leer heißt geschätzt; Box-Cox rechnet bei Werten ≤ 0 mit Yeo-Johnson', async () => {
    const de = JSON.stringify((await load('de')).sections);
    const en = JSON.stringify((await load('en')).sections);
    assertTrue(de.includes('das Feld λ leer lassen') && en.includes('leave the λ field empty'));
    assertTrue(de.includes('Box-Cox rechnet dann mit Yeo-Johnson') && en.includes('Box-Cox then calculates with Yeo-Johnson'));
  });
});
