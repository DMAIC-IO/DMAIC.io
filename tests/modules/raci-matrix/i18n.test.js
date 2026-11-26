/**
 * RACI-Matrix: Texte in resources/i18n/ui.<lang>.json — Invarianten des
 * Models, Rollen und Befunde der Prüfung in beiden Sprachen, Etikett der
 * Kachel-Einstellung als Kopie des globalen Texts.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State, ROLES } from '../../../js/modules/raci-matrix/domain/model.js';

const MOD = '../../../js/modules/raci-matrix/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('raci-matrix Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante des Models, in DE und EN', async () => {
    const names = Object.keys(State.schema.invariants);
    assertDeepEqual(names, ['activityIds', 'stakeholderIds', 'knownCells']);
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), names, lang);
      for (const n of names) assertTrue(nonEmpty(invariants[n]), `${lang} invariants.${n}`);
    }
  });

  test('die Kennungsregeln nennen den Doppelpunkt', async () => {
    const { invariants: de } = await ui('de');
    const { invariants: en } = await ui('en');
    for (const n of ['activityIds', 'stakeholderIds']) {
      assertTrue(de[n].includes('Doppelpunkt'), `de ${n}`);
      assertTrue(en[n].includes('colon'), `en ${n}`);
    }
  });

  test('ein Text je Rolle und je Befund der Prüfung, in DE und EN', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const r of ROLES) assertTrue(nonEmpty(t[`role${r}`]), `${lang} role${r}`);
      for (const code of ['noR', 'noA', 'multiA']) assertTrue(nonEmpty(t[`warn_${code}`]), `${lang} warn_${code}`);
    }
  });

  test('das Etikett von topN ist die Kopie von dashboard.tileSettings.topWarnings', async () => {
    const copies = await fetchJson(`${MOD}resources/i18n/copies.json`);
    assertDeepEqual(copies, { 'tile.settings.topN.label': 'dashboard.tileSettings.topWarnings' });
    for (const lang of LANGS) {
      const own = await ui(lang);
      const global = await fetchJson(`../../../i18n/${lang}.json`);
      assertEqual(own.tile.settings.topN.label, global.dashboard.tileSettings.topWarnings, lang);
    }
  });

  test('ohne die toten Schlüssel der Altform und ohne die Agententexte', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['emptyHint', 'reset', 'resetConfirm', 'resetDone', 'exportCSV', 'exportedCSV', 'actions', 'fields']) {
        assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
      }
    }
  });
});
