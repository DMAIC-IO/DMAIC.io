/**
 * GLM-Regression: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — Oberflächentexte der Altform ohne die
 * Agentenblöcke, Kontexthilfe zu jedem Feld, jeder Ableitung, jedem Typ, den
 * Kommandos und dem Lauf.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/glm-regression/domain/model.js';

const MOD = '../../../js/modules/glm-regression/';
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

/** Die computed des view-Blocks (Gate: fields.<computed>.help); erst mit dem Viewmodel. */
export const VIEW_COMPUTED = [];

suite('glm-regression Texte in ui.<lang>.json', () => {
  test('Name, Beschreibung, Einsatz, Gründe und neue Texte; keine Agentenblöcke', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'errorTooFew', 'errorTooFewForP', 'errorNotBinary', 'errorFit',
        'errorNoConverge', 'errorProportionRange', 'errorTrialsInvalid', 'errColumnMissing', 'confRejected', 'saveBlocked',
        'saveFailed', 'savedModelStatus', 'modelSaved', 'autoDetectBinary', 'warnFewEvents']) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      assertTrue(t.savedModelStatus.includes('{name}'), `${lang} savedModelStatus`);
      for (const k of ['actions', 'fields', 'types', 'help']) assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
    }
  });

  test('dieselben Schlüssel in de und en', async () => {
    assertDeepEqual(Object.keys(await ui('en')).sort(), Object.keys(await ui('de')).sort());
  });
});

suite('glm-regression Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld, jede Ableitung und jedes computed der Ansicht hat einen Hilfetext', async () => {
    const top = [...Object.keys(State.schema.fields), ...Object.keys(State.schema.view), ...Object.keys(State.schema.derived), ...VIEW_COMPUTED];
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertDeepEqual(Object.keys(fields).sort(), [...top].sort(), lang);
      for (const f of top) assertTrue(nonEmpty(fields[f].help), `${lang} fields.${f}`);
    }
  });

  test('Kommandos mit Parametern und command; Lauf mit Abbruch; Typen ohne Params', async () => {
    for (const lang of LANGS) {
      const { actions, asyncTasks, types } = await contextHelp(lang);
      for (const a of ['setConfLevel', 'setAlpha']) {
        assertTrue(nonEmpty(actions[a].help), `${lang} ${a}`);
        for (const p of ['value', 'command']) assertTrue(nonEmpty(actions[a].params[p]), `${lang} ${a}.${p}`);
      }
      assertTrue(nonEmpty(asyncTasks.saveAsModel.help) && nonEmpty(asyncTasks.saveAsModel.cancel.help), lang);
      assertTrue(nonEmpty(actions.saveAsModel.params.command), lang);
      assertTrue(!Object.hasOwn(types, 'Params'), lang);
      for (const t of ['Result', 'Warning', 'Family', 'PseudoR2', 'GlmCoefficient', 'Ratio', 'HosmerLemeshow', 'Overdispersion',
        'Classification', 'FitError', 'Detection', 'SuccessClassInfo', 'SavedModel']) assertTrue(!!types[t], `${lang} ${t}`);
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
