/**
 * MSA Typ 1: Texte in resources/i18n/ui.<lang>.json und context-help.<lang>.json —
 * Oberflächentexte der Altform ohne tote Schlüssel, Kontexthilfe zu jedem Feld,
 * jeder Ableitung und jedem Typedef-Schlüssel; ohne die Aktionen der Altform.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/msa-typ1/domain/model.js';

const MOD = '../../../js/modules/msa-typ1/';
const LANGS = ['de', 'en'];

/** @param {string} path @returns {Promise<any>} */
async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const contextHelp = (lang) => fetchJson(`${MOD}resources/i18n/context-help.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('msa-typ1 Texte in ui.<lang>.json', () => {
  test('Name, Beschreibung, Einsatz, Fehlerschlüssel der Engine, Diagrammtexte, Invariante', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'errRefMissing', 'errLimitsMissing', 'errUslLeqLsl',
        'errTooFewValues', 'chartRefLabel', 'chartZoneLabel', 'chartValues', 'chartOutliers', 'chartIndex']) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      assertTrue(nonEmpty(t.invariants?.limitsOrder), `${lang} invariants.limitsOrder`);
      for (const k of ['actions', 'fields', 'types', 'errNoColumnSelected', 'rawDataTitle', 'tolUsage']) {
        assertTrue(!Object.hasOwn(t, k), `${lang} ${k} entfällt`);
      }
    }
  });
});

suite('msa-typ1 Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld, Ansichtsfeld und jede Ableitung hat einen Hilfetext', async () => {
    const s = State.schema;
    const names = [...Object.keys(s.fields), ...Object.keys(s.view), ...Object.keys(s.derived)];
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertDeepEqual(Object.keys(fields).sort(), [...names].sort(), lang);
      for (const n of names) assertTrue(nonEmpty(fields[n].help), `${lang} fields.${n}`);
    }
  });

  test('keine Aktionen der Altform; Params, Result.invalid und ColumnStats beschrieben', async () => {
    for (const lang of LANGS) {
      const ch = await contextHelp(lang);
      assertTrue(!Object.hasOwn(ch, 'actions'), `${lang} actions`);
      assertDeepEqual(Object.keys(ch.types.Params).sort(), ['k1', 'k2', 'lsl', 'name', 'ref', 'unit', 'usl'], lang);
      assertTrue(nonEmpty(ch.types.Result.invalid), `${lang} Result.invalid`);
      assertDeepEqual(Object.keys(ch.types.ColumnStats), ['n', 'mean', 'stdDev'], lang);
    }
  });

  test('kein „null“ und kein „Werte als Text“ in den Feldtexten', async () => {
    for (const lang of LANGS) {
      const text = JSON.stringify((await contextHelp(lang)).fields);
      assertTrue(!/\bnull\b/.test(text), `${lang}: null`);
      assertTrue(!/als Text|as text/.test(text), `${lang}: als Text`);
    }
  });
});
