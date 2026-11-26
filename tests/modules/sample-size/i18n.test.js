/**
 * Stichprobenumfang: Texte in resources/i18n/ui.<lang>.json und
 * context-help.<lang>.json — Oberflächentexte der Altform ohne tote
 * Schlüssel, Kontexthilfe zu jedem Feld und jeder Effektangabe.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/sample-size/domain/model.js';
import { VARIANTS, VARIANT_IDS } from '../../../js/modules/sample-size/domain/variants.js';

const MOD = '../../../js/modules/sample-size/';
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

suite('sample-size Texte in ui.<lang>.json', () => {
  test('Name, Beschreibung, Einsatz und Oberflächentexte; keine toten Schlüssel', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'varianceRatio', 'cohensD', 'resultSummary', 'nOverflow',
        'sectionCurve', 'power', 'targetPower', 'perGroup', 'requiredN', 'totalN']) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      for (const k of ['actions', 'fields', 'types', 'placeholderText', 'calculate', 'errRatio', 'errSigma0',
        'errSigmaAlt', 'errDelta', 'errSigma']) {
        assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
      }
    }
  });
});

suite('sample-size Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld und jede Ableitung hat einen Hilfetext', async () => {
    const names = [...Object.keys(State.schema.fields), 'powerCurveEdits', 'activeParams', 'result'];
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertDeepEqual(Object.keys(fields), names, lang);
      for (const n of names) assertTrue(nonEmpty(fields[n].help), `${lang} fields.${n}`);
    }
  });

  test('fields.effect.<variante> deckt genau die Angaben des Registers', async () => {
    for (const lang of LANGS) {
      const { effect } = (await contextHelp(lang)).fields;
      assertDeepEqual(Object.keys(effect).filter((k) => k !== 'help'), [...VARIANT_IDS], lang);
      for (const id of VARIANT_IDS) {
        assertTrue(nonEmpty(effect[id].help), `${lang} ${id}`);
        assertDeepEqual(Object.keys(effect[id]).filter((k) => k !== 'help'), [...VARIANTS[id].params], `${lang} ${id}`);
        for (const k of VARIANTS[id].params) assertTrue(nonEmpty(effect[id][k].help), `${lang} ${id}.${k}`);
      }
    }
  });

  test('types.Result: jede Kennzahl', async () => {
    for (const lang of LANGS) {
      const { types } = await contextHelp(lang);
      assertDeepEqual(Object.keys(types.Result),
        ['nRequired', 'totalN', 'alpha', 'power', 'effectLabel', 'effectValue', 'algoId'], lang);
    }
  });

  test('kein „null“ in den Feldtexten', async () => {
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      assertTrue(!JSON.stringify(fields).includes('null'), lang);
    }
  });
});
