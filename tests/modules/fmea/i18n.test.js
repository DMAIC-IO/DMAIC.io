/**
 * FMEA: Texte in resources/i18n/ui.<lang>.json — Invarianten, Ratentexte der
 * Auftretensskala (in beiden Sprachen wortgleich), Ja/Nein des Exports, ohne
 * tote Schlüssel und ohne Agententexte; Kontexthilfe deckt Felder, Kommandos
 * und Typedef-Schlüssel ab.
 */
import { suite, test, assertDeepEqual, assertTrue, assertEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/fmea/domain/model.js';
import { schemaAgentEntry } from '../../../js/core/agent/agent-schema.js';

const MOD = '../../../js/modules/fmea/';
const LANGS = ['de', 'en'];
const RATES = ['occUnlikelyRate', 'occLowRate', 'occModRate', 'occHighRate', 'occVHighRate'];

async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}
const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const ctxHelp = (lang) => fetchJson(`${MOD}resources/i18n/context-help.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('fmea Texte in ui.<lang>.json', () => {
  test('ein Text je Invariante, in DE und EN', async () => {
    const names = Object.keys(State.schema.invariants);
    for (const lang of LANGS) {
      const { invariants } = await ui(lang);
      assertDeepEqual(Object.keys(invariants), names, lang);
      for (const n of names) assertTrue(nonEmpty(invariants[n]), `${lang} ${n}`);
    }
  });
  test('Ratentexte der Auftretensskala wortgleich in beiden Sprachen (wie die Altform)', async () => {
    const de = await ui('de');
    const en = await ui('en');
    for (const k of RATES) assertEqual(en[k], de[k], k);
    assertEqual(de.occUnlikelyRate, '< 1 / 1.500.000');
  });
  test('Ja/Nein des Exports', async () => {
    const de = await ui('de');
    const en = await ui('en');
    assertDeepEqual([de.csvYes, de.csvNo, en.csvYes, en.csvNo], ['Ja', 'Nein', 'Yes', 'No']);
  });
  test('ohne die toten Schlüssel und ohne Agententexte', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['reset', 'resetConfirm', 'resetDone', 'exportCSV', 'exportedCSV', 'actions', 'fields', 'types']) {
        assertTrue(!Object.hasOwn(t, k), `${lang} ${k}`);
      }
      assertTrue(nonEmpty(t.whenToUse) && nonEmpty(t.name), lang);
    }
  });
  test('gleiche Schlüssel in DE und EN', async () => {
    const keys = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    assertDeepEqual(keys(await ui('en')), keys(await ui('de')));
  });
});

suite('fmea Kontexthilfe', () => {
  test('jedes Kommando mit help, seinen Parametern und command', async () => {
    const entry = schemaAgentEntry(State);
    for (const lang of LANGS) {
      const { actions } = await ctxHelp(lang);
      for (const [name, a] of Object.entries(entry.actions)) {
        if (name === 'read') continue;
        assertTrue(nonEmpty(actions[name]?.help), `${lang} ${name}`);
        for (const k of [...Object.keys(a.keys), 'command']) assertTrue(nonEmpty(actions[name].params[k]), `${lang} ${name}.${k}`);
      }
    }
  });
  test('Felder samt Risiko- und Maßnahmenschlüsseln, Ableitungen und Diagramm', async () => {
    const shape = State.schema.fields.risks.item.shape;
    for (const lang of LANGS) {
      const { fields } = await ctxHelp(lang);
      for (const k of ['method', 'fmeaType', 'risks', 'scales', 'collapsed', 'burndownEdits', 'stats', 'riskRatings', 'burndown', 'burndownChart']) {
        assertTrue(nonEmpty(fields[k]?.help), `${lang} ${k}`);
      }
      for (const k of Object.keys(shape)) assertTrue(nonEmpty(fields.risks[k]?.help), `${lang} risks.${k}`);
      for (const k of Object.keys(shape.actions.item.shape)) assertTrue(nonEmpty(fields.risks.actions[k]?.help), `${lang} actions.${k}`);
    }
  });
});
