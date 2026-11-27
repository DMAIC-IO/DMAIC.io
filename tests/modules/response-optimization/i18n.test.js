/**
 * Zielgrößenoptimierung: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — Oberflächentexte der Altform ohne die
 * Agentenblöcke, Kontexthilfe zu jedem Feld, jeder Ableitung, jedem Typ, dem
 * Kommando und dem Lauf.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/response-optimization/domain/model.js';

const MOD = '../../../js/modules/response-optimization/';
const LANGS = ['de', 'en'];

/** @param {string} path @returns {Promise<any>} */
async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (/** @type {string} */ lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const contextHelp = (/** @type {string} */ lang) => fetchJson(`${MOD}resources/i18n/context-help.${lang}.json`);
const nonEmpty = (/** @type {unknown} */ v) => typeof v === 'string' && v.trim().length > 0;

/** Die computed des view-Blocks (Gate: fields.<computed>.help). */
export const VIEW_COMPUTED = ['contour'];

suite('response-optimization Texte in ui.<lang>.json', () => {
  test('Name, Beschreibung, Einsatz, Gründe und neue Texte; keine Agentenblöcke', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'noModelSelected', 'emptyState', 'lowR2', 'lackOfFit', 'factorMismatch',
        'optimizeSuccess', 'optimizeFailed', 'resultStale', 'missingModels', 'modelsLoading', 'specRejected']) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      assertTrue(nonEmpty(t.invariants?.specBounds), `${lang} invariants.specBounds`);
      assertTrue(t.optimizeSuccess.includes('{D}') && t.missingModels.includes('{ids}'), lang);
      for (const k of ['actions', 'fields', 'types', 'help', 'defaultName']) assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
    }
  });

  test('dieselben Schlüssel in de und en', async () => {
    assertDeepEqual(Object.keys(await ui('en')).sort(), Object.keys(await ui('de')).sort());
  });
});

suite('response-optimization Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld, jede Ableitung und jedes computed der Ansicht hat einen Hilfetext', async () => {
    const top = [...Object.keys(State.schema.fields), ...Object.keys(State.schema.view), ...Object.keys(State.schema.derived), ...VIEW_COMPUTED];
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertDeepEqual(Object.keys(fields).sort(), [...top].sort(), lang);
      for (const f of top) assertTrue(nonEmpty(fields[f].help), `${lang} fields.${f}`);
      for (const k of ['selected', 'kind', 'lower', 'upper', 'target', 'weight']) assertTrue(nonEmpty(fields.specs[k]?.help), `${lang} specs.${k}`);
    }
  });

  test('Kommando mit Parametern, Lauf mit Abbruch, Typen der Ableitungen', async () => {
    for (const lang of LANGS) {
      const { actions, asyncTasks, types } = await contextHelp(lang);
      assertTrue(nonEmpty(actions.setSpec.help), lang);
      for (const p of ['modelId', 'key', 'value', 'command']) assertTrue(nonEmpty(actions.setSpec.params[p]), `${lang} setSpec.${p}`);
      assertTrue(nonEmpty(actions.runOptimize.params.command), lang);
      assertTrue(nonEmpty(asyncTasks.runOptimize.help) && nonEmpty(asyncTasks.runOptimize.cancel.help), lang);
      for (const t of ['ModelRef', 'SelectableModel', 'Spec', 'Result']) assertTrue(!!types[t], `${lang} ${t}`);
      assertTrue(!Object.hasOwn(types.Result, 'ciAtOpt') && !Object.hasOwn(types.Result, 'paretoFront'), lang);
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
