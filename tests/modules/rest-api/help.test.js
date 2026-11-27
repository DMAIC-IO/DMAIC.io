/**
 * REST API: Handbuch aus den Hilfedateien des Moduls — Abschnitte der
 * Altform, berichtigt: Zuordnungen und Schreibmodus „gespeichert, aber noch
 * nicht angewendet“, kein Duplizieren, keine Intervalle unter einer Minute,
 * ein Abruf zur Zeit, Abbrechen, nur der eigene Ursprung.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { helpDefFromFiles } from '../../../js/core/module-help-files.js';

const SECTION_IDS = ['overview', 'methodology', 'pitfalls'];
const BASE = '../../../js/modules/rest-api/resources/i18n/';

async function load(lang) {
  const res = await fetch(new URL(`${BASE}help.${lang}.json`, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`help.${lang}.json: HTTP ${res.status}`);
  const { $schema: _schema, ...file } = await res.json();
  return file;
}

suite('rest-api: Handbuch aus help.<lang>.json', () => {
  test('drei Abschnitte mit DE- und EN-Inhalt, in derselben Reihenfolge', async () => {
    const de = await load('de');
    const en = await load('en');
    assertDeepEqual(Object.keys(de), ['sections']);
    assertDeepEqual(Object.keys(de.sections), SECTION_IDS);
    assertDeepEqual(Object.keys(en.sections), SECTION_IDS);
    const def = helpDefFromFiles('rest-api', { de, en });
    assertEqual(def.moduleId, 'rest-api');
    for (const id of SECTION_IDS) {
      for (const lang of ['de', 'en']) {
        const localized = def.sections[id][lang];
        assertTrue(typeof localized.title === 'string' && localized.title.length > 0, `${id} (${lang}) ohne Titel`);
        assertTrue(Array.isArray(localized.blocks) && localized.blocks.length > 0, `${id} (${lang}) ohne Blöcke`);
      }
    }
  });
  test('berichtigt: nichts wird ins Arbeitsblatt geschrieben, kein Duplizieren, keine Sekundenintervalle', async () => {
    const de = JSON.stringify((await load('de')).sections);
    const en = JSON.stringify((await load('en')).sections);
    assertTrue(/[äöüÄÖÜß]/.test(de), 'Kein Unicode-Umlaut');
    assertTrue(de.includes('noch nicht angewendet'), 'de: noch nicht angewendet');
    assertTrue(en.includes('not applied yet'), 'en: not applied yet');
    for (const bad of ['duplizieren', 'unter einer Minute', 'Beim Abruf werden die Werte', 'Play-Button', 'in das Arbeitsblatt zu schreiben']) {
      assertTrue(!de.includes(bad), `de enthält noch „${bad}“`);
    }
    for (const bad of ['duplicated', 'below one minute', 'On every fetch, values are written', 'play button']) {
      assertTrue(!en.includes(bad), `en enthält noch „${bad}“`);
    }
    assertTrue(de.includes('Abbrechen') && en.includes('Cancel'), 'Abbrechen');
    assertTrue(de.includes('eigenen Ursprung') && en.includes('own origin'), 'eigener Ursprung');
    assertTrue(de.includes('nur ein Abruf zur Zeit') && en.includes('one fetch runs at a time'), 'ein Abruf zur Zeit');
  });
});
