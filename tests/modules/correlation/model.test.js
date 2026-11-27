/**
 * Korrelation: Model (domain/model.js) und Rechnung (domain/analyze.js) —
 * Schema, Vorgaben, Invariante, Modus, Fehlergründe, Merker.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertThrows } from '../../test-utils.js';
import { State } from '../../../js/modules/correlation/domain/model.js';
import { analyze, engineRuns, METHODS } from '../../../js/modules/correlation/domain/analyze.js';
import { runCorrelationAnalysis } from '../../../js/engines/correlation-engine.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import { sheetSource } from '../../helpers/sheet-source.js';

const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Übersetzer-Stub: zeigt Schlüssel und Parameter. */
const T = (k, p) => (p ? `«${k}:${JSON.stringify(p)}»` : `«${k}»`);
const X = [10, 12, 8, 15, 25, 20, 18, 22, 30, 28];
const Y = [20, 22, 18, 30, 45, 38, 35, 40, 55, 50];
const Z = [5, 6, 4, 7, 12, 10, 9, 11, 15, 14];
const SHEET = {
  x: X, y: Y, z: Z,
  konst: X.map(() => 42),
  a: [1, 2, 3, 4, 5, null, null], b: [null, null, 3, 4, 5, 6, 7],
};
const SRC = sheetSource(SHEET, { names: { x: 'X', y: 'Y', z: 'Z' } });
const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
/** @param {string[]} cols @param {object} [rest] */
const make = (cols, rest = {}) => State.fromJSON({ _schema: { version: '1.0' }, colRefs: cols.map(ref), ...rest }, { context: CTX });
/** @param {any} m @param {string[]} [names] */
const derived = (m, names) => evaluateDerived(m, SRC, names, T);

suite('correlation: Model — Schema und Vorgaben', () => {
  test('Spaltenfeld: Liste nicht nullbarer Bezüge, Arten und mindestens 5 Werte', () => {
    const c = State.schema.fields.colRefs;
    assertEqual(c.kind, 'list');
    assertEqual(c.item.nullable, false);
    assertDeepEqual([...c.item.types], ['numeric', 'currency', 'percent', 'date', 'time']);
    assertEqual(c.item.minCount, 5);
  });

  test('Koeffizienten im Schema gleich denen der Rechnung', () => {
    assertDeepEqual([...State.schema.fields.matrixMethod.values], [...METHODS]);
  });

  test('Konfidenz aus dem Kontext, geklemmt; frisch ohne Spalten', () => {
    assertEqual(new State({ ...CTX, confidenceLevel: 90 }).confidenceLevel, 0.9);
    assertEqual(new State({ ...CTX, confidenceLevel: 40 }).confidenceLevel, 0.5);
    const m = new State();
    assertEqual(m.confidenceLevel, 0.95);
    assertDeepEqual(plain(m.colRefs), []);
    assertEqual(m.matrixMethod, 'pearson');
    assertEqual(m.filterMinR, null);
  });

  test('Konfidenz außerhalb [0,5; 0,9999] und Filter außerhalb [0; 1] abgelehnt', () => {
    const m = new State();
    assertThrows(() => setFields(m, { confidenceLevel: 0.4 }), /confidenceLevel/);
    assertThrows(() => setFields(m, { confidenceLevel: 1 }), /confidenceLevel/);
    assertThrows(() => { m.filterMinR = 1.5; }, /filterMinR/);
    m.filterMinR = 0.5;
    m.filterMaxP = null;
    assertEqual(m.filterMinR, 0.5);
  });

  test('hasContent: erst mit einer gewählten Spalte', () => {
    const m = new State();
    assertEqual(m.hasContent(), false);
    m.filterMinR = 0.3;
    setFields(m, { matrixMethod: 'kendall' });
    assertEqual(m.hasContent(), false);
    setFields(m, { colRefs: [ref('x')] });
    assertEqual(m.hasContent(), true);
  });
});

suite('correlation: Model — Invariante', () => {
  test('doppelte Spalte abgelehnt', () => {
    const m = make(['x']);
    assertThrows(() => setFields(m, { colRefs: [ref('x'), ref('y'), ref('x')] }), /uniqueColumnRefs/);
    assertDeepEqual(plain(m.colRefs), [ref('x')]);
  });

  test('Reparatur beim Laden: Doppelte fallen, die erste bleibt', () => {
    const repaired = [];
    const m = State.fromJSON({ _schema: { version: '1.0' }, colRefs: [ref('y'), ref('x'), ref('y')] },
      { repair: true, onRepair: (f) => repaired.push(f) });
    assertDeepEqual(plain(m.colRefs), [ref('y'), ref('x')]);
    assert(repaired.length > 0);
  });
});

suite('correlation: Ableitungen', () => {
  test('ohne oder mit einer Spalte: nichts, kein Fehler', () => {
    for (const cols of [[], ['x']]) {
      const d = derived(make(cols));
      assertEqual(d.mode, 'none');
      assertEqual(d.result, null);
      assertEqual(d.matrixResult, null);
      assertEqual(d.error, null);
      assertDeepEqual(d.pairs, []);
      assertDeepEqual(d.activeParams, ['confidenceLevel']);
      assertDeepEqual(d.activeMultiSlots, ['colRefs']);
    }
  });

  test('zwei Spalten: Ergebnis der Engine mit Namen, Rohpaare im Massenfeld', () => {
    const d = derived(make(['x', 'y'], { confidenceLevel: 0.9 }));
    assertEqual(d.mode, 'pairwise');
    assertDeepEqual(d.activeParams, ['confidenceLevel']);
    const engine = JSON.parse(JSON.stringify(runCorrelationAnalysis(X, Y, 0.9)));
    assertDeepEqual(plain(d.result), { ...engine, _nameX: 'X', _nameY: 'Y' });
    assertEqual('_x' in d.result, false);
    assertDeepEqual(plain(d.pairs), [{ i: 0, j: 1, x: X, y: Y }]);
    assertEqual(d.error, null);
  });

  test('Reihenfolge zählt: die erste Spalte ist X', () => {
    const d = derived(make(['y', 'x']));
    assertEqual(d.result._nameX, 'Y');
    assertDeepEqual(plain(d.pairs[0].x), Y);
  });

  test('unter 4 Paaren: errMin4 mit n und Text', () => {
    const d = derived(make(['a', 'b']));
    assertEqual(d.mode, 'none');
    assertEqual(d.result, null);
    assertDeepEqual(plain(d.error), { reason: 'errMin4', n: 3, message: '«errMin4:{"n":3}»' });
  });

  test('ohne Streuung: errZeroVariance', () => {
    const d = derived(make(['konst', 'y']));
    assertDeepEqual(plain(d.error), { reason: 'errZeroVariance', message: '«errZeroVariance»' });
    assertEqual(d.mode, 'none');
  });

  test('gelöschte Spalte: Bezug bleibt, errColumnMissing, keine Rechnung über die übrigen', () => {
    for (const cols of [['x', 'weg'], ['x', 'y', 'weg']]) {
      const m = make(cols);
      const d = derived(m);
      assertEqual(m.colRefs.length, cols.length);
      assertEqual(d.mode, 'none');
      assertEqual(d.result, null);
      assertEqual(d.matrixResult, null);
      assertDeepEqual(d.pairs, []);
      assertEqual(d.error.reason, 'errColumnMissing');
      assertEqual(d.error.message, '«errColumnMissing»');
    }
  });

  test('drei Spalten: Matrix symmetrisch, Diagonale 1, Paare oberhalb', () => {
    const d = derived(make(['x', 'y', 'z'], { matrixMethod: 'kendall' }));
    assertEqual(d.mode, 'matrix');
    assertDeepEqual(d.activeParams, ['confidenceLevel', 'matrixMethod']);
    const mr = d.matrixResult;
    assertDeepEqual(plain(mr.names), ['X', 'Y', 'Z']);
    for (const meth of METHODS) {
      assertEqual(mr.matrix[meth][1][1], 1);
      assertEqual(mr.matrix[meth][0][1], mr.matrix[meth][1][0]);
      assertEqual(mr.ciMatrix[meth][0][0], null);
    }
    assertEqual('pairs' in mr, false);
    assertDeepEqual(d.pairs.map((p) => `${p.i}-${p.j}`), ['0-1', '0-2', '1-2']);
    assertDeepEqual(plain(mr.nMatrix), [[10, 10, 10], [10, 10, 10], [10, 10, 10]]);
  });

  test('Matrix: nicht berechenbare Zelle ist null, kein NaN, kein Paar', () => {
    const d = derived(make(['a', 'b', 'x']));
    const mr = d.matrixResult;
    for (const meth of METHODS) {
      assertEqual(mr.matrix[meth][0][1], null);
      assertEqual(mr.matrix[meth][1][0], null);
      assertEqual(mr.pMatrix[meth][0][1], null);
    }
    assertEqual(mr.nMatrix[0][1], 3);
    assertEqual(mr.nMatrix[0][0], 5);
    assertDeepEqual(d.pairs.map((p) => `${p.i}-${p.j}`), ['0-2', '1-2']);
  });

  test('Merker: eine Rechnung je Stand, zwei Instanzen verdrängen einander nicht', () => {
    const a = make(['x', 'y']);
    const b = make(['x', 'y', 'z']);
    analyze(a, SRC);
    analyze(b, SRC);
    const before = engineRuns();
    derived(a);
    derived(b);
    analyze(a, SRC);
    assertEqual(engineRuns(), before);
    setFields(a, { confidenceLevel: 0.9 });
    analyze(a, SRC);
    assertEqual(engineRuns(), before + 1);
  });

  test('Datenänderung rechnet neu', () => {
    const sheet = { x: [...X], y: [...Y] };
    const src = sheetSource(sheet);
    const m = make(['x', 'y']);
    const r1 = analyze(m, src).result.pearson.r;
    sheet.y = [...Y].reverse();
    const r2 = analyze(m, src).result.pearson.r;
    assert(r1 !== r2);
  });
});

/** @param {any} v */
function plain(v) { return JSON.parse(JSON.stringify(v)); }
