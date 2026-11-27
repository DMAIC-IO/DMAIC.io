/**
 * Messverlaufsdiagramm: die Rechnung (domain/analyze.js) gegen die Altrechnung.
 * Die Literale stammen aus dem Altmodul (`_runAnalysis`, `read().result`)
 * für die Altprojekt-Fixture und das Beispiel `msa-gage-run-chart-attributiv`.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertDeepClose } from '../../test-utils.js';
import {
  inputColumns, analyze, engineRuns, resolveRefValue, stripRows, resultOf, pointsOf, noDataOf,
} from '../../../js/modules/gage-run-chart/domain/analyze.js';

const plain = (v) => JSON.parse(JSON.stringify(v));

/** Spalten der Altprojekt-Fixture (16 Zeilen, Zeile 8 ohne Messwert). */
const TEIL = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4];
const PRUEFER = ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'A', 'B', 'B'];
const DURCHMESSER = [
  10.02, 10.04, 10.06, 10.08, 10.12, 10.1, 10.14, null,
  9.98, 10, 10.03, 10.05, 10.2, 10.22, 10.24, 10.26,
];

/** `read().result` des Altmoduls für die Altprojekt-Fixture (Bezugswert „10,5“). */
const LEGACY_RESULT = {
  n: 15, droppedRows: 1, partCount: 4, operatorCount: 2, operators: ['A', 'B'], hasOperators: true,
  grandMean: 10.102666666666668, refValue: 10.5, yMin: 9.98, yMax: 10.26,
  warnings: ['unbalanced', 'droppedRows'],
  cellMeans: [
    { part: '1', operator: 'A', mean: 10.03 }, { part: '1', operator: 'B', mean: 10.07 },
    { part: '2', operator: 'A', mean: 10.11 }, { part: '2', operator: 'B', mean: 10.14 },
    { part: '3', operator: 'A', mean: 9.99 }, { part: '3', operator: 'B', mean: 10.04 },
    { part: '4', operator: 'A', mean: 10.21 }, { part: '4', operator: 'B', mean: 10.25 },
  ],
};

/** Dasselbe ohne Prüferspalte (Altmodul, Prüferbezug leer). */
const LEGACY_RESULT_NO_OP = {
  ...LEGACY_RESULT, operatorCount: 0, operators: [''], hasOperators: false,
  cellMeans: [
    { part: '1', operator: '', mean: 10.049999999999999 }, { part: '2', operator: '', mean: 10.12 },
    { part: '3', operator: '', mean: 10.015 }, { part: '4', operator: '', mean: 10.23 },
  ],
};

/** Spalten des Beispiels: 13 Prüfeinheiten × 3 Prüfer × 2 Wiederholungen, binär. */
const EX_PARTS = [3, 4, 5, 8, 9, 10, 15, 17, 19, 20, 22, 24, 26];
const EX_PART = EX_PARTS.flatMap((p) => Array(6).fill(p));
const EX_OP = EX_PARTS.flatMap(() => ['D', 'D', 'E', 'E', 'F', 'F']);
const EX_RESULT = EX_PART.map((_, i) => (i === 55 ? 0 : 1));

/** `read().result` des Altmoduls für das Beispiel; Bezugswert „“ bzw. „0,5“. */
const EXAMPLE_RESULT = {
  n: 78, droppedRows: 0, partCount: 13, operatorCount: 3, operators: ['D', 'E', 'F'], hasOperators: true,
  grandMean: 0.9871794871794872, refValue: 0.9871794871794872, yMin: 0, yMax: 1, warnings: [],
  cellMeans: EX_PARTS.flatMap((p) => ['D', 'E', 'F'].map((o) => (
    { part: String(p), operator: o, mean: p === 20 && o === 'D' ? 0.5 : 1 }))),
};

const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Spaltenleser wie `sourceColumns` über ein Wörterbuch Spalten-Id → Werte. */
const reader = (cols) => ({ values: (r) => cols[r.columnId] ?? null });
const READ = reader({ teil: TEIL, pruefer: PRUEFER, d: DURCHMESSER });
const legacyModel = { part: ref('teil'), operator: ref('pruefer'), measurement: ref('d') };

suite('gage-run-chart: inputColumns', () => {
  test('Rohwerte der drei Spalten, unverändert', () => {
    const c = inputColumns(legacyModel, READ);
    assertDeepEqual(c, { parts: TEIL, operators: PRUEFER, measurements: DURCHMESSER });
  });

  test('ohne Prüferspalte operators: null', () => {
    assertEqual(inputColumns({ ...legacyModel, operator: null }, READ).operators, null);
  });

  test('ohne Teile- oder Messwertspalte null', () => {
    assertEqual(inputColumns({ ...legacyModel, part: null }, READ), null);
    assertEqual(inputColumns({ ...legacyModel, measurement: null }, READ), null);
  });

  test('gelöschte Spalte → null, auch die Prüferspalte', () => {
    assertEqual(inputColumns({ ...legacyModel, part: ref('gone') }, READ), null);
    assertEqual(inputColumns({ ...legacyModel, measurement: ref('gone') }, READ), null);
    assertEqual(inputColumns({ ...legacyModel, operator: ref('gone') }, READ), null);
  });
});

suite('gage-run-chart: analyze und Merker', () => {
  test('ohne Eingabe null', () => {
    assertEqual(analyze(null), null);
  });

  test('gleiche Listen → dasselbe Objekt, keine neue Rechnung', () => {
    const a = analyze(inputColumns(legacyModel, READ));
    const before = engineRuns();
    const b = analyze({ parts: [...TEIL], operators: [...PRUEFER], measurements: [...DURCHMESSER] });
    assert(a === b, 'dasselbe Ergebnisobjekt');
    assertEqual(engineRuns(), before);
  });

  test('andere Zahl → neue Rechnung, Zähler steigt um eins', () => {
    const a = analyze(inputColumns(legacyModel, READ));
    const before = engineRuns();
    const d2 = [...DURCHMESSER]; d2[0] = 10.03;
    const b = analyze({ parts: TEIL, operators: PRUEFER, measurements: d2 });
    assert(a !== b, 'neues Ergebnis');
    assertEqual(engineRuns(), before + 1);
    analyze({ parts: TEIL, operators: PRUEFER, measurements: d2 });
    assertEqual(engineRuns(), before + 1, 'zweiter Leser rechnet nicht');
  });

  test('Prüferspalte weg oder dazu → neue Rechnung', () => {
    analyze({ parts: TEIL, operators: PRUEFER, measurements: DURCHMESSER });
    const before = engineRuns();
    const a = analyze({ parts: TEIL, operators: null, measurements: DURCHMESSER });
    assertEqual(a.hasOperators, false);
    assertEqual(engineRuns(), before + 1);
    analyze({ parts: TEIL, operators: null, measurements: DURCHMESSER });
    assertEqual(engineRuns(), before + 1);
    assertEqual(analyze({ parts: TEIL, operators: PRUEFER, measurements: DURCHMESSER }).hasOperators, true);
    assertEqual(engineRuns(), before + 2);
  });

  test('Änderung der übergebenen Liste nach dem Aufruf täuscht den Merker nicht', () => {
    const d = [...DURCHMESSER];
    const a = analyze({ parts: TEIL, operators: PRUEFER, measurements: d });
    d[0] = 99;
    const b = analyze({ parts: TEIL, operators: PRUEFER, measurements: d });
    assert(a !== b, 'neu gerechnet');
    assertEqual(b.yMax, 99);
  });
});

suite('gage-run-chart: resolveRefValue', () => {
  test('Zahl gilt, null nimmt das Gesamtmittel (Fälle der Altform nach der Migration)', () => {
    assertEqual(resolveRefValue(3.5, 10), 3.5);
    assertEqual(resolveRefValue(20, 10), 20);
    assertEqual(resolveRefValue(0, 10), 0);
    assertEqual(resolveRefValue(null, 10), 10);
  });
});

suite('gage-run-chart: resultOf — gegen die Altrechnung', () => {
  const a = () => analyze(inputColumns(legacyModel, READ));

  test('Altprojekt: Literal des Altmoduls (Bezugswert 10,5)', () => {
    assertDeepClose(plain(resultOf(a(), { refValue: 10.5 })), LEGACY_RESULT);
  });

  test('Altprojekt: ohne Bezugswert das Gesamtmittel', () => {
    assertDeepClose(resultOf(a(), { refValue: null }).refValue, LEGACY_RESULT.grandMean);
  });

  test('Altprojekt ohne Prüferspalte', () => {
    const r = resultOf(analyze(inputColumns({ ...legacyModel, operator: null }, READ)), { refValue: 10.5 });
    assertDeepClose(plain(r), LEGACY_RESULT_NO_OP);
  });

  test('Beispiel: Literal des Altmoduls, Bezugswert null und 0,5', () => {
    const ex = analyze({ parts: EX_PART, operators: EX_OP, measurements: EX_RESULT });
    assertDeepClose(plain(resultOf(ex, { refValue: null })), EXAMPLE_RESULT);
    assertDeepClose(plain(resultOf(ex, { refValue: 0.5 })), { ...EXAMPLE_RESULT, refValue: 0.5 });
    assertEqual(stripRows(ex, 7).length, 2, 'zwei Streifen');
  });

  test('null ohne Ergebnis und bei n = 0', () => {
    assertEqual(resultOf(null, { refValue: null }), null);
    const empty = analyze({ parts: ['', null], operators: null, measurements: [1, 2] });
    assertEqual(empty.n, 0);
    assertEqual(resultOf(empty, { refValue: 3 }), null);
  });
});

suite('gage-run-chart: stripRows, pointsOf, noDataOf', () => {
  test('stripRows teilt die Felder je Streifen', () => {
    const a = analyze(inputColumns(legacyModel, READ));
    assertDeepEqual(stripRows(a, 2).map((r) => r.map((p) => p.part)), [['1', '2'], ['3', '4']]);
    assertDeepEqual(stripRows(a, 7).map((r) => r.length), [4]);
    assertDeepEqual(stripRows(a, 1).length, 4);
  });

  test('stripRows leer ohne Ergebnis oder bei n = 0', () => {
    assertDeepEqual(stripRows(null, 7), []);
    assertDeepEqual(stripRows(analyze({ parts: [null], operators: null, measurements: [1] }), 7), []);
  });

  test('pointsOf: je Messwert eine Zeile in Feldfolge', () => {
    const pts = pointsOf(analyze(inputColumns(legacyModel, READ)));
    assertEqual(pts.length, 15);
    assertDeepEqual(pts.slice(0, 3), [
      { part: '1', operator: 'A', value: 10.02 },
      { part: '1', operator: 'A', value: 10.04 },
      { part: '1', operator: 'B', value: 10.06 },
    ]);
    assertDeepEqual(pts[14], { part: '4', operator: 'B', value: 10.26 });
    assertDeepEqual(pointsOf(null), []);
  });

  test('noDataOf: nur wenn gerechnet wurde und n = 0', () => {
    assertEqual(noDataOf(null), false);
    assertEqual(noDataOf(analyze(inputColumns(legacyModel, READ))), false);
    assertEqual(noDataOf(analyze({ parts: [null], operators: null, measurements: ['x'] })), true);
  });
});
