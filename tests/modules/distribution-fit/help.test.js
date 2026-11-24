/**
 * Verteilungstest: Handbuch aus den Hilfedateien des Moduls.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const SECTION_IDS = ['methodology', 'example', 'interpretation', 'pitfalls'];
const BASE = '../../../js/modules/distribution-fit/resources/i18n/';

async function load(lang) {
  const res = await fetch(new URL(`${BASE}help.${lang}.json`, import.meta.url));
  if (!res.ok) throw new Error(`help.${lang}.json: HTTP ${res.status}`);
  const { $schema, ...file } = await res.json();
  return file;
}

suite('Verteilungstest: Handbuch aus help.<lang>.json', () => {
  test('alle Abschnitte existieren mit DE- und EN-Inhalt', async () => {
    const def = helpDefFromFiles('distribution-fit', { de: await load('de'), en: await load('en') });
    assertEqual(def.moduleId, 'distribution-fit');
    for (const id of SECTION_IDS) {
      const section = def.sections[id];
      assertTrue(!!section, `Abschnitt "${id}" fehlt`);
      for (const lang of ['de', 'en']) {
        const localized = section[lang];
        assertTrue(!!localized, `Abschnitt "${id}" hat keine "${lang}"-Fassung`);
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0, `Abschnitt "${id}" (${lang}) hat keinen Titel`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0, `Abschnitt "${id}" (${lang}) hat keine Blöcke`);
      }
    }
  });

  test('deutsche Texte verwenden echte Unicode-Umlaute', async () => {
    const de = await load('de');
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections.methodology)), 'Kein Unicode-Umlaut im deutschen Methodikabschnitt gefunden');
  });
});
