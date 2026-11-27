/**
 * GLM-Regression: Handbuch aus den Hilfedateien des Moduls.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const BASE = '../../../js/modules/glm-regression/resources/';

/** @param {string} path @returns {Promise<any>} */
async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/** @param {string} lang */
async function load(lang) {
  const { $schema: _schema, ...file } = await fetchJson(`${BASE}i18n/help.${lang}.json`);
  return file;
}

suite('glm-regression: Handbuch aus help.<lang>.json', () => {
  test('die fünf Abschnitte der Altform in de und en, je mit Titel und Blöcken', async () => {
    const de = await load('de');
    const en = await load('en');
    const ids = Object.keys(de.sections);
    assertDeepEqual(ids, ['overview', 'interpretation', 'advanced', 'example', 'pitfalls']);
    assertDeepEqual(Object.keys(en.sections), ids);
    const def = helpDefFromFiles('glm-regression', { de, en });
    assertEqual(def.moduleId, 'glm-regression');
    for (const id of ids) {
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
