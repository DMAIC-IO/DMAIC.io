/**
 * Taschenrechner: Handbuch aus den Hilfedateien des Moduls und Abgleich der
 * Kennwert-Texte mit den Kennwerten der Rechnung.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';
import { STAT_TYPES, SS_TYPES } from '../../../js/modules/calculator/domain/calc.js';

const SECTION_IDS = ['overview', 'methodology', 'pitfalls'];
const BASE = '../../../js/modules/calculator/resources/i18n/';

/** @param {string} path @returns {Promise<any>} */
async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** @param {string} lang */
async function load(lang) {
  const { $schema: _schema, ...file } = await fetchJson(`${BASE}help.${lang}.json`);
  return file;
}

suite('calculator: Handbuch aus help.<lang>.json', () => {
  test('drei Abschnitte mit DE- und EN-Inhalt, in derselben Reihenfolge', async () => {
    const de = await load('de');
    const en = await load('en');
    assertDeepEqual(Object.keys(de.sections), SECTION_IDS);
    assertDeepEqual(Object.keys(en.sections), SECTION_IDS);
    const def = helpDefFromFiles('calculator', { de, en });
    assertEqual(def.moduleId, 'calculator');
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const localized = def.sections[id][lang];
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0, `${id} ${lang} Titel`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0, `${id} ${lang} Blöcke`);
      }
    }
  });

  test('deutsche Texte mit echten Umlauten', async () => {
    const de = await load('de');
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections.overview)));
  });
});

suite('calculator: Kennwert-Texte gleich den Kennwerten', () => {
  test('types.StatKey und types.CapabilityKey tragen in de und en genau die Kennwerte', async () => {
    for (const lang of ['de', 'en']) {
      const { types } = await fetchJson(`${BASE}context-help.${lang}.json`);
      assertDeepEqual(Object.keys(types.StatKey), [...STAT_TYPES], `${lang} StatKey`);
      assertDeepEqual(Object.keys(types.CapabilityKey), [...SS_TYPES], `${lang} CapabilityKey`);
    }
  });
});
