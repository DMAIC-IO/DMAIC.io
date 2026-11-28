/**
 * Regelkarte: Handbuch aus den Hilfedateien des Moduls.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';
import { SPC_CONSTANTS } from '../../../js/engines/control-chart-engine.js';

const SECTION_IDS = ['overview', 'chartTypes', 'constants', 'stages', 'phase1and2', 'methodology', 'interpretation', 'capability', 'pitfalls'];
const BASE = '../../../js/modules/control-chart/resources/i18n/';
const CONSTANT_KEYS = ['d2', 'D3', 'D4', 'A2', 'c4', 'A3', 'B3', 'B4'];

async function load(lang) {
  const res = await fetch(new URL(`${BASE}help.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`help.${lang}.json: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

/** Die Begriffslinks eines Handbuchs, in Reihenfolge. */
const termIds = (file) => [...JSON.stringify(file).matchAll(/\{\{term:([a-z0-9-]+)/g)].map((m) => m[1]);

suite('Regelkarte: Handbuch aus help.<lang>.json', () => {
  test('alle Abschnitte existieren mit DE- und EN-Inhalt, in derselben Reihenfolge', async () => {
    const de = await load('de');
    const en = await load('en');
    assertDeepEqual(Object.keys(de.sections), SECTION_IDS);
    assertDeepEqual(Object.keys(en.sections), SECTION_IDS);
    const def = helpDefFromFiles('control-chart', { de, en });
    assertEqual(def.moduleId, 'control-chart');
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const localized = def.sections[id][lang];
        assertTrue(!!localized, `Abschnitt "${id}" hat keine "${lang}"-Fassung`);
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0, `Abschnitt "${id}" (${lang}) hat keinen Titel`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0, `Abschnitt "${id}" (${lang}) hat keine Blöcke`);
      }
    }
  });

  test('deutsche Texte verwenden echte Unicode-Umlaute', async () => {
    const de = await load('de');
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections.overview)), 'Kein Unicode-Umlaut im deutschen Überblick gefunden');
  });

  test('Begriffslinks sind in DE und EN dieselben', async () => {
    assertDeepEqual(termIds(await load('en')), termIds(await load('de')));
  });

  test('die Tabelle der Konstanten entspricht der Engine, mit Dezimalkomma in DE', async () => {
    for (const lang of ['de', 'en']) {
      const file = await load(lang);
      const table = file.sections.constants.blocks.find((b) => b.type === 'table');
      assertTrue(!!table, `keine Tabelle der Konstanten (${lang})`);
      assertEqual(table.rows.length, 9);
      for (const row of table.rows) {
        const n = Number(row[0]);
        CONSTANT_KEYS.forEach((k, i) => {
          const cell = row[i + 1];
          assertTrue(lang === 'de' ? !cell.includes('.') : !cell.includes(','), `${lang}: Trennzeichen in ${k}(${n}) = ${cell}`);
          assertEqual(Number(cell.replace(',', '.')), SPC_CONSTANTS[k][n], `${lang}: ${k}(${n})`);
        });
      }
    }
  });
});
