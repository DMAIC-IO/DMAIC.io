/**
 * MSA Typ 4: Texte in resources/i18n/ui.<lang>.json und context-help.<lang>.json —
 * Oberflächentexte der Altform, je Grund der Engine ein Text, Kontexthilfe zu
 * jedem Feld, Ansichtsfeld und jeder Ableitung; ohne die Aktionen der Altform.
 */
import { suite, test, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/msa-typ4/domain/model.js';

const MOD = '../../../js/modules/msa-typ4/';
const LANGS = ['de', 'en'];
const ERROR_KEYS = ['errLengthMismatch', 'errTooFewReferences', 'errTooFewRepeats', 'errInvalidPv', 'errNanValues'];
const VERDICT_KEYS = ['verdictAiagOk', 'verdictAiagMarginal', 'verdictAiagFail', 'verdictVdaOk', 'verdictVdaMarginal', 'verdictVdaFail'];
const INTERP_KEYS = ['AIAG', 'VDA5'].flatMap((n) => ['green', 'yellow', 'red'].map((c) => `interp${n}_${c}`));

/** @param {string} path @returns {Promise<any>} */
async function fetchJson(path) {
  const res = await fetch(new URL(path, import.meta.url), { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

const ui = (lang) => fetchJson(`${MOD}resources/i18n/ui.${lang}.json`);
const contextHelp = (lang) => fetchJson(`${MOD}resources/i18n/context-help.${lang}.json`);
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

suite('msa-typ4 Texte in ui.<lang>.json', () => {
  test('Name, Beschreibung, Einsatz; je Grund, Urteil und Deutung der Engine ein Text', async () => {
    for (const lang of LANGS) {
      const t = await ui(lang);
      for (const k of ['name', 'description', 'whenToUse', 'emptyState', ...ERROR_KEYS, ...VERDICT_KEYS, ...INTERP_KEYS]) {
        assertTrue(nonEmpty(t[k]), `${lang} ${k}`);
      }
      assertTrue(nonEmpty(t.charts.fitSeries), `${lang} charts.fitSeries`);
      assertTrue(nonEmpty(t.invariants.limitsOrder), `${lang} invariants.limitsOrder`);
      for (const k of ['actions', 'fields', 'types', 'title', 'titleLong']) assertTrue(!Object.hasOwn(t, k), `${lang} ${k} entfällt`);
    }
  });
  test('Reihe „Fit“ in beiden Sprachen wie die Altform', async () => {
    for (const lang of LANGS) assertTrue((await ui(lang)).charts.fitSeries === 'Fit', lang);
  });
});

suite('msa-typ4 Kontexthilfe in context-help.<lang>.json', () => {
  test('jedes Feld, Ansichtsfeld und jede Ableitung hat einen Hilfetext', async () => {
    const s = State.schema;
    const names = [...Object.keys(s.fields), ...Object.keys(s.view), ...Object.keys(s.derived)];
    for (const lang of LANGS) {
      const { fields } = await contextHelp(lang);
      for (const n of names) assertTrue(nonEmpty(fields[n]?.help), `${lang} fields.${n}`);
      for (const k of ['norm', 'pvMode', 'sigmaP', 'alpha']) assertTrue(nonEmpty(fields.params[k].help), `${lang} fields.params.${k}`);
      for (const k of ['LSL', 'USL']) assertTrue(nonEmpty(fields.params.tolerance[k].help), `${lang} fields.params.tolerance.${k}`);
      assertTrue(!('pickableColumns' in fields), `${lang} pickableColumns entfällt`);
    }
  });

  test('keine Aktionen; Typedefs Params mit verschachtelter Toleranz, Result.invalid, Invalid', async () => {
    for (const lang of LANGS) {
      const ch = await contextHelp(lang);
      assertTrue(!('actions' in ch), `${lang} actions entfällt`);
      assertDeepEqual(Object.keys(ch.types.Params), ['name', 'unit', 'norm', 'pvMode', 'tolerance', 'sigmaP', 'alpha'], lang);
      assertDeepEqual(Object.keys(ch.types.Params.tolerance), ['LSL', 'USL'], lang);
      assertTrue(nonEmpty(ch.types.Result.invalid), `${lang} Result.invalid`);
      assertDeepEqual(Object.keys(ch.types.Invalid), ['key', 'vars'], lang);
    }
  });

  test('kein „null“, kein „als Text“, kein „unter keys“ bei params und keine Aktionsnamen der Altform', async () => {
    for (const lang of LANGS) {
      const ch = await contextHelp(lang);
      const fieldsText = JSON.stringify(ch.fields);
      assertTrue(!/\bnull\b/.test(fieldsText), `${lang}: null`);
      assertTrue(!/als Text|as text/.test(fieldsText), `${lang}: als Text`);
      assertTrue(!/keys/.test(ch.fields.params.help), `${lang}: params ohne keys`);
      assertTrue(!/setParam|setColumn|pickableColumns/.test(JSON.stringify(ch)), `${lang}: alte Aktionen`);
      assertTrue(/0,1\b|0\.1\b/.test(ch.types.Params.alpha) && !/0[.,]10\b/.test(ch.types.Params.alpha), `${lang}: α 0,1`);
    }
  });
});
