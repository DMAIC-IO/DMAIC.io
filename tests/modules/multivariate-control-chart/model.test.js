/**
 * Multivariate Regelkarte: Model (domain/model.js) — Schema, Vorgaben,
 * Invariante und Ableitungen.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertThrows } from '../../test-utils.js';
import { State, ALPHA_DEFAULT } from '../../../js/modules/multivariate-control-chart/domain/model.js';
import { inputRows, optionsOf, analyze, resultOf, engineRuns } from '../../../js/modules/multivariate-control-chart/domain/analyze.js';
import { computeHotellingT2 } from '../../../js/engines/multivariate-chart-engine.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import controlChart from '../../../js/widgets/control-chart/schema.js';
import { sheetSource } from '../../helpers/sheet-source.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Übersetzer-Stub: zeigt Schlüssel und Parameter. */
const T = (k, p) => (p ? `«${k}:${JSON.stringify(p)}»` : `«${k}»`);

/** Spalten der Altprojekt-Fixture, dazu eine konstante, eine kurze und eine Textspalte. */
const DRUCK = [
  5.07, 5.05, 5.02, 5.11, 5.1, 4.85, 5.03, 5.1, 5.06, 5.1, 5.06, 4.8, 4.79, 4.81, 4.98,
  4.83, 4.99, 5.05, 4.56, 5.28, 4.99, 5.23, 5.31, 5.38, 5.35, 4.72, 4.95, 4.82, 4.81, 4.65,
];
const TEMP = [
  180.4, 182.2, 180.4, 180.7, 179.4, 178.5, 179.8, 182.1, 180.1, 182.3, 184.4, 178.7, 174.4, 177, 177.8,
  176.1, 181.5, 183.4, 170.6, 185.4, 180.7, 184, 187, 184.7, 174, 173.6, 178.7, 173.6, 175.8, 172,
];
const DICHTE = [
  1.207, 1.21, 1.21, 1.214, 1.192, 1.183, 1.191, 1.204, 1.213, 1.228, 1.2, 1.198, 1.174, 1.184, 1.179,
  1.179, 1.206, 1.199, 1.166, 1.218, 1.203, 1.213, 1.233, 1.225, 1.215, 1.176, 1.193, 1.182, 1.173, 1.163,
];
const SHEET = {
  druck: DRUCK, temp: TEMP, dichte: DICHTE,
  konst: DRUCK.map(() => 7), kurz: [1, 2], txt: ['1,5', 2, 3],
};
const SRC = sheetSource(SHEET, { names: { druck: 'Druck', temp: 'Temperatur', dichte: 'Dichte' } });

/** Stand der Altprojekt-Fixture (nach der Migration). */
const legacy = () => State.fromJSON({ columnRefs: [ref('druck'), ref('temp'), ref('dichte')], alpha: 0.01, baselineCount: 20, exampleWorksheetId: null });

/** @param {any} m @param {string[]} [names] */
const derived = (m, names) => evaluateDerived(m, SRC, names, T);

suite('multivariate-control-chart: Model — Schema und Vorgaben', () => {
  test('Spaltenfeld: Liste numerischer Bezüge ab drei Werten, Einträge nicht nullbar', () => {
    const c = State.schema.fields.columnRefs;
    assertEqual(c.kind, 'list');
    assertDeepEqual([...c.item.types], ['numeric']);
    assertEqual(c.item.minCount, 3);
    assertEqual(c.item.nullable, false);
  });

  test('α: offene Grenzen 0 und 1, Vorgabe gleich ALPHA_DEFAULT und der Engine', () => {
    const a = State.schema.fields.alpha;
    assertEqual(a.exclusiveMin, 0);
    assertEqual(a.exclusiveMax, 1);
    assertEqual(new State().alpha, ALPHA_DEFAULT);
    assertEqual(ALPHA_DEFAULT, 0.0027);
    const rows = DRUCK.map((v, i) => [v, TEMP[i]]);
    assertEqual(computeHotellingT2(rows).ucl, computeHotellingT2(rows, { alpha: ALPHA_DEFAULT }).ucl, 'Vorgabe der Engine');
  });

  test('baselineCount: ganze Zahl ab 1, nullbar, Vorgabe null', () => {
    const b = State.schema.fields.baselineCount;
    assertEqual(b.integer, true);
    assertEqual(b.min, 1);
    assertEqual(b.nullable, true);
  });

  test('Ansicht: Beispielblatt und Editor-Einstellungen des Diagramms', () => {
    assertDeepEqual(Object.keys(State.schema.view).sort(), ['chart', 'exampleWorksheetId']);
    assertEqual(State.schema.view.chart.kind, controlChart.edits().kind);
    assertDeepEqual(Object.keys(State.schema.fields).sort(), ['alpha', 'baselineCount', 'columnRefs']);
  });

  test('Vorgaben und kein Inhalt', () => {
    const m = new State();
    assertDeepEqual(plain(m.columnRefs), []);
    assertEqual(m.alpha, 0.0027);
    assertEqual(m.baselineCount, null);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
    assertEqual(m.hasContent(), false);
  });

  test('hasContent: Spalten, abweichendes α oder Phase I zählen, Ansichtsfelder nicht', () => {
    const a = new State(); a.columnRefs = [ref('druck')];
    assertEqual(a.hasContent(), true);
    const b = new State(); b.alpha = 0.01;
    assertEqual(b.hasContent(), true);
    const c = new State(); c.baselineCount = 20;
    assertEqual(c.hasContent(), true);
    const d = new State(); d.exampleWorksheetId = 'x';
    assertEqual(d.hasContent(), false);
  });
});

suite('multivariate-control-chart: Model — instance.set', () => {
  test('α: 0, 1, außerhalb und unlesbarer Text abgelehnt, Stand unverändert; 0,01 angenommen', () => {
    const m = new State();
    for (const v of [0, 1, 1.5, -0.1, 'abc', NaN, null]) {
      assertThrows(() => setFields(m, { alpha: v }), undefined, String(v));
      assertEqual(m.alpha, 0.0027, String(v));
    }
    assertDeepEqual(setFields(m, { alpha: 0.01 }), { alpha: 0.01 });
    assertEqual(m.alpha, 0.01);
  });

  test('α: Zahl als Text normalisiert der Kern zur Zahl', () => {
    const m = new State();
    assertDeepEqual(setFields(m, { alpha: '0.01' }), { alpha: 0.01 });
    assertEqual(m.alpha, 0.01);
  });

  test('baselineCount: 0, 2,5 und negativ abgelehnt; 20 und null angenommen', () => {
    const m = new State();
    for (const v of [0, 2.5, -1, 'abc']) {
      assertThrows(() => setFields(m, { baselineCount: v }), undefined, String(v));
      assertEqual(m.baselineCount, null, String(v));
    }
    assertDeepEqual(setFields(m, { baselineCount: 20 }), { baselineCount: 20 });
    assertEqual(m.baselineCount, 20);
    assertDeepEqual(setFields(m, { baselineCount: null }), { baselineCount: null });
    assertEqual(m.baselineCount, null);
  });

  test('columnRefs setzen und leeren', () => {
    const m = new State();
    setFields(m, { columnRefs: [ref('druck'), ref('temp')] });
    assertDeepEqual(plain(m.columnRefs), [ref('druck'), ref('temp')]);
    setFields(m, { columnRefs: [] });
    assertDeepEqual(plain(m.columnRefs), []);
  });

  test('columnRefs: kein Listenwert und null-Einträge abgelehnt', () => {
    const m = new State();
    setFields(m, { columnRefs: [ref('druck')] });
    for (const v of [ref('druck'), 'x', null, [null], [ref('druck'), null]]) {
      assertThrows(() => setFields(m, { columnRefs: v }), undefined, JSON.stringify(v));
      assertDeepEqual(plain(m.columnRefs), [ref('druck')], JSON.stringify(v));
    }
  });

  test('columnRefs: Doppelte abgelehnt mit invariant uniqueColumnRefs, Stand unverändert', () => {
    const m = new State();
    setFields(m, { columnRefs: [ref('druck'), ref('temp')] });
    let err = null;
    try { setFields(m, { columnRefs: [ref('druck'), ref('temp'), ref('druck')] }); } catch (e) { err = e; }
    assert(err, 'abgelehnt');
    assertEqual(err.invariant, 'uniqueColumnRefs');
    assertEqual(err.param, 'columnRefs');
    assertDeepEqual(plain(m.columnRefs), [ref('druck'), ref('temp')]);
  });

  test('gleiche Spalte in einem anderen Blatt ist kein Doppel', () => {
    const m = new State();
    const other = { instanceId: 'ws1', sheetId: 's2', columnId: 'druck' };
    setFields(m, { columnRefs: [ref('druck'), other] });
    assertEqual(m.columnRefs.length, 2);
  });

  test('Reparatur beim Laden behält je Bezug das erste Vorkommen; streng geladen abgelehnt', () => {
    const json = { _schema: { version: '1.0' }, columnRefs: [ref('temp'), ref('druck'), ref('temp')] };
    const m = State.fromJSON(json, { repair: true });
    assertDeepEqual(plain(m.columnRefs), [ref('temp'), ref('druck')]);
    assertThrows(() => State.fromJSON(json), /uniqueColumnRefs/);
  });
});

suite('multivariate-control-chart: Model — Ableitungen', () => {
  test('result: gleich der Rechnung der Altprojekt-Fixture (Literal in analyze.test.js)', () => {
    const { result } = derived(legacy(), ['result']);
    assertDeepEqual(result, resultOf(analyze(inputRows(legacy(), { values: (r) => SHEET[r.columnId] }), optionsOf(legacy()))));
    assertEqual(result.n, 30);
    assertEqual(result.p, 3);
    assertEqual(result.m, 20);
    assertEqual(result.cl, 3.3529411764705883);
    assertEqual(result.ucl, 18.254249708826574);
    assertDeepEqual(result.signals, [24]);
  });

  test('result folgt α und Phase I', () => {
    const m = legacy();
    m.alpha = 0.0027;
    m.baselineCount = null;
    const r = derived(m, ['result']).result;
    assertEqual(r.m, 30);
    assert(r.ucl > 18.254249708826574, 'kleineres α hebt die Grenze');
  });

  test('result: null unter zwei Bezügen und bei gelöschter Spalte; der Bezug bleibt', () => {
    assertEqual(derived(new State(), ['result']).result, null);
    const one = legacy(); one.columnRefs = [ref('druck')];
    assertEqual(derived(one, ['result']).result, null);
    const gone = legacy(); gone.columnRefs = [ref('druck'), ref('gone'), ref('temp')];
    const d = derived(gone, ['result', 'error', 'message', 'points']);
    assertEqual(d.result, null);
    assertEqual(d.error, null, 'keine Meldung');
    assertEqual(d.message, null);
    assertDeepEqual(d.points, []);
    assertEqual(gone.columnRefs.length, 3, 'der Bezug bleibt');
  });

  test('error und message: zu wenige Zeilen nennt p', () => {
    const m = legacy(); m.columnRefs = [ref('druck'), ref('kurz')];
    const d = derived(m, ['result', 'error', 'message']);
    assertEqual(d.result, null);
    assertEqual(d.error, 'errTooFewRows');
    assertEqual(d.message, '«errTooFewRows:{"p":2}»');
  });

  test('error und message: konstante Spalte → err_singular', () => {
    const m = legacy(); m.columnRefs = [ref('druck'), ref('konst')];
    const d = derived(m, ['error', 'message']);
    assertEqual(d.error, 'err_singular');
    assertEqual(d.message, '«err_singular»');
  });

  test('error und message: null mit Ergebnis', () => {
    const d = derived(legacy(), ['error', 'message']);
    assertEqual(d.error, null);
    assertEqual(d.message, null);
  });

  test('Text „1,5“ zählt nicht', () => {
    const m = legacy(); m.columnRefs = [ref('txt'), ref('druck')];
    assertEqual(derived(m, ['error']).error, 'errTooFewRows', 'zwei Zeilen bei p = 2');
  });

  test('points: je vollständiger Zeile eine Zeile, leer ohne Ergebnis', () => {
    const { points } = derived(legacy(), ['points']);
    assertEqual(points.length, 30);
    assertDeepEqual(Object.keys(points[0]), ['t2', 'signal']);
    assertEqual(points[24].signal, true);
    assertDeepEqual(derived(new State(), ['points']).points, []);
  });

  test('points ist eine Massenableitung', () => {
    assertDeepEqual([...State.schema.derivedBulk], ['points']);
  });

  test('activeParams und activeMultiSlots', () => {
    const d = derived(legacy(), ['activeParams', 'activeMultiSlots']);
    assertDeepEqual(d.activeParams, ['alpha', 'baselineCount']);
    assertDeepEqual(d.activeMultiSlots, ['columnRefs']);
  });

  test('alle Ableitungen zusammen rufen die Engine einmal', () => {
    const m = legacy(); m.alpha = 0.02;
    const n = engineRuns();
    const d = evaluateDerived(m, SRC, undefined, T);
    assertDeepEqual(Object.keys(d).sort(), ['activeMultiSlots', 'activeParams', 'error', 'message', 'points', 'result']);
    assertEqual(engineRuns(), n + 1);
    evaluateDerived(m, SRC, undefined, T);
    assertEqual(engineRuns(), n + 1, 'erneutes Lesen rechnet nicht');
  });

  test('alle Ableitungen ohne Wurf, auch ohne Übersetzer mit Ergebnis', () => {
    const d = evaluateDerived(legacy(), SRC);
    assert(d.result && !('error' in d.result), 'result ohne Fehler');
    assertEqual(d.message, null);
  });
});
