/**
 * Zielgrößenoptimierung: Handbuch aus den Hilfedateien des Moduls.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const BASE = '../../../js/modules/response-optimization/resources/';

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

suite('response-optimization: Handbuch aus help.<lang>.json', () => {
  test('der Abschnitt der Altform in de und en mit Titel und Blöcken', async () => {
    const de = await load('de');
    const en = await load('en');
    assertDeepEqual(Object.keys(de.sections), ['overview']);
    assertDeepEqual(Object.keys(en.sections), ['overview']);
    const def = helpDefFromFiles('response-optimization', { de, en });
    assertEqual(def.moduleId, 'response-optimization');
    for (const lang of ['de', 'en']) {
      const s = def.sections.overview[lang];
      assertTrue(typeof s.title === 'string' && s.title.length > 0 && s.blocks.length === 4, lang);
    }
  });

  test('kein Projektschlüssel mehr im Text, echte Umlaute', async () => {
    for (const lang of ['de', 'en']) assertTrue(!JSON.stringify(await load(lang)).includes('state.optimizations'), lang);
    assertTrue(/[äöüÄÖÜß]/.test(JSON.stringify((await load('de')).sections.overview)));
  });
});
