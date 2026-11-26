/**
 * Aufgabenliste: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — Invariante, Status, Zähler, Kontexthilfe je
 * Kommando samt `params.command`, ohne die Agententexte der Altform.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State, STATUSES } from '../../../js/modules/todo/domain/model.js';

const MOD = '../../../js/modules/todo/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const ctx = (lang) => fetchJson(`${MOD}resources/i18n/context-help.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('todo Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante, je Status und der Zähler mit beiden Platzhaltern', async () => {
    assertDeepEqual(Object.keys(State.schema.invariants), ['itemIds']);
    for (const lang of LANGS) {
      const t = await ui(lang);
      assertDeepEqual(Object.keys(t.invariants), ['itemIds'], lang);
      assertTrue(nonEmpty(t.invariants.itemIds), `${lang} invariants.itemIds`);
      for (const s of STATUSES) assertTrue(nonEmpty(t[`status_${s}`]), `${lang} status_${s}`);
      assertTrue(t.counterText.includes('{shown}') && t.counterText.includes('{total}'), `${lang} counterText`);
      for (const k of ['name', 'description', 'whenToUse']) assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
    }
  });

  test('ohne die Agententexte und den Filteranker der Altform', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['actions', 'fields', 'filterHelp']) assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
    }
  });
});

suite('todo Kontexthilfe in context-help.<lang>.json', () => {
  test('Hilfe und params.command je Kommando, Parameter vollständig', async () => {
    const commands = State.schema.commands;
    for (const lang of LANGS) {
      const { actions } = await ctx(lang);
      for (const [name, def] of Object.entries(commands)) {
        if (name === 'sortBy') continue;
        assertTrue(nonEmpty(actions[name]?.help), `${lang} actions.${name}.help`);
        assertTrue(nonEmpty(actions[name]?.params?.command), `${lang} actions.${name}.params.command`);
        for (const p of Object.keys(def.params ?? {})) assertTrue(nonEmpty(actions[name].params[p]), `${lang} actions.${name}.params.${p}`);
      }
      assertTrue(!Object.hasOwn(actions, 'setSearch'), `${lang} setSearch`);
    }
  });

  test('Felder samt Eintragsfeldern und Ansichtsfeldern, Kachel-Einstellungen', async () => {
    for (const lang of LANGS) {
      const { fields, tile } = await ctx(lang);
      assertTrue(nonEmpty(fields.items.help), `${lang} items`);
      for (const k of ['id', 'text', 'owner', 'due', 'status', 'cal', 'time', 'duration']) assertTrue(nonEmpty(fields.items[k]?.help), `${lang} items.${k}`);
      for (const k of Object.keys(State.schema.view)) assertTrue(nonEmpty(fields[k]?.help), `${lang} ${k}`);
      assertDeepEqual(Object.keys(tile.settings), ['topN', 'showDone']);
    }
  });

  test('der Filteranker übernimmt den Text der Altform', async () => {
    const { fields } = await ctx('de');
    assertEqual(fields.filterStatus.help, 'Grenzt die Liste ein: nach Status, nach verantwortlicher Person und per Suchtext in Aufgabentext und Verantwortlichem. Der Filter ändert keine Aufgabe.');
  });
});
