/**
 * MSA Typ 6: Migration '0→1.0' — jeder Fall des alten fromJSON und die zwei
 * Instanzen des Altprojekts aus den E2E-Fixtures.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/msa-typ6/domain/model.js';

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const REF = { instanceId: 'ws', sheetId: 's', columnId: 'c' };
const DEFAULT_PARAMS = {
  measurementName: '', unit: 'mm', chartType: 'i-mr', limitsMode: 'from-study', baselineK: 20,
  mu0: null, sigma0: null, enabledRules: [1, 2, 3, 4, 5, 6], alpha: 0.05,
};
const strip = ({ _schema, ...rest }) => rest;

/** Streng laden (ohne Reparatur): wirft, wenn die Migration Ungültiges liefert. */
const load = (json) => State.fromJSON(json, { context: CTX });
const params = (json) => { const p = load(json).params; return { ...p, enabledRules: [...p.enabledRules] }; };

suite('MSA Typ 6 Migration — Vorgaben und Robustheit', () => {
  test('leerer Stand, fehlende oder kaputte params ergeben die Vorgaben', () => {
    assertDeepEqual(params({}), DEFAULT_PARAMS);
    assertDeepEqual(params({ params: 'x' }), DEFAULT_PARAMS);
    const m = load({ columns: 7 });
    assertDeepEqual({ ...m.columns }, { timestamp: null, value: null, subgroup: null });
    assertEqual(m.sourceTyp1InstanceId, null);
    assertEqual(m.exampleWorksheetId, null);
  });
  test('Name nur als Text; Einheit nur nichtleerer Text, sonst mm', () => {
    assertEqual(params({ params: { measurementName: 5 } }).measurementName, '');
    assertEqual(params({ params: { unit: '' } }).unit, 'mm');
    assertEqual(params({ params: { unit: 'µm' } }).unit, 'µm');
  });
  test('Kartentyp und Grenzen-Modus nur bekannt, sonst Vorgabe', () => {
    assertEqual(params({ params: { chartType: 'xbar-r', limitsMode: 'given' } }).chartType, 'xbar-r');
    assertEqual(params({ params: { chartType: 'xbar-s' } }).chartType, 'i-mr');
    assertEqual(params({ params: { limitsMode: 'auto' } }).limitsMode, 'from-study');
  });
  test('baselineK: positive Ganzzahl über Number(), sonst 20', () => {
    assertEqual(params({ params: { baselineK: '7' } }).baselineK, 7);
    assertEqual(params({ params: { baselineK: 3 } }).baselineK, 3);
    for (const v of [0, -2, 2.5, 'abc', null]) assertEqual(params({ params: { baselineK: v } }).baselineK, 20, String(v));
  });
  test('μ₀/σ₀: endliche Zahl über Number(), sonst leer', () => {
    assertEqual(params({ params: { mu0: 10.002, sigma0: '0.5' } }).mu0, 10.002);
    assertEqual(params({ params: { sigma0: '0.5' } }).sigma0, 0.5);
    for (const v of [null, '', 'abc', '0,5', NaN]) assertEqual(params({ params: { mu0: v } }).mu0, null, String(v));
  });
  test('Regeln: kein Array → 1–6, Texte über Number, Unbekanntes fällt, [] bleibt []', () => {
    assertDeepEqual(params({ params: { enabledRules: 'x' } }).enabledRules, [1, 2, 3, 4, 5, 6]);
    assertDeepEqual(params({ params: { enabledRules: ['3', '1', 3, 9, 'x'] } }).enabledRules, [1, 3]);
    assertDeepEqual(params({ params: { enabledRules: [] } }).enabledRules, []);
  });
  test('α: Zahl über zwei Stellen, Text wörtlich aus der Liste, sonst 0,05', () => {
    assertEqual(params({ params: { alpha: 0.1 } }).alpha, 0.1);
    assertEqual(params({ params: { alpha: '0.10' } }).alpha, 0.1);
    assertEqual(params({ params: { alpha: '0.01' } }).alpha, 0.01);
    assertEqual(params({ params: { alpha: 0.05 } }).alpha, 0.05);
    for (const v of ['0.1', '0,05', 0.2, null]) assertEqual(params({ params: { alpha: v } }).alpha, 0.05, String(v));
  });
  test('Spaltenbezug nur vollständig, Werte als Text', () => {
    const m = load({ columns: { value: { instanceId: 'ws', sheetId: 's', columnId: 'c' }, timestamp: { instanceId: 'ws' }, subgroup: { instanceId: 1, sheetId: 2, columnId: 3 } } });
    assertDeepEqual(m.columns.value, REF);
    assertEqual(m.columns.timestamp, null);
    assertDeepEqual(m.columns.subgroup, { instanceId: '1', sheetId: '2', columnId: '3' });
  });
  test('Typ-1-Quelle wandert aus params nach oben; Unbekanntes entfällt', () => {
    const m = load({ params: { sourceTyp1InstanceId: 't1', extra: 1 }, lastResult: {}, exampleWorksheetId: 'ws9' });
    assertEqual(m.sourceTyp1InstanceId, 't1');
    assertEqual(m.exampleWorksheetId, 'ws9');
    assertEqual('sourceTyp1InstanceId' in m.params, false);
    assertEqual(load({ params: { sourceTyp1InstanceId: 5 } }).sourceTyp1InstanceId, null);
  });
});

suite('MSA Typ 6 Migration — Altprojekt der E2E-Fixture', () => {
  const WS = '6f1a2b3c-4d5e-4f60-8a1b-2c3d4e5f6a7b';
  const ref = (sheetId, columnId) => ({ instanceId: WS, sheetId, columnId });
  const A = {
    params: { measurementName: 'Welle alt', unit: 'µm', chartType: 'i-mr', limitsMode: 'given', baselineK: '7', mu0: 10.002, sigma0: null, sourceTyp1InstanceId: 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b', enabledRules: ['1', '3'], alpha: 0.1 },
    columns: { timestamp: ref('sheet_t6', 'c-time'), value: ref('sheet_t6', 'c-value'), subgroup: null },
    exampleWorksheetId: 'ws-alt-beispiel',
  };
  const B = {
    params: { measurementName: 'Kolben alt', unit: 'mm', chartType: 'xbar-r', limitsMode: 'from-study', baselineK: 20, mu0: null, sigma0: null, sourceTyp1InstanceId: null, enabledRules: [], alpha: '0.01' },
    columns: { timestamp: ref('sheet_t6', 'c-time'), value: ref('sheet_t6', 'c-value'), subgroup: ref('sheet_t6', 'c-subgroup') },
    exampleWorksheetId: null,
  };

  test('(a) Grenzen vorgegeben mit Typ-1-Quelle lädt ohne Reparatur', () => {
    let repaired = false;
    const m = State.fromJSON(A, { repair: true, onRepair: () => { repaired = true; }, context: CTX });
    assertEqual(repaired, false);
    assertDeepEqual({ ...m.params, enabledRules: [...m.params.enabledRules] }, {
      measurementName: 'Welle alt', unit: 'µm', chartType: 'i-mr', limitsMode: 'given', baselineK: 7,
      mu0: 10.002, sigma0: null, enabledRules: [1, 3], alpha: 0.1,
    });
    assertEqual(m.sourceTyp1InstanceId, 'e5f6a7b8-c9d0-4e1f-8a2b-3c4d5e6f7a8b');
    assertDeepEqual(m.columns.value, ref('sheet_t6', 'c-value'));
    assertEqual(m.exampleWorksheetId, 'ws-alt-beispiel');
  });
  test('(b) x̄-R ohne Regeln, α als Text lädt ohne Reparatur', () => {
    let repaired = false;
    const m = State.fromJSON(B, { repair: true, onRepair: () => { repaired = true; }, context: CTX });
    assertEqual(repaired, false);
    assertDeepEqual([...m.params.enabledRules], []);
    assertEqual(m.params.alpha, 0.01);
    assertEqual(m.params.chartType, 'xbar-r');
    assertDeepEqual(m.columns.subgroup, ref('sheet_t6', 'c-subgroup'));
  });
  test('zweites Laden der Zielform ändert nichts', () => {
    const once = load(A).toJSON();
    assertDeepEqual(strip(load(once).toJSON()), strip(once));
  });
});
