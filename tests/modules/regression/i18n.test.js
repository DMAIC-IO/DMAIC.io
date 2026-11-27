/**
 * Regression: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — Oberflächentexte der Altform ohne die
 * Agentenblöcke, Kontexthilfe zu jedem Feld, jeder Ableitung, jedem Typ und
 * dem Kommando.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/regression/domain/model.js';

const MOD = '../../../js/modules/regression/';
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

suite('regression Texte in ui.<lang>.json', () => {
  test('Name, Beschreibung, Einsatz, Gründe und neue Texte; keine Agentenblöcke', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'errMinData', 'errInsufficientDf', 'errAliasedTerms', 'errGeneric',
        'errColumnMissing', 'defaultModelName', 'savedModelStatus', 'designNoticeAliased', 'designNoticeSaturated', 'modelSaved']) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      assertTrue(t.defaultModelName.includes('{y}'), `${lang} defaultModelName`);
      for (const k of ['actions', 'fields', 'types', 'help', 'errSelectBoth']) assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
    }
  });

  test('dieselben Schlüssel in de und en', async () => {
    assertDeepEqual(Object.keys(await ui('en')).sort(), Object.keys(await ui('de')).sort());
  });
});

suite('regression Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld, jede Ableitung und jedes computed der Ansicht hat einen Hilfetext', async () => {
    // `degrees` ist das computed des view-Blocks (Gate: fields.<computed>.help).
    const top = [...Object.keys(State.schema.fields), ...Object.keys(State.schema.view), ...Object.keys(State.schema.derived), 'degrees'];
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertDeepEqual(Object.keys(fields).sort(), [...top].sort(), lang);
      for (const f of top) assertTrue(nonEmpty(fields[f].help), `${lang} fields.${f}`);
    }
  });

  test('Kommando setTerm mit Parametern und command; Typen ohne Params', async () => {
    for (const lang of LANGS) {
      const { actions, types } = await contextHelp(lang);
      assertTrue(nonEmpty(actions.setTerm.help), lang);
      for (const p of ['term', 'included', 'command']) assertTrue(nonEmpty(actions.setTerm.params[p]), `${lang} ${p}`);
      assertTrue(!Object.hasOwn(types, 'Params'), lang);
      for (const t of ['Result', 'Coefficient', 'Anova', 'AnovaRow', 'FitError', 'PerXError', 'AliasedTerm', 'DesignNotice',
        'ImportChoice', 'Predictor', 'SavedModel']) assertTrue(!!types[t], `${lang} ${t}`);
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
