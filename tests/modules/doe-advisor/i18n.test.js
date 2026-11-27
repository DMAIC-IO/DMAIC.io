/**
 * DoE-Berater: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — Invariante, Hinweise, Katalog-, Phasen-, CCD-
 * und Beratertexte je id, Kontexthilfe zu jedem Feld, jeder Ableitung, jedem
 * Kommando und Typschlüssel; ohne die Agententexte der Altform.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/doe-advisor/domain/model.js';
import {
  DESIGN_IDS, PHASE_GUIDE_IDS, CCD_ROW_IDS, STEPS, RESULT_DESIGN,
} from '../../../js/modules/doe-advisor/domain/wizard.js';

const MOD = '../../../js/modules/doe-advisor/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const contextHelp = (lang) => fetchJson(`${MOD}resources/i18n/context-help.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('doe-advisor Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante, die zwei Hinweise der Ablehnungen', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      assertDeepEqual(Object.keys(t.invariants), Object.keys(State.schema.invariants), lang);
      assertTrue(nonEmpty(t.invariants.wizardConsistent), lang);
      assertDeepEqual(Object.keys(t.hints), ['noOpenQuestion', 'atFirstQuestion'], lang);
      for (const v of Object.values(t.hints)) assertTrue(nonEmpty(v), lang);
    }
  });
  test('jeder Versuchsplan, jede Phase, jede CCD-Zeile, jede Frage, Antwort und Begründung', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const id of DESIGN_IDS) for (const k of ['name', 'tip', 'factors', 'levels', 'effort', 'note']) assertTrue(nonEmpty(t.designs[id][k]), `${lang} designs.${id}.${k}`);
      for (const id of PHASE_GUIDE_IDS) for (const k of ['phase', 'goal', 'designs']) assertTrue(nonEmpty(t.phaseGuide[id][k]), `${lang} phaseGuide.${id}.${k}`);
      for (const id of CCD_ROW_IDS) for (const k of ['label', 'rotatable', 'face']) assertTrue(nonEmpty(t.ccd.rows[id][k]), `${lang} ccd.rows.${id}.${k}`);
      for (const s of STEPS) {
        assertTrue(nonEmpty(t.wizard[s.id].question) && nonEmpty(t.wizard[s.id].short), `${lang} wizard.${s.id}`);
        for (const o of s.options) for (const k of ['label', 'help']) assertTrue(nonEmpty(t.wizard[s.id].options[o][k]), `${lang} wizard.${s.id}.options.${o}.${k}`);
      }
      for (const d of Object.values(RESULT_DESIGN)) if (d) assertTrue(nonEmpty(t.wizard.reasoning[d]), `${lang} wizard.reasoning.${d}`);
    }
  });
  test('ohne die Agententexte der Altform', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['actions', 'fields', 'types']) assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
    }
  });
});

suite('doe-advisor Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld, das Ansichtsfeld und jede Ableitung haben einen Hilfetext', async () => {
    const names = [...Object.keys(State.schema.view), ...Object.keys(State.schema.fields), ...Object.keys(State.schema.derived)];
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertDeepEqual(Object.keys(fields).sort(), [...names].sort(), lang);
      for (const n of names) assertTrue(nonEmpty(fields[n].help), `${lang} fields.${n}`);
    }
  });
  test('jedes Kommando mit help, seinen Parametern und command; kein switchTab', async () => {
    for (const lang of LANGS) {
      const { actions } = await contextHelp(lang);
      assertDeepEqual(Object.keys(actions), Object.keys(State.schema.commands), lang);
      for (const [name, def] of Object.entries(State.schema.commands)) {
        assertTrue(nonEmpty(actions[name].help), `${lang} ${name}.help`);
        assertDeepEqual(Object.keys(actions[name].params), [...Object.keys(def.params), 'command'], `${lang} ${name}.params`);
      }
    }
  });
  test('answers nennt jeden Schlüssel und jeden Wert; recommendation ohne Verweis auf keys', async () => {
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      for (const s of STEPS) {
        assertTrue(fields.answers.help.includes(s.key), `${lang} ${s.key}`);
        for (const o of s.options) assertTrue(fields.answers.help.includes(o), `${lang} ${o}`);
      }
      assertTrue(!/\bkeys\b/.test(fields.recommendation.help), lang);
    }
  });
  test('Typschlüssel der Empfehlung', async () => {
    for (const lang of LANGS) {
      const { types } = await contextHelp(lang);
      assertDeepEqual(Object.keys(types), ['Recommendation'], lang);
      assertDeepEqual(Object.keys(types.Recommendation), ['designId', 'name', 'factors', 'levels', 'effort'], lang);
    }
  });
});
