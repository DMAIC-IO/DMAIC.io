/**
 * MSA Typ 4: Migration '0→1.0' — jeder Fall des alten fromJSON und die drei
 * Instanzen des Altprojekts aus den E2E-Fixtures.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import { State } from '../../../js/modules/msa-typ4/domain/model.js';

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const REF = { instanceId: 'ws', sheetId: 's', columnId: 'c' };
const DEFAULT_PARAMS = {
  name: '', unit: 'mm', norm: 'AIAG', pvMode: 'tolerance', tolerance: { LSL: null, USL: null }, sigmaP: null, alpha: 0.05,
};
const strip = ({ _schema, ...rest }) => rest;

/** Streng laden (ohne Reparatur): wirft, wenn die Migration Ungültiges liefert. */
const load = (json) => State.fromJSON(json, { context: CTX });
const params = (json) => { const p = load(json).params; return { ...p, tolerance: { ...p.tolerance } }; };

suite('MSA Typ 4 Migration — Vorgaben und Robustheit', () => {
  test('leerer Stand, fehlende oder kaputte params ergeben die Vorgaben', () => {
    assertDeepEqual(params({}), DEFAULT_PARAMS);
    assertDeepEqual(params({ params: 'x' }), DEFAULT_PARAMS);
    assertDeepEqual(params({ params: { tolerance: 7 } }), DEFAULT_PARAMS);
    const m = load({ refColumn: 7 });
    assertEqual(m.refColumn, null);
    assertEqual(m.measColumn, null);
    assertEqual(m.exampleWorksheetId, null);
  });
  test('Name nur als Text; Einheit nur nichtleerer Text, sonst mm', () => {
    assertEqual(params({ params: { name: 5 } }).name, '');
    assertEqual(params({ params: { name: 'Bolzen' } }).name, 'Bolzen');
    assertEqual(params({ params: { unit: '' } }).unit, 'mm');
    assertEqual(params({ params: { unit: 3 } }).unit, 'mm');
    assertEqual(params({ params: { unit: 'µm' } }).unit, 'µm');
  });
  test('Norm und Bezugsstreuung nur bekannt, sonst Vorgabe', () => {
    assertEqual(params({ params: { norm: 'VDA5', pvMode: 'sixSigma' } }).norm, 'VDA5');
    assertEqual(params({ params: { pvMode: 'sixSigma' } }).pvMode, 'sixSigma');
    assertEqual(params({ params: { norm: 'X' } }).norm, 'AIAG');
    assertEqual(params({ params: { pvMode: 1 } }).pvMode, 'tolerance');
  });
  test('Grenzen und σP: Zahl, Text mit Dezimalkomma oder Tausenderpunkt; Leeres, NaN und Unlesbares leer', () => {
    assertDeepEqual(params({ params: { tolerance: { LSL: '0', USL: '12,0' } } }).tolerance, { LSL: 0, USL: 12 });
    assertDeepEqual(params({ params: { tolerance: { LSL: 9.8, USL: '1.200,5' } } }).tolerance, { LSL: 9.8, USL: 1200.5 });
    assertEqual(params({ params: { sigmaP: '0,5' } }).sigmaP, 0.5);
    assertEqual(params({ params: { sigmaP: 0.3 } }).sigmaP, 0.3);
    for (const v of [null, '', 'zehn', NaN, undefined]) {
      assertEqual(params({ params: { sigmaP: v } }).sigmaP, null, String(v));
      assertEqual(params({ params: { tolerance: { LSL: v } } }).tolerance.LSL, null, String(v));
    }
  });
  test('α: Treffer einer Stufe auf 1e-9 als Zahl oder Text, sonst 0,05', () => {
    for (const [v, want] of [[0.1, 0.1], ['0.10', 0.1], ['0.1', 0.1], ['0,1', 0.1], ['0.01', 0.01], [0.01, 0.01],
      [0.05, 0.05], [0.1 + 1e-12, 0.1]]) {
      assertEqual(params({ params: { alpha: v } }).alpha, want, String(v));
    }
    for (const v of ['abc', '', null, 0.2, 0.104, NaN, Infinity, '0.1abc']) {
      assertEqual(params({ params: { alpha: v } }).alpha, 0.05, String(v));
    }
  });
  test('Spaltenbezüge nur vollständig, Werte als Text', () => {
    const m = load({ refColumn: { ...REF }, measColumn: { instanceId: 'ws', sheetId: 's' } });
    assertDeepEqual(m.refColumn, REF);
    assertEqual(m.measColumn, null);
    assertDeepEqual(load({ measColumn: { instanceId: 1, sheetId: 2, columnId: 3 } }).measColumn,
      { instanceId: '1', sheetId: '2', columnId: '3' });
  });
  test('exampleWorksheetId nur als Text; Unbekanntes entfällt', () => {
    assertEqual(load({ exampleWorksheetId: 'ws9', lastResult: {}, params: { extra: 1 } }).exampleWorksheetId, 'ws9');
    assertEqual(load({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
    assertEqual('extra' in load({ params: { extra: 1 } }).toJSON().params, false);
    assertEqual('lastResult' in load({ lastResult: {} }).toJSON(), false);
  });
});

suite('MSA Typ 4 Migration — Altprojekt der E2E-Fixture', () => {
  const WS = '5e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4c';
  const ref = (columnId) => ({ instanceId: WS, sheetId: 'sheet_1', columnId });
  const A = {
    params: { name: 'Bolzen alt', unit: 'µm', norm: 'AIAG', pvMode: 'tolerance', tolerance: { LSL: '0', USL: '12,0' }, sigmaP: '', alpha: '0.10' },
    refColumn: ref('c-ref'), measColumn: ref('c-meas'), exampleWorksheetId: 'ws-alt-beispiel',
  };
  const B = {
    params: { name: 'Bolzen VDA', unit: '', norm: 'VDA5', pvMode: 'sixSigma', tolerance: { LSL: 12, USL: 0 }, sigmaP: '0,5', alpha: 0.01 },
    refColumn: ref('c-ref'), measColumn: ref('c-meas'), exampleWorksheetId: null,
  };
  const C = {
    params: { name: 'Altstand defekt', norm: 'X', pvMode: 1, tolerance: { LSL: null, USL: 'abc' }, sigmaP: 'zehn', alpha: 'abc' },
    refColumn: { instanceId: WS, sheetId: 'sheet_1' }, measColumn: ref('c-meas'), exampleWorksheetId: null,
  };
  const loadRepaired = (json) => {
    const reports = [];
    const m = State.fromJSON(json, { repair: true, onRepair: (n) => reports.push(n), context: CTX });
    return { m, reports };
  };

  test('(a) AIAG mit Grenzen als Text lädt ohne Reparatur', () => {
    const { m, reports } = loadRepaired(A);
    assertDeepEqual(reports, []);
    assertDeepEqual({ ...m.params, tolerance: { ...m.params.tolerance } }, {
      name: 'Bolzen alt', unit: 'µm', norm: 'AIAG', pvMode: 'tolerance', tolerance: { LSL: 0, USL: 12 }, sigmaP: null, alpha: 0.1,
    });
    assertDeepEqual(m.refColumn, ref('c-ref'));
    assertDeepEqual(m.measColumn, ref('c-meas'));
    assertEqual(m.exampleWorksheetId, 'ws-alt-beispiel');
  });
  test('(b) VDA 5 mit LSL > USL: Reparatur leert USL, Einheit mm', () => {
    const { m, reports } = loadRepaired(B);
    assertTrue(reports.length > 0, 'Reparatur gemeldet');
    assertDeepEqual({ ...m.params, tolerance: { ...m.params.tolerance } }, {
      name: 'Bolzen VDA', unit: 'mm', norm: 'VDA5', pvMode: 'sixSigma', tolerance: { LSL: 12, USL: null }, sigmaP: 0.5, alpha: 0.01,
    });
  });
  test('(c) defekt: Vorgaben statt Unlesbarem, unvollständiger Bezug leer', () => {
    const { m, reports } = loadRepaired(C);
    assertDeepEqual(reports, []);
    assertDeepEqual({ ...m.params, tolerance: { ...m.params.tolerance } }, { ...DEFAULT_PARAMS, name: 'Altstand defekt' });
    assertEqual(m.refColumn, null);
    assertDeepEqual(m.measColumn, ref('c-meas'));
  });
  test('zweites Laden der Zielform ändert nichts', () => {
    const once = load(A).toJSON();
    assertDeepEqual(strip(load(once).toJSON()), strip(once));
  });
});
