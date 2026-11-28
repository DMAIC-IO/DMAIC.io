/**
 * C&E-Matrix: Handbuch aus den Hilfedateien des Moduls.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const SECTION_IDS = ['overview', 'methodology', 'interpretation', 'pitfalls'];
const BASE = '../../../js/modules/ce-matrix/resources/i18n/';

async function load(lang) {
  const res = await fetch(new URL(`${BASE}help.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`help.${lang}.json: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

/** Alle Begriffslinks `{{term:id|…}}` eines Abschnitts, in Reihenfolge. */
const terms = (section) => [...JSON.stringify(section).matchAll(/\{\{term:([^|}]+)/g)].map((m) => m[1]);

suite('ce-matrix: Handbuch aus help.<lang>.json', () => {
  test('vier Abschnitte mit DE- und EN-Inhalt, in derselben Reihenfolge, ohne Literatur und Querverweise', async () => {
    const de = await load('de');
    const en = await load('en');
    assertDeepEqual(Object.keys(de), ['sections']);
    assertDeepEqual(Object.keys(de.sections), SECTION_IDS);
    assertDeepEqual(Object.keys(en.sections), SECTION_IDS);
    const def = helpDefFromFiles('ce-matrix', { de, en });
    assertEqual(def.moduleId, 'ce-matrix');
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const localized = def.sections[id][lang];
        assertTrue(!!localized, `Abschnitt "${id}" hat keine "${lang}"-Fassung`);
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0, `Abschnitt "${id}" (${lang}) hat keinen Titel`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0, `Abschnitt "${id}" (${lang}) hat keine Blöcke`);
      }
    }
  });

  test('Begriffslinks sind je Abschnitt in DE und EN gleich', async () => {
    const de = await load('de');
    const en = await load('en');
    for (const id of SECTION_IDS) assertDeepEqual(terms(en.sections[id]), terms(de.sections[id]), id);
    assertDeepEqual(terms(de.sections.overview), ['ce-matrix', 'fmea', 'regression', 'durchlaufzeit', 'ishikawa', 'pareto']);
    assertDeepEqual(terms(de.sections.interpretation), ['korrelation']);
  });

  test('deutsche Texte verwenden echte Umlaute und keine ASCII-Anführungszeichen', async () => {
    const de = await load('de');
    const all = JSON.stringify(de.sections);
    assertTrue(/[äöüÄÖÜß]/.test(all), 'Kein Unicode-Umlaut');
    assertTrue(!all.includes('\\"'), 'ASCII-Anführungszeichen im deutschen Handbuch');
    assertTrue(!all.includes('z.B.'), '„z.B.“ ohne Leerzeichen');
  });
});
