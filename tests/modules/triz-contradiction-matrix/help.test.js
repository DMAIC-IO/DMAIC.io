/**
 * Widerspruchsmatrix (TRIZ): Handbuch aus den Hilfedateien des Moduls.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const SECTION_IDS = ['overview', 'methodology', 'interpretation', 'references'];
const BASE = '../../../js/modules/triz-contradiction-matrix/resources/i18n/';

async function load(lang) {
  const res = await fetch(new URL(`${BASE}help.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`help.${lang}.json: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

/** Alle Begriffslinks `{{term:id|…}}` eines Abschnitts, in Reihenfolge. */
const terms = (section) => [...JSON.stringify(section).matchAll(/\{\{term:([^|}]+)/g)].map((m) => m[1]);

suite('Widerspruchsmatrix (TRIZ): Handbuch aus help.<lang>.json', () => {
  test('alle Abschnitte existieren mit DE- und EN-Inhalt, in derselben Reihenfolge', async () => {
    const de = await load('de');
    const en = await load('en');
    assertDeepEqual(Object.keys(de.sections), SECTION_IDS);
    assertDeepEqual(Object.keys(en.sections), SECTION_IDS);
    const def = helpDefFromFiles('triz-contradiction-matrix', { de, en });
    assertEqual(def.moduleId, 'triz-contradiction-matrix');
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const localized = def.sections[id][lang];
        assertTrue(!!localized, `Abschnitt "${id}" hat keine "${lang}"-Fassung`);
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0, `Abschnitt "${id}" (${lang}) hat keinen Titel`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0, `Abschnitt "${id}" (${lang}) hat keine Blöcke`);
      }
    }
  });

  test('die Literaturliste hat in beiden Sprachen vier Einträge', async () => {
    for (const lang of ['de', 'en']) {
      const { sections } = await load(lang);
      const [block] = sections.references.blocks;
      assertEqual(block.type, 'list');
      assertEqual(block.items.length, 4, lang);
    }
  });

  test('Begriffslinks sind je Abschnitt in DE und EN gleich', async () => {
    const de = await load('de');
    const en = await load('en');
    for (const id of SECTION_IDS) assertDeepEqual(terms(en.sections[id]), terms(de.sections[id]), id);
    assertDeepEqual(terms(de.sections.overview), ['triz', 'widerspruchsmatrix', 'technischer-widerspruch', 'erfinderische-prinzipien']);
    assertDeepEqual(terms(de.sections.methodology), ['substanz-feld-analyse']);
    assertDeepEqual(terms(de.sections.interpretation), ['physikalischer-widerspruch', 'separationsprinzipien', 'ifr']);
    assertDeepEqual(terms(de.sections.references), []);
  });

  test('deutsche Texte verwenden echte Umlaute, „z. B.“ und schließen Zitate typografisch', async () => {
    const de = await load('de');
    const all = JSON.stringify(de.sections);
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections.overview)), 'Kein Unicode-Umlaut im deutschen Überblick gefunden');
    assertTrue(!/„[^"“]*\\"/.test(all), 'Zitat mit „ öffnet und mit ASCII-Anführungszeichen schließt');
    assertTrue(!all.includes('z.B.'), '„z.B.“ ohne Leerzeichen');
  });
});
