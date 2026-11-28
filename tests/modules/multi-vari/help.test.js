/**
 * D.Mike — Multi-Vari: Handbuch aus den Hilfedateien des Moduls.
 *
 * Das Modul bringt sein Handbuch je Sprache mit
 * (`resources/i18n/help.<lang>.json`); geprüft wird die Form, die das
 * Hilfe-Panel nach `helpDefFromFiles` erwartet.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const SECTION_IDS = ['overview', 'methodology', 'pitfalls'];
const BASE = '../../../js/modules/multi-vari/resources/i18n/';

async function load(lang) {
  const res = await fetch(new URL(`${BASE}help.${lang}.json`, import.meta.url));
  if (!res.ok) throw new Error(`help.${lang}.json: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

suite('Multi-Vari: Handbuch aus help.<lang>.json', () => {
  test('alle drei Abschnitte existieren mit DE- und EN-Inhalt', async () => {
    const def = helpDefFromFiles('multi-vari', { de: await load('de'), en: await load('en') });
    assertEqual(def.moduleId, 'multi-vari');
    for (const id of SECTION_IDS) {
      const section = def.sections[id];
      assertTrue(!!section, `Abschnitt "${id}" fehlt`);
      for (const lang of ['de', 'en']) {
        const localized = section[lang];
        assertTrue(!!localized, `Abschnitt "${id}" hat keine "${lang}"-Fassung`);
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0,
          `Abschnitt "${id}" (${lang}) hat keinen Titel`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0,
          `Abschnitt "${id}" (${lang}) hat keine Blöcke`);
      }
    }
  });

  test('deutsche Texte verwenden echte Unicode-Umlaute', async () => {
    const de = await load('de');
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections.overview)),
      'Kein Unicode-Umlaut im deutschen Übersichtsabschnitt gefunden');
  });
});
