/**
 * Kano: Texte in resources/i18n/ui.<lang>.json — Rückfragen und Invarianten
 * des Models, Hinweis auf die Baum-Instanz, die 16 Texte, die
 * `survey-builder` kopiert, ohne die toten und die Agententexte der Altform.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/kano/domain/model.js';

const MOD = '../../../js/modules/kano/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('kano Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante des Models, in DE und EN', async () => {
    const names = Object.keys(State.schema.invariants);
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), names, lang);
      for (const n of names) assertTrue(nonEmpty(invariants[n]), `${lang} invariants.${n}`);
    }
  });
  test('Rückfragen, Hinweis, Name und die von survey-builder kopierten Texte', async () => {
    const copied = ['scale1', 'scale2', 'scale3', 'scale4', 'scale5', 'scaleEmpty', 'importanceLow', 'importanceHigh',
      'catM', 'catO', 'catA', 'catI', 'catR', 'catQ', 'chartX', 'chartY'];
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'respondentDefault', ...copied]) assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      for (const k of ['setSourceLevel', 'removeRespondent', 'overwriteTree']) assertTrue(nonEmpty(t.confirm[k]), `${lang} confirm.${k}`);
      assertTrue(nonEmpty(t.sourceHint.unknownTree), `${lang} sourceHint.unknownTree`);
    }
  });
  test('ohne die toten Schlüssel der Altform und ohne die Agententexte', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['respondentsTitle', 'exportCsv', 'exportXlsx', 'exportPng', 'exportSvg', 'levelChangeConfirm',
        'respondentDeleteConfirm', 'actions', 'fields', 'types']) {
        assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
      }
    }
  });
  test('DE und EN haben dieselben Schlüssel', async () => {
    const de = await ui('de');
    const en = await ui('en');
    assertDeepEqual(Object.keys(en), Object.keys(de));
  });
});
