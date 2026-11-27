/**
 * D.Mike — MSA Typ 2: Handbuch und Referenzen aus den Moduldateien.
 *
 * Das Modul bringt sein Handbuch je Sprache mit
 * (`resources/i18n/help.<lang>.json`) und seine Literatur in
 * `resources/data/references.json`; geprüft wird die Form, die das
 * Hilfe-Panel nach `helpDefFromFiles` erwartet, und dass jede
 * `{{ref:id}}` in den Referenzen steht.
 */
import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';
import { AIAG_MSA_4, MELZER_2019 } from '../../../js/core/references-books.js';

const SECTION_IDS = ['overview', 'typ3', 'methodology', 'pitfalls'];
const BASE = '../../../js/modules/msa-typ2/resources/';

async function loadJson(rel) {
  const res = await fetch(new URL(`${BASE}${rel}`, import.meta.url));
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

suite('MSA Typ 2: Handbuch aus help.<lang>.json', () => {
  test('alle vier Abschnitte existieren mit DE- und EN-Inhalt', async () => {
    const def = helpDefFromFiles('msa-typ2', {
      de: await loadJson('i18n/help.de.json'),
      en: await loadJson('i18n/help.en.json'),
    });
    assertEqual(def.moduleId, 'msa-typ2');
    assertEqual(Object.keys(def.sections).join(','), SECTION_IDS.join(','));
    for (const id of SECTION_IDS) {
      const section = def.sections[id];
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
    const de = await loadJson('i18n/help.de.json');
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections.overview)),
      'Kein Unicode-Umlaut im deutschen Übersichtsabschnitt gefunden');
  });

  test('jede {{ref:id}} steht in den Referenzen, jede Referenz ist ein bekanntes Buch', async () => {
    const { references } = await loadJson('data/references.json');
    const known = new Set(references.map((r) => r.id ?? r.book));
    assertEqual([...known].sort().join(','), [AIAG_MSA_4.id, MELZER_2019.id].sort().join(','));
    for (const lang of ['de', 'en']) {
      const text = JSON.stringify(await loadJson(`i18n/help.${lang}.json`));
      for (const m of text.matchAll(/\{\{ref:([^}|]+)/g)) {
        assertTrue(known.has(m[1]), `{{ref:${m[1]}}} (${lang}) fehlt in references.json`);
      }
    }
  });
});
