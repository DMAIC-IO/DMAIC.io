/**
 * Einheitenumrechner: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — Invarianten, Einheiten, Gruppen, Zeitzonen und
 * Größenarten der Tabellen, Kontexthilfe zu jedem Feld, jeder Ableitung,
 * jedem Kommando und Typschlüssel; ohne die Agententexte der Altform.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/unit-converter/domain/model.js';
import { CATEGORIES, TIMEZONES } from '../../../js/modules/unit-converter/domain/units.js';

const MOD = '../../../js/modules/unit-converter/';
const LANGS = ['de', 'en'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const contextHelp = (lang) => fetchJson(`${MOD}resources/i18n/context-help.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('unit-converter Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante des Models, in DE und EN', async () => {
    const names = Object.keys(State.schema.invariants);
    assertDeepEqual(names, ['unitsValid', 'timeForm', 'dateForm']);
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), names, lang);
      for (const n of names) assertTrue(nonEmpty(invariants[n]), `${lang} invariants.${n}`);
    }
  });

  test('jede Größenart, Einheit, Gruppe und Zeitzone hat einen Text', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const cat of Object.values(CATEGORIES)) {
        assertTrue(nonEmpty(t[cat.nameKey]), `${lang} ${cat.nameKey}`);
        for (const u of Object.values(cat.units)) assertTrue(nonEmpty(t[`unit_${u.nameKey}`]), `${lang} unit_${u.nameKey}`);
        for (const g of Object.keys(cat.groups || {})) assertTrue(nonEmpty(t[`labGroup_${g}`]), `${lang} labGroup_${g}`);
      }
      for (const z of TIMEZONES) assertTrue(nonEmpty(t[z.labelKey]), `${lang} ${z.labelKey}`);
      assertTrue(t.clockTime.includes('{time}'), `${lang} clockTime`);
    }
  });

  test('ohne die Agententexte der Altform', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['actions', 'fields', 'types']) assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
    }
  });
});

suite('unit-converter Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld und jede Ableitung haben einen Hilfetext', async () => {
    const names = [...Object.keys(State.schema.fields), ...Object.keys(State.schema.derived)];
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertDeepEqual(Object.keys(fields), names, lang);
      for (const n of names) assertTrue(nonEmpty(fields[n].help), `${lang} fields.${n}`);
    }
  });

  test('jedes Kommando mit help, seinen Parametern und command; keine Setter der Altform', async () => {
    const commands = State.schema.commands;
    for (const lang of LANGS) {
      const { actions } = await contextHelp(lang);
      assertDeepEqual(Object.keys(actions), Object.keys(commands), lang);
      for (const [name, def] of Object.entries(commands)) {
        assertTrue(nonEmpty(actions[name].help), `${lang} ${name}.help`);
        assertDeepEqual(Object.keys(actions[name].params), [...Object.keys(def.params), 'command'], `${lang} ${name}.params`);
      }
    }
  });

  test('Typschlüssel der Ableitungen result und timezone', async () => {
    for (const lang of LANGS) {
      const { types } = await contextHelp(lang);
      assertDeepEqual(Object.keys(types), ['ConversionResult', 'TimezoneResult'], lang);
      assertDeepEqual(Object.keys(types.ConversionResult), ['value', 'factor'], lang);
      assertDeepEqual(Object.keys(types.TimezoneResult), ['time', 'date', 'diffHours'], lang);
    }
  });
});
