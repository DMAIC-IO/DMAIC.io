/**
 * Korrelation: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — Oberflächentexte der Altform ohne tote
 * Schlüssel, Kontexthilfe zu jedem Feld, jeder Ableitung und jedem Typ.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/correlation/domain/model.js';

const MOD = '../../../js/modules/correlation/';
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

suite('correlation Texte in ui.<lang>.json', () => {
  test('Name, Beschreibung, Einsatz, Gründe, Invariante; keine toten Schlüssel', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'errMin4', 'errZeroVariance', 'errColumnMissing',
        'noWorksheet', 'noNumericColumns', 'recNormal', 'recLowMono', 'interpVeryWeak', 'dataPoints', 'regressionLine']) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      assertTrue(nonEmpty(t.invariants.uniqueColumnRefs), `${lang} invariants`);
      for (const k of ['actions', 'fields', 'types', 'sectionCompare', 'placeholderText', 'errGeneric', 'kendallHint']) {
        assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
      }
    }
  });

  test('dieselben Schlüssel in de und en', async () => {
    assertDeepEqual(Object.keys(await ui('en')).sort(), Object.keys(await ui('de')).sort());
  });
});

suite('correlation Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld und jede Ableitung hat einen Hilfetext', async () => {
    const top = [...Object.keys(State.schema.fields), ...Object.keys(State.schema.view),
      'activeParams', 'activeMultiSlots', 'mode', 'result', 'matrixResult', 'error', 'pairs'];
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertDeepEqual(Object.keys(fields).sort(), [...top].sort(), lang);
      for (const f of top) assertTrue(nonEmpty(fields[f].help), `${lang} fields.${f}`);
    }
  });

  test('Typen ohne Params und ohne Rohdaten; CorrError beschrieben', async () => {
    for (const lang of LANGS) {
      const { types } = await contextHelp(lang);
      assertTrue(!Object.hasOwn(types, 'Params'), lang);
      assertTrue(!Object.hasOwn(types.PairResult, '_x') && !Object.hasOwn(types.PairResult, '_y'), lang);
      assertTrue(!Object.hasOwn(types.MatrixResult, 'pairs'), lang);
      for (const k of ['reason', 'n', 'message']) assertTrue(nonEmpty(types.CorrError[k]), `${lang} CorrError.${k}`);
      for (const t of ['PairResult', 'LinearStat', 'KendallStat', 'Descriptive', 'Diagnostics', 'Normality',
        'Recommendation', 'Reason', 'MethodScores', 'MatrixResult', 'MatrixByMethod', 'MatrixPair']) assertTrue(!!types[t], `${lang} ${t}`);
    }
  });

  test('kein „null“ und kein Verweis auf keys in den Feldtexten', async () => {
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      const all = JSON.stringify(fields);
      assertTrue(!/\bnull\b/.test(all), lang);
      assertTrue(!/\bkeys\b/.test(all), lang);
    }
  });
});
