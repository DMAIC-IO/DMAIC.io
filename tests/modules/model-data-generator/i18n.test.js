/**
 * Modelldaten-Generator: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — ein Text je Invariante, die Beschriftungen der
 * Ansicht, Kontexthilfe zu jedem Feld, jeder Ableitung, jedem Kommando, dem
 * Lauf und den Typschlüsseln; ohne die toten Schlüssel und Agententexte der
 * Altform.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/model-data-generator/domain/model.js';

const MOD = '../../../js/modules/model-data-generator/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}
const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const contextHelp = (lang) => fetchJson(`${MOD}resources/i18n/context-help.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

const DEAD = ['tabFactors', 'tabModel', 'tabGenerate', 'factorsDesc', 'outputDesc', 'interactionDesc', 'generateDesc',
  'outputName', 'interactionTitle', 'termsTotal', 'nextModel', 'nextGenerate', 'allZero', 'randomBetas', 'exportCSV',
  'moreRows', 'csvExported', 'sentToWorksheet', 'noWorksheet', 'wayInteractions'];

suite('model-data-generator Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante des Models', async () => {
    const names = Object.keys(State.schema.invariants);
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), names, lang);
      for (const n of names) assertTrue(nonEmpty(invariants[n]), `${lang} invariants.${n}`);
    }
  });

  test('Name, Beschreibung, Einsatz und die Beschriftungen der Ansicht', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'factorsTitle', 'factorName', 'addFactor', 'outputTitle',
        'modelTitle', 'modelDesc', 'intercept', 'coefficients', 'mainEffects', 'orderInteractions', 'generateTitle',
        'samplingMethod', 'methodRandom', 'methodLHS', 'methodFullFactorial', 'sampleSize', 'noise', 'generate',
        'statsTitle', 'statMean', 'statStd', 'statN', 'previewTitle', 'rows', 'min', 'max', 'seed', 'remove']) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      assertTrue(t.orderInteractions.includes('{order}'), `${lang} orderInteractions`);
    }
  });

  test('ohne die toten Schlüssel der Altform und ohne die Agententexte', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of [...DEAD, 'actions', 'fields', 'types']) assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
    }
  });
});

suite('model-data-generator Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld und jede Ableitung hat einen Hilfetext, die Faktorfelder auch', async () => {
    const names = [...Object.keys(State.schema.fields), ...Object.keys(State.schema.derived)];
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      for (const n of names) assertTrue(nonEmpty(fields[n]?.help), `${lang} fields.${n}`);
      for (const k of ['name', 'min', 'max']) assertTrue(nonEmpty(fields.factors[k]?.help), `${lang} factors.${k}`);
    }
  });

  test('jedes Kommando mit help, seinen Parametern und command; der Lauf toWorksheet', async () => {
    const commands = State.schema.commands;
    for (const lang of LANGS) {
      const { actions, asyncTasks } = await contextHelp(lang);
      assertDeepEqual(Object.keys(actions), [...Object.keys(commands), 'toWorksheet', 'gridExport', 'gridOpenInWorksheet'], lang);
      assertTrue(nonEmpty(actions.toWorksheet.params.command), `${lang} toWorksheet.params.command`);
      for (const [name, def] of Object.entries(commands)) {
        assertTrue(nonEmpty(actions[name].help), `${lang} ${name}.help`);
        assertDeepEqual(Object.keys(actions[name].params), [...Object.keys(def.params ?? {}), 'command'], `${lang} ${name}.params`);
      }
      assertTrue(nonEmpty(asyncTasks.toWorksheet.help) && nonEmpty(asyncTasks.toWorksheet.cancel.help), lang);
    }
  });

  test('Typschlüssel von Term und Generated', async () => {
    for (const lang of LANGS) {
      const { types } = await contextHelp(lang);
      assertDeepEqual(Object.keys(types.Term), ['index', 'label', 'order', 'beta'], lang);
      assertDeepEqual(Object.keys(types.Generated), ['n', 'mean', 'sd', 'min', 'max'], lang);
    }
  });

  test('keine entfallenen Aktionen und Lesefelder der Altform', async () => {
    for (const lang of LANGS) {
      const all = JSON.stringify(await contextHelp(lang));
      for (const word of ['setIntercept', 'setYName', 'setSamplingMethod', 'setSampleSize', 'setNoiseStd', 'setSeed',
        'samplingMethods', '"generate"', '"read"', 'FactorFields']) {
        assertTrue(!all.includes(word), `${lang} „${word}“`);
      }
    }
  });
});
