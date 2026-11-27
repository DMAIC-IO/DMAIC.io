/**
 * MSA Typ 4: Handbuch aus den Moduldateien — gleich der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const SECTION_IDS = ['goal', 'data', 'formulas', 'verdict'];
const BASE = '../../../js/modules/msa-typ4/resources/';

async function loadJson(rel) {
  const res = await fetch(new URL(`${BASE}${rel}`, import.meta.url));
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

suite('MSA Typ 4: Handbuch aus help.<lang>.json', () => {
  test('Abschnitte mit DE- und EN-Inhalt', async () => {
    const def = helpDefFromFiles('msa-typ4', {
      de: await loadJson('i18n/help.de.json'),
      en: await loadJson('i18n/help.en.json'),
    });
    assertEqual(def.moduleId, 'msa-typ4');
    assertDeepEqual(Object.keys(def.sections), SECTION_IDS);
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const s = def.sections[id][lang];
        assertTrue(typeof s.title === 'string' && s.title.length > 0, `${id} ${lang} Titel`);
        assertTrue(Array.isArray(s.blocks) && s.blocks.length > 0, `${id} ${lang} Blöcke`);
      }
    }
  });

  test('deutsche Texte mit echten Umlauten; ohne Literaturverweise (die Altform hatte keine)', async () => {
    const de = await loadJson('i18n/help.de.json');
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify(de.sections.goal)), 'Umlaut im Ziel');
    for (const lang of ['de', 'en']) {
      const text = JSON.stringify(await loadJson(`i18n/help.${lang}.json`));
      assertTrue(!/\{\{ref:/.test(text), `${lang}: {{ref:…}} ohne references.json`);
    }
  });
});
