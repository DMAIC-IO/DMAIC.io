/**
 * MSA Typ 1: Handbuch und Referenzen aus den Moduldateien — gleich der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const SECTION_IDS = ['overview', 'methodology', 'pitfalls'];
const BASE = '../../../js/modules/msa-typ1/resources/';

async function loadJson(rel) {
  const res = await fetch(new URL(`${BASE}${rel}`, import.meta.url));
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

suite('MSA Typ 1: Handbuch aus help.<lang>.json', () => {
  test('Abschnitte mit DE- und EN-Inhalt', async () => {
    const def = helpDefFromFiles('msa-typ1', {
      de: await loadJson('i18n/help.de.json'),
      en: await loadJson('i18n/help.en.json'),
    });
    assertEqual(def.moduleId, 'msa-typ1');
    assertDeepEqual(Object.keys(def.sections), SECTION_IDS);
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const s = def.sections[id][lang];
        assertTrue(typeof s.title === 'string' && s.title.length > 0, `${id} ${lang} Titel`);
        assertTrue(Array.isArray(s.blocks) && s.blocks.length > 0, `${id} ${lang} Blöcke`);
      }
    }
  });

  test('deutsche Texte mit echten Umlauten', async () => {
    const de = await loadJson('i18n/help.de.json');
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections.overview)), 'Umlaut im Überblick');
  });

  test('jede {{ref:id}} steht in den Referenzen', async () => {
    const { references } = await loadJson('data/references.json');
    const known = new Set(references.map((r) => r.id ?? r.book));
    assertDeepEqual([...known], ['aiag-msa-4', 'bosch-heft-10', 'melzer-2019', 'vda-5', 'iso-22514-7']);
    for (const lang of ['de', 'en']) {
      const text = JSON.stringify(await loadJson(`i18n/help.${lang}.json`));
      for (const m of text.matchAll(/\{\{ref:([^}|]+)/g)) {
        assertTrue(known.has(m[1]), `{{ref:${m[1]}}} (${lang}) fehlt in references.json`);
      }
    }
  });
});
