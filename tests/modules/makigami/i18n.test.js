/**
 * Makigami: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — ein Text je Invariante, Rückfragen, Hinweise
 * zum letzten Eintrag, Exportmarke, ohne die toten Schlüssel der Altform;
 * Kontexthilfe für jedes Kommando, Feld und jede Ableitung.
 */
import { suite, test, assertDeepEqual, assertTrue, assertEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/makigami/domain/model.js';

const MOD = '../../../js/modules/makigami/resources/i18n/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}ui.${lang}.json`);
const ctx = (lang) => fetchJson(`${MOD}context-help.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

/** Alle Blattpfade eines Objekts. @param {object} o @param {string} [p] @returns {string[]} */
const leaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (
  v && typeof v === 'object' ? leaves(v, `${p}${k}.`) : [`${p}${k}`]));

suite('makigami Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante des Models, in DE und EN', async () => {
    const names = Object.keys(State.schema.invariants);
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), names, lang);
      for (const n of names) assertTrue(nonEmpty(invariants[n]), `${lang} invariants.${n}`);
    }
  });
  test('Rückfragen, Hinweise, Exportmarke, Name und Einsatzhinweis', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['removeStep', 'removeRole', 'removeRoleUnnamed', 'resetSettings']) assertTrue(nonEmpty(t.confirm[k]), `${lang} confirm.${k}`);
      assertTrue(t.confirm.removeStep.includes('{title}'), `${lang} removeStep`);
      assertTrue(t.confirm.removeRole.includes('{label}'), `${lang} removeRole`);
      for (const k of ['lastMuda', 'lastUnit']) assertTrue(nonEmpty(t.hints[k]), `${lang} hints.${k}`);
      assertEqual(t.exportMark, 'x');
      for (const k of ['name', 'description', 'whenToUse']) assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      assertDeepEqual(Object.keys(t.muda), ['transport', 'inventory', 'motion', 'waiting', 'overproduction', 'overprocessing', 'defects', 'skills']);
    }
  });
  test('ohne die toten Schlüssel der Altform und ohne Agententexte', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['exportXLSX', 'exportCSV', 'exportJSON', 'exportPNG', 'exportSVG', 'cardMudaNone', 'delRoleConfirm', 'delStepConfirm', 'settingsResetConfirm', 'actions', 'fields', 'types']) {
        assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
      }
    }
  });
  test('DE und EN haben dieselben Schlüssel', async () => {
    assertDeepEqual(leaves(await ui('en')), leaves(await ui('de')));
  });
});

suite('makigami Kontexthilfe', () => {
  test('jedes Kommando mit Hilfe, jedem Parameter und dem Kommandoobjekt', async () => {
    for (const lang of LANGS) {
      const { actions } = await ctx(lang);
      assertDeepEqual(Object.keys(actions), Object.keys(State.schema.commands), lang);
      for (const [name, def] of Object.entries(State.schema.commands)) {
        assertTrue(nonEmpty(actions[name].help), `${lang} ${name}.help`);
        // Kommandos nur der Oberfläche (alle Parameter `agentWrite: false`) stehen nicht im Agentenkatalog: ohne Kommandoobjekt.
        const uiOnly = Object.keys(def.params).length > 0 && Object.values(def.params).every((p) => p.agentWrite === false);
        assertDeepEqual(Object.keys(actions[name].params), [...Object.keys(def.params), ...(uiOnly ? [] : ['command'])], `${lang} ${name}`);
      }
    }
  });
  test('jedes Feld, Ansichtsfeld und jede Ableitung, je Listenelement jeder Schlüssel', async () => {
    for (const lang of LANGS) {
      const { fields } = await ctx(lang);
      const names = [...Object.keys(State.schema.fields), ...Object.keys(State.schema.view), ...Object.keys(State.schema.derived)];
      assertDeepEqual(Object.keys(fields), names, lang);
      for (const n of names) assertTrue(nonEmpty(fields[n].help), `${lang} fields.${n}`);
      for (const list of ['roles', 'steps', 'mudaCategories', 'timeUnits']) {
        const keys = Object.keys(State.schema.fields[list].item.shape);
        assertDeepEqual(Object.keys(fields[list]).filter((k) => k !== 'help'), keys, `${lang} ${list}`);
      }
    }
  });
  test('Typen MakigamiKpi und TimeIssue; DE und EN schlüsselgleich', async () => {
    const de = await ctx('de');
    assertDeepEqual(Object.keys(de.types.MakigamiKpi), ['process', 'wait', 'lead', 'pce']);
    assertDeepEqual(Object.keys(de.types.TimeIssue), ['stepId', 'field']);
    assertDeepEqual(leaves(await ctx('en')), leaves(de));
  });
});
