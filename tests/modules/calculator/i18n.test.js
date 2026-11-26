/**
 * Taschenrechner: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — Oberflächentexte der Altform, Kontexthilfe zu
 * jedem Feld, Kommando und Parameter; ohne die Setter der Altform.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/calculator/domain/model.js';

const MOD = '../../../js/modules/calculator/';
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

suite('calculator Texte in ui.<lang>.json', () => {
  test('Name, Beschreibung, Einsatz und die Gründe der Kennwerte', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'error', 'removed', 'noData', 'noMode',
        'needData', 'needN2', 'needN3', 'needDataAndLimits', 'lslPlaceholder', 'uslPlaceholder']) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      for (const k of ['actions', 'fields', 'types']) assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
    }
  });
});

suite('calculator Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld hat einen Hilfetext', async () => {
    const names = Object.keys(State.schema.fields);
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertDeepEqual(Object.keys(fields), names, lang);
      for (const n of names) assertTrue(nonEmpty(fields[n].help), `${lang} fields.${n}`);
    }
  });

  test('jedes Kommando mit help, seinen Parametern und command; keine Setter', async () => {
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

  test('kein „null“ in den Feldtexten', async () => {
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertTrue(!JSON.stringify(fields).includes('null'), lang);
    }
  });
});
