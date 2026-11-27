/**
 * MSA Typ 6: Texte in resources/i18n/ui.<lang>.json und context-help.<lang>.json —
 * Oberflächentexte der Altform, je Fehlercode der Engine ein Text, Kontexthilfe
 * zu jedem Feld, jeder Ableitung und jedem Kommando; ohne die Aktionen der Altform.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/msa-typ6/domain/model.js';

const MOD = '../../../js/modules/msa-typ6/';
const LANGS = ['de', 'en'];
const ERROR_CODES = ['E_NO_VALUES', 'E_TOO_FEW_POINTS', 'E_INVALID_CHART_TYPE', 'E_SUBGROUP_MISMATCH',
  'E_UNEQUAL_SUBGROUP_SIZES', 'E_SUBGROUP_SIZE_OUT_OF_RANGE', 'E_GIVEN_LIMITS_INVALID', 'E_BASELINE_TOO_SMALL',
  'E_BASELINE_EXCEEDS_DATA', 'E_INVALID_ALPHA', 'E_INVALID_LIMITS_MODE'];

/** @param {string} path @returns {Promise<any>} */
async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const contextHelp = (lang) => fetchJson(`${MOD}resources/i18n/context-help.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('msa-typ6 Texte in ui.<lang>.json', () => {
  test('Name, Beschreibung, Einsatz, Platzhalter, je Fehlercode der Engine ein Text', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'empty', 'emptyHint', 'warningTitle']) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      assertTrue(nonEmpty(t.input.measurementNamePlaceholder), `${lang} input.measurementNamePlaceholder`);
      for (const c of ERROR_CODES) assertTrue(nonEmpty(t.errors[c]), `${lang} errors.${c}`);
      for (const k of ['actions', 'fields', 'types']) assertTrue(!Object.hasOwn(t, k), `${lang} ${k} entfällt`);
    }
  });
  test('μ überall als griechischer Buchstabe', async () => {
    for (const lang of LANGS) {
      const text = JSON.stringify(await ui(lang)) + JSON.stringify(await contextHelp(lang));
      assertTrue(!text.includes('µ'), `${lang}: Mikrozeichen`);
    }
  });
});

suite('msa-typ6 Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld, Ansichtsfeld und jede Ableitung hat einen Hilfetext', async () => {
    const s = State.schema;
    const names = [...Object.keys(s.fields), ...Object.keys(s.view), ...Object.keys(s.derived)];
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertDeepEqual(Object.keys(fields).sort(), [...names].sort(), lang);
      for (const n of names) assertTrue(nonEmpty(fields[n].help), `${lang} fields.${n}`);
    }
  });

  test('nur die neuen Kommandos, je mit Parametern und command; Typedefs Params und Columns', async () => {
    for (const lang of LANGS) {
      const ch = await contextHelp(lang);
      assertDeepEqual(Object.keys(ch.actions).sort(), ['adoptTyp1', 'toggleRule'], lang);
      assertDeepEqual(Object.keys(ch.actions.toggleRule.params).sort(), ['command', 'on', 'ruleId'], lang);
      assertDeepEqual(Object.keys(ch.actions.adoptTyp1.params).sort(), ['command', 'instanceId', 'mu0', 'sigma0'], lang);
      assertDeepEqual(Object.keys(ch.types.Params).sort(),
        ['alpha', 'baselineK', 'chartType', 'enabledRules', 'limitsMode', 'measurementName', 'mu0', 'sigma0', 'unit'], lang);
      assertDeepEqual(Object.keys(ch.types.Columns), ['timestamp', 'value', 'subgroup'], lang);
      assertTrue(nonEmpty(ch.types.Result.invalid), `${lang} Result.invalid`);
      assertDeepEqual(Object.keys(ch.types.Invalid), ['code', 'params'], lang);
    }
  });

  test('kein „null“ und kein „als Text“ in den Feldtexten', async () => {
    for (const lang of LANGS) {
      const text = JSON.stringify((await contextHelp(lang)).fields);
      assertTrue(!/\bnull\b/.test(text), `${lang}: null`);
      assertTrue(!/als Text|as text/.test(text), `${lang}: als Text`);
    }
  });
});
