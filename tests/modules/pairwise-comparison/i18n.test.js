/**
 * Paarweiser Vergleich: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — Invariante des Models, Trenner „vs“, die
 * Hinweise der Ablehnungen, Kontexthilfe zu jedem Feld, Kommando, Parameter
 * und Typschlüssel; ohne die toten Schlüssel der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/pairwise-comparison/domain/model.js';

const MOD = '../../../js/modules/pairwise-comparison/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const contextHelp = (lang) => fetchJson(`${MOD}resources/i18n/context-help.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('pairwise-comparison Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante des Models, in DE und EN', async () => {
    const names = Object.keys(State.schema.invariants);
    assertDeepEqual(names, ['reachablePhase']);
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), names, lang);
      for (const n of names) assertTrue(nonEmpty(invariants[n]), `${lang} invariants.${n}`);
    }
  });

  test('Name, Beschreibung, Einsatz, Trenner vs und die Hinweise der Ablehnungen', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'duplicateWarning', 'maxReached', 'sum']) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      assertEqual(t.vsDivider, 'vs', lang);
    }
  });

  test('ohne die toten Schlüssel der Altform und ohne die Agententexte', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['resetAll', 'resetConfirm', 'resetDone', 'exportedCSV', 'exportedJSON', 'actions', 'fields', 'types']) {
        assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
      }
    }
  });
});

suite('pairwise-comparison Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld, das Ansichtsfeld und die Ableitung haben einen Hilfetext', async () => {
    const names = [...Object.keys(State.schema.fields), ...Object.keys(State.schema.view), ...Object.keys(State.schema.derived)];
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertDeepEqual(Object.keys(fields), names, lang);
      for (const n of names) assertTrue(nonEmpty(fields[n].help), `${lang} fields.${n}`);
    }
  });

  test('jedes Kommando mit help, seinen Parametern und command; kein setViewPhase', async () => {
    const commands = State.schema.commands;
    for (const lang of LANGS) {
      const { actions } = await contextHelp(lang);
      assertDeepEqual(Object.keys(actions), Object.keys(commands), lang);
      for (const [name, def] of Object.entries(commands)) {
        assertTrue(nonEmpty(actions[name].help), `${lang} ${name}.help`);
        assertDeepEqual(Object.keys(actions[name].params), [...Object.keys(def.params), 'command'], `${lang} ${name}.params`);
        for (const v of Object.values(actions[name].params)) assertTrue(nonEmpty(v), `${lang} ${name} param`);
      }
    }
  });

  test('Typschlüssel von Result und RankEntry', async () => {
    for (const lang of LANGS) {
      const { types } = await contextHelp(lang);
      assertDeepEqual(Object.keys(types.Result), ['scores', 'maxScore', 'ranking'], lang);
      assertDeepEqual(Object.keys(types.RankEntry), ['name', 'score', 'idx'], lang);
    }
  });

  test('keine Rückgabewerte der Altform (ok, false) mehr in den Kommandotexten', async () => {
    for (const lang of LANGS) {
      const { actions } = await contextHelp(lang);
      const all = JSON.stringify(actions);
      for (const word of ['false', ' ok', 'duplicate (', 'empty (']) assertTrue(!all.includes(word), `${lang} „${word}“`);
    }
  });
});
