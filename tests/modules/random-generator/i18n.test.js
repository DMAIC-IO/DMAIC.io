/**
 * Zufallsgenerator: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — ein Text je Invariante, die Verteilungsnamen
 * und Parametertexte, Kontexthilfe zu jedem Feld, jedem Parameter jeder
 * Verteilung, Kommando, Lauf und Typschlüssel; ohne die toten Schlüssel der
 * Altform.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/random-generator/domain/model.js';
import { PARAMS_SHAPE, distOf } from '../../../js/modules/random-generator/domain/distributions.js';

const MOD = '../../../js/modules/random-generator/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}
const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const contextHelp = (lang) => fetchJson(`${MOD}resources/i18n/context-help.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('random-generator Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante des Models', async () => {
    const names = Object.keys(State.schema.invariants);
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), names, lang);
      for (const n of names) assertTrue(nonEmpty(invariants[n]), `${lang} invariants.${n}`);
    }
  });

  test('Name, Beschreibung, Einsatz, je Verteilung Name, Beschriftung je Parameter', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'errGenerate', 'sentToWorksheet', 'selectTarget']) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      for (const [dist, s] of Object.entries(PARAMS_SHAPE)) {
        assertTrue(nonEmpty(t[distOf(dist).nameKey]), `${lang} ${dist}`);
        for (const p of Object.keys(s.shape)) assertTrue(nonEmpty(t.dist[dist][p].label), `${lang} dist.${dist}.${p}`);
      }
    }
  });

  test('ohne die toten Schlüssel der Altform und ohne die Agententexte', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['generate', 'noWorksheetAvailable', 'csvExported', 'exportCSV', 'selectDistribution', 'actions', 'fields', 'types']) {
        assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
      }
    }
  });
});

suite('random-generator Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld und jede Ableitung hat einen Hilfetext', async () => {
    const names = [...Object.keys(State.schema.fields), ...Object.keys(State.schema.derived)];
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      for (const n of names) assertTrue(nonEmpty(fields[n]?.help), `${lang} fields.${n}`);
    }
  });

  test('jeder Parameter jeder Verteilung und jedes Kategoriefeld hat einen Hilfetext', async () => {
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertDeepEqual(Object.keys(fields.params).filter((k) => k !== 'help'), Object.keys(PARAMS_SHAPE), lang);
      for (const [dist, s] of Object.entries(PARAMS_SHAPE)) {
        assertTrue(nonEmpty(fields.params[dist].help), `${lang} ${dist}`);
        for (const p of Object.keys(s.shape)) assertTrue(nonEmpty(fields.params[dist][p]?.help), `${lang} ${dist}.${p}`);
      }
      for (const k of ['id', 'name', 'weight']) assertTrue(nonEmpty(fields.attributes[k]?.help), `${lang} attributes.${k}`);
    }
  });

  test('jedes Kommando mit help, seinen Parametern und command; der Lauf toWorksheet', async () => {
    const commands = State.schema.commands;
    for (const lang of LANGS) {
      const { actions, asyncTasks } = await contextHelp(lang);
      // Neben den Kommandos trägt `actions` den Lauf toWorksheet (nur `params.command`).
      assertDeepEqual(Object.keys(actions), [...Object.keys(commands), 'toWorksheet'], lang);
      assertTrue(nonEmpty(actions.toWorksheet.params.command), `${lang} toWorksheet.params.command`);
      for (const [name, def] of Object.entries(commands)) {
        assertTrue(nonEmpty(actions[name].help), `${lang} ${name}.help`);
        assertDeepEqual(Object.keys(actions[name].params), [...Object.keys(def.params), 'command'], `${lang} ${name}.params`);
      }
      assertTrue(nonEmpty(asyncTasks.toWorksheet.help) && nonEmpty(asyncTasks.toWorksheet.params.target)
        && nonEmpty(asyncTasks.toWorksheet.cancel.help), lang);
    }
  });

  test('Typschlüssel von Generated, FrequencyRow und TargetColumn', async () => {
    for (const lang of LANGS) {
      const { types } = await contextHelp(lang);
      assertDeepEqual(Object.keys(types.Generated), ['n', 'mean', 'sd', 'median', 'min', 'max', 'skewness', 'kurtosis', 'frequency'], lang);
      assertDeepEqual(Object.keys(types.FrequencyRow), ['name', 'count', 'share'], lang);
      assertDeepEqual(Object.keys(types.TargetColumn), ['key', 'name'], lang);
    }
  });

  test('keine entfallenen Aktionen und Lesefelder der Altform', async () => {
    for (const lang of LANGS) {
      const all = JSON.stringify(await contextHelp(lang));
      for (const word of ['selectDistribution', 'setDistParam', 'setParam', 'errorMsg', 'activeDistParams', '"distributions"', '"generate"']) {
        assertTrue(!all.includes(word), `${lang} „${word}“`);
      }
    }
  });
});
