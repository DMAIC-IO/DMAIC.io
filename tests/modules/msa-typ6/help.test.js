/**
 * MSA Typ 6: Handbuch und Referenzen aus den Moduldateien — gleich der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const SECTION_IDS = ['goal', 'prerequisites', 'parameters', 'verdict', 'interpretation', 'examples'];
const BASE = '../../../js/modules/msa-typ6/resources/';

async function loadJson(rel) {
  const res = await fetch(new URL(`${BASE}${rel}`, import.meta.url));
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  const { $schema, ...file } = await res.json();
  return file;
}

suite('MSA Typ 6: Handbuch aus help.<lang>.json', () => {
  test('Abschnitte mit DE- und EN-Inhalt', async () => {
    const def = helpDefFromFiles('msa-typ6', {
      de: await loadJson('i18n/help.de.json'),
      en: await loadJson('i18n/help.en.json'),
    });
    assertEqual(def.moduleId, 'msa-typ6');
    assertDeepEqual(Object.keys(def.sections), SECTION_IDS);
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const s = def.sections[id][lang];
        assertTrue(typeof s.title === 'string' && s.title.length > 0, `${id} ${lang} Titel`);
        assertTrue(Array.isArray(s.blocks) && s.blocks.length > 0, `${id} ${lang} Blöcke`);
      }
    }
  });

  test('deutsche Texte mit echten Umlauten, μ als griechischer Buchstabe', async () => {
    for (const lang of ['de', 'en']) {
      const text = JSON.stringify(await loadJson(`i18n/help.${lang}.json`));
      assertTrue(!text.includes('µ'), `${lang}: Mikrozeichen statt μ`);
    }
    const de = await loadJson('i18n/help.de.json');
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections.goal)), 'Umlaut im Ziel');
  });

  test('jede {{ref:id}} steht in den Referenzen', async () => {
    const { references } = await loadJson('data/references.json');
    const known = new Set(references.map((r) => r.id ?? r.book));
    assertDeepEqual([...known], ['aiag-msa-4', 'montgomery-sqc-6', 'nelson-1984']);
    for (const lang of ['de', 'en']) {
      const text = JSON.stringify(await loadJson(`i18n/help.${lang}.json`));
      for (const m of text.matchAll(/\{\{ref:([^}|]+)/g)) {
        assertTrue(known.has(m[1]), `{{ref:${m[1]}}} (${lang}) fehlt in references.json`);
      }
    }
  });
});
