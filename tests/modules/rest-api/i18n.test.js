/**
 * REST API: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — ein Text je Invariante, Rückfragen, ohne die
 * toten Schlüssel der Altform; Kontexthilfe für jedes Kommando, Feld, den
 * Lauf und die Antwort, ohne Strukturjargon in Feldtexten.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/rest-api/domain/model.js';

const MOD = '../../../js/modules/rest-api/resources/i18n/';
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

suite('rest-api Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante des Models, in DE und EN', async () => {
    const names = Object.keys(State.schema.invariants);
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), names, lang);
      for (const n of names) assertTrue(nonEmpty(invariants[n]), `${lang} invariants.${n}`);
    }
  });
  test('Rückfragen, Name, Einsatzhinweis, Abbrechen, Zeitplan-Hinweise', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      assertTrue(t.confirm.removeEndpoint.includes('{name}'), `${lang} removeEndpoint`);
      assertTrue(nonEmpty(t.confirm.removeEndpointUnnamed), `${lang} removeEndpointUnnamed`);
      for (const k of ['name', 'description', 'whenToUse', 'cancel', 'errorNoUrl', 'unnamed']) assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      assertTrue(t.scheduleStarted.includes('{name}') && t.scheduleStopped.includes('{name}'), `${lang} Zeitplan`);
      assertTrue(t.secretHeadersEmpty.includes('{names}'), `${lang} secretHeadersEmpty`);
      assertTrue(t.invariants.noMaskedValue.includes('••••'), `${lang} Platzhalter`);
    }
  });
  test('ohne die toten Schlüssel der Altform und ohne Agententexte', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['endpointName', 'scheduleRunning', 'columnAlreadyUsed', 'deleteConfirm', 'actions', 'fields', 'types']) {
        assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
      }
    }
  });
  test('DE und EN haben dieselben Schlüssel', async () => {
    assertDeepEqual(leaves(await ui('en')), leaves(await ui('de')));
  });
});

suite('rest-api Kontexthilfe', () => {
  test('jedes Kommando mit Hilfe, jedem Parameter und dem Kommandoobjekt; der Lauf mit Kommandoobjekt', async () => {
    for (const lang of LANGS) {
      const { actions } = await ctx(lang);
      assertDeepEqual(Object.keys(actions), [...Object.keys(State.schema.commands), 'sendRequest'], lang);
      for (const [name, def] of Object.entries(State.schema.commands)) {
        assertTrue(nonEmpty(actions[name].help), `${lang} ${name}.help`);
        const uiOnly = Object.keys(def.params).length > 0 && Object.values(def.params).every((p) => p.agentWrite === false);
        assertDeepEqual(Object.keys(actions[name].params ?? {}), [...Object.keys(def.params), ...(uiOnly ? [] : ['command'])], `${lang} ${name}`);
      }
      assertTrue(nonEmpty(actions.sendRequest.params.command), `${lang} sendRequest.command`);
    }
  });
  test('Lauf sendRequest: Hilfe, Parameter, Abbrechen', async () => {
    for (const lang of LANGS) {
      const { asyncTasks } = await ctx(lang);
      assertDeepEqual(Object.keys(asyncTasks), ['sendRequest']);
      assertTrue(nonEmpty(asyncTasks.sendRequest.help), `${lang} help`);
      assertTrue(nonEmpty(asyncTasks.sendRequest.params.endpointId), `${lang} endpointId`);
      assertTrue(nonEmpty(asyncTasks.sendRequest.cancel.help), `${lang} cancel`);
    }
  });
  test('jedes Feld, Ansichtsfeld und die Ableitung; je Unterfeld eine Hilfe', async () => {
    const shape = State.schema.fields.endpoints.item.shape;
    for (const lang of LANGS) {
      const { fields } = await ctx(lang);
      assertDeepEqual(Object.keys(fields), ['endpoints', 'activeId', 'scheduleWithoutUrl', 'secretHeadersEmpty'], lang);
      for (const n of Object.keys(fields)) assertTrue(nonEmpty(fields[n].help), `${lang} fields.${n}`);
      const ep = fields.endpoints;
      assertDeepEqual(Object.keys(ep).filter((k) => k !== 'help'), Object.keys(shape), `${lang} endpoints`);
      for (const k of Object.keys(shape)) assertTrue(nonEmpty(ep[k].help), `${lang} endpoints.${k}`);
      assertDeepEqual(Object.keys(ep.headers).filter((k) => k !== 'help'), ['key', 'value']);
      assertDeepEqual(Object.keys(ep.mappings).filter((k) => k !== 'help'), ['jsonPath', 'columnRef']);
      assertDeepEqual(Object.keys(ep.schedule).filter((k) => k !== 'help'), ['enabled', 'intervalValue', 'intervalUnit']);
    }
  });
  test('Feldtexte ohne Strukturjargon (null, keys)', async () => {
    for (const lang of LANGS) {
      const { fields } = await ctx(lang);
      const text = JSON.stringify(fields);
      assertTrue(!/\bnull\b/.test(text), `${lang} null`);
      assertTrue(!/\bkeys\b/.test(text), `${lang} keys`);
    }
  });
  test('Typen Response und SecretGap; DE und EN schlüsselgleich', async () => {
    const de = await ctx('de');
    assertDeepEqual(Object.keys(de.types.Response), ['status', 'statusText', 'ok', 'body']);
    assertDeepEqual(Object.keys(de.types.SecretGap), ['endpointId', 'index', 'key']);
    assertDeepEqual(leaves(await ctx('en')), leaves(de));
  });
});
