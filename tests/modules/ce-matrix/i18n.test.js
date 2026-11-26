/**
 * C&E-Matrix: Texte in resources/i18n/ui.<lang>.json — Invarianten des
 * Models, Hinweise beim Entfernen, Skalen, ohne die toten Schlüssel der
 * Altform und ohne Agententexte.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/ce-matrix/domain/model.js';
import { SCALE_IDS } from '../../../js/modules/ce-matrix/domain/matrix.js';

const MOD = '../../../js/modules/ce-matrix/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('ce-matrix Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante des Models, in DE und EN', async () => {
    const names = Object.keys(State.schema.invariants);
    assertDeepEqual(names, ['inputIds', 'outputIds', 'knownCells']);
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), names, lang);
      for (const n of names) assertTrue(nonEmpty(invariants[n]), `${lang} invariants.${n}`);
    }
  });
  test('die Kennungsregeln nennen den Doppelpunkt', async () => {
    const { invariants: de } = await ui('de');
    const { invariants: en } = await ui('en');
    for (const n of ['inputIds', 'outputIds']) {
      assertTrue(de[n].includes('Doppelpunkt'), `de ${n}`);
      assertTrue(en[n].includes('colon'), `en ${n}`);
    }
  });
  test('Hinweise lastInput/lastOutput und je Skala eine Beschriftung, in DE und EN', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['lastInput', 'lastOutput', 'scoreRejected', 'scoreAllowed', 'offScale', 'paretoTitle', 'paretoYLabel']) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      for (const id of SCALE_IDS) assertTrue(nonEmpty(t[`scale_${id}`]), `${lang} scale_${id}`);
    }
  });
  test('ohne die toten Schlüssel der Altform und ohne die Agententexte', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['reset', 'resetConfirm', 'resetDone', 'exportCSV', 'exportedCSV', 'actions', 'fields', 'types']) {
        assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
      }
    }
  });
  test('DE und EN haben dieselben Schlüssel', async () => {
    assertDeepEqual(Object.keys(await ui('en')), Object.keys(await ui('de')));
  });
});
