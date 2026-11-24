/**
 * Messverlaufsdiagramm: Model (domain/model.js) — Schema, Vorgaben und Ableitungen.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertThrows } from '../../test-utils.js';
import {
  State, GAGE_INFO_KEYS, MIN_PARTS_PER_ROW, MAX_PARTS_PER_ROW, DEFAULT_PARTS_PER_ROW,
} from '../../../js/modules/gage-run-chart/domain/model.js';
import { analyze, inputColumns, resultOf, engineRuns } from '../../../js/modules/gage-run-chart/domain/analyze.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import { sourceColumns } from '../../../js/core/source-columns.js';
import GageRunChart from '../../../js/widgets/gage-run-chart/schema.js';
import { sheetSource } from '../../helpers/sheet-source.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Übersetzer-Stub: die Ableitungen übersetzen nicht, der Stub zeigt es. */
const T = (k) => `«${k}»`;

/** Spalten der Altprojekt-Fixture, dazu eine Spalte ohne verwertbare Zahl. */
const TEIL = [1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4];
const PRUEFER = ['A', 'A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'A', 'B', 'B'];
const D = [10.02, 10.04, 10.06, 10.08, 10.12, 10.1, 10.14, null, 9.98, 10, 10.03, 10.05, 10.2, 10.22, 10.24, 10.26];
const SHEET = { teil: TEIL, pruefer: PRUEFER, d: D, txt: TEIL.map(() => 'x') };
const SRC = sheetSource(SHEET, { names: { teil: 'Teil', pruefer: 'Prüfer', d: 'Durchmesser' } });

/** Stand der Altprojekt-Fixture (nach der Migration). */
const legacy = () => State.fromJSON({
  columnRefs: { part: ref('teil'), operator: ref('pruefer'), measurement: ref('d') },
  refValue: '10,5', partsPerRow: 2, showOperatorMean: false, connectWithin: false,
  gageInfo: { name: 'Messschieber MS-07', date: '2026-06-07', reporter: 'M. Wasserthal', tolerance: '0,2 mm', misc: 'Altprojekt' },
  exampleWorksheetId: null,
});

/** @param {any} m @param {string[]} [names] */
const derived = (m, names) => evaluateDerived(m, SRC, names, T);

suite('gage-run-chart: Model — Schema und Vorgaben', () => {
  test('Spaltenfelder: nullbar, Messwert mit Typfilter, kein minCount', () => {
    const f = State.schema.fields;
    for (const k of ['part', 'operator', 'measurement']) {
      assertEqual(f[k].kind, 'columnRef', k);
      assertEqual(f[k].nullable, true, k);
      assertEqual(f[k].minCount, 0, k);
    }
    assertEqual(f.part.types, null);
    assertEqual(f.operator.types, null);
    assertDeepEqual([...f.measurement.types], ['numeric', 'binary', 'percent', 'currency']);
  });

  test('Inhalts- und Ansichtsfelder', () => {
    assertDeepEqual(Object.keys(State.schema.fields).sort(), [
      'connectWithin', 'gageInfo', 'measurement', 'operator', 'part', 'partsPerRow', 'refValue', 'showOperatorMean',
    ]);
    assertDeepEqual(Object.keys(State.schema.view).sort(), ['exampleWorksheetId', 'runStripEdits']);
    const e = State.schema.view.runStripEdits;
    assertEqual(e.kind, 'map');
    assertEqual(e.key.kind, 'number');
    assertEqual(e.key.integer, true);
    assertEqual(e.value.kind, GageRunChart.edits().kind);
  });

  test('GAGE_INFO_KEYS gleich den Schlüsseln des record, in Anzeigereihenfolge', () => {
    assertDeepEqual([...GAGE_INFO_KEYS], ['name', 'date', 'reporter', 'tolerance', 'misc']);
    assertEqual(State.schema.fields.gageInfo.kind, 'record');
    assertDeepEqual([...State.schema.fields.gageInfo.keys], [...GAGE_INFO_KEYS]);
  });

  test('Grenzen der Teile je Streifen', () => {
    assertEqual(MIN_PARTS_PER_ROW, 1);
    assertEqual(MAX_PARTS_PER_ROW, 20);
    assertEqual(DEFAULT_PARTS_PER_ROW, 7);
    const p = State.schema.fields.partsPerRow;
    assertEqual(p.min, 1); assertEqual(p.max, 20); assertEqual(p.integer, true);
  });

  test('Vorgaben und kein Inhalt', () => {
    const m = new State();
    for (const k of ['part', 'operator', 'measurement', 'refValue', 'exampleWorksheetId']) assertEqual(m[k], null, k);
    assertEqual(m.partsPerRow, 7);
    assertEqual(m.connectWithin, true);
    assertEqual(m.showOperatorMean, true);
    assertDeepEqual(plain(m.gageInfo), { name: '', date: '', reporter: '', tolerance: '', misc: '' });
    assertDeepEqual(plain(m.runStripEdits), {});
    assertEqual(m.hasContent(), false);
  });

  test('hasContent: jede Abweichung im Inhalt zählt, Ansichtsfelder nicht', () => {
    const a = new State(); a.measurement = ref('d');
    assertEqual(a.hasContent(), true);
    const b = new State(); setFields(b, { gageInfo: { name: 'X', date: '', reporter: '', tolerance: '', misc: '' } });
    assertEqual(b.hasContent(), true);
    const c = new State(); c.connectWithin = false;
    assertEqual(c.hasContent(), true);
    const d = new State(); d.exampleWorksheetId = 'x';
    assertEqual(d.hasContent(), false);
  });
});

suite('gage-run-chart: Model — instance.set', () => {
  test('partsPerRow: 0, 21, 2,5 abgelehnt, 1 und 20 angenommen', () => {
    const m = new State();
    for (const v of [0, 21, 2.5]) {
      assertThrows(() => setFields(m, { partsPerRow: v }), undefined, String(v));
      assertEqual(m.partsPerRow, 7, String(v));
    }
    setFields(m, { partsPerRow: 1 }); assertEqual(m.partsPerRow, 1);
    setFields(m, { partsPerRow: 20 }); assertEqual(m.partsPerRow, 20);
  });

  test('refValue: Zahl und null; Komma- und Freitext, NaN, Infinity abgelehnt', () => {
    const m = new State();
    setFields(m, { refValue: 10.5 }); assertEqual(m.refValue, 10.5);
    setFields(m, { refValue: -3 }); assertEqual(m.refValue, -3);
    setFields(m, { refValue: null }); assertEqual(m.refValue, null);
    setFields(m, { refValue: 2 });
    for (const v of ['10,5', '', 'abc', NaN, Infinity, true]) {
      assertThrows(() => setFields(m, { refValue: v }), undefined, String(v));
      assertEqual(m.refValue, 2, String(v));
    }
    // Zahltext mit Dezimalpunkt nimmt der Kern an (`requireNumber`) und speichert die Zahl.
    setFields(m, { refValue: '20' });
    assertEqual(m.refValue, 20);
  });

  test('gageInfo: ganzes Objekt; Fremdschlüssel oder Nicht-Text abgelehnt', () => {
    const m = new State();
    const info = { name: 'N', date: 'D', reporter: 'R', tolerance: 'T', misc: 'M' };
    setFields(m, { gageInfo: info });
    assertDeepEqual(plain(m.gageInfo), info);
    assertThrows(() => setFields(m, { gageInfo: { ...info, extra: 'x' } }));
    assertThrows(() => setFields(m, { gageInfo: { ...info, name: 5 } }));
    assertDeepEqual(plain(m.gageInfo), info);
  });

  test('Schalter nehmen nur Wahrheitswerte, Spalten Bezüge oder null', () => {
    const m = new State();
    assertThrows(() => setFields(m, { connectWithin: 'ja' }));
    assertEqual(m.connectWithin, true);
    setFields(m, { showOperatorMean: false }); assertEqual(m.showOperatorMean, false);
    setFields(m, { operator: ref('pruefer') });
    assertDeepEqual(plain(m.operator), ref('pruefer'));
    setFields(m, { operator: null }); assertEqual(m.operator, null);
  });
});

suite('gage-run-chart: Model — Ableitungen', () => {
  test('result: gleich der Rechnung der Altprojekt-Fixture', () => {
    const { result } = derived(legacy(), ['result']);
    const m = legacy();
    assertDeepEqual(result, resultOf(analyze(inputColumns(m, sourceColumns(SRC))), m));
    assertEqual(result.n, 15);
    assertEqual(result.droppedRows, 1);
    assertEqual(result.partCount, 4);
    assertEqual(result.operatorCount, 2);
    assertEqual(result.refValue, 10.5);
    assertEqual(result.grandMean.toFixed(4), '10.1027');
    assertDeepEqual(result.warnings, ['unbalanced', 'droppedRows']);
    assertEqual(result.cellMeans.length, 8);
  });

  test('result folgt dem Bezugswert, ohne die Engine zu rufen', () => {
    const m = legacy();
    derived(m, ['result']);
    const before = engineRuns();
    m.refValue = null;
    assertEqual(derived(m, ['result']).result.refValue, 10.102666666666668);
    m.partsPerRow = 1; m.connectWithin = true;
    setFields(m, { gageInfo: { name: 'X', date: '', reporter: '', tolerance: '', misc: '' } });
    derived(m);
    assertEqual(engineRuns(), before);
  });

  test('result: null ohne Spalte, bei n = 0 und bei gelöschter Spalte', () => {
    assertEqual(derived(new State(), ['result']).result, null);
    const m = legacy();
    m.measurement = ref('txt');
    assertEqual(derived(m, ['result']).result, null, 'n = 0');
    m.measurement = ref('gone');
    assertEqual(derived(m, ['result']).result, null, 'Messwert gelöscht');
    assertDeepEqual(plain(m.measurement), ref('gone'), 'der Bezug bleibt');
    const o = legacy();
    o.operator = ref('gone');
    assertEqual(derived(o, ['result']).result, null, 'Prüfer gelöscht');
    assertDeepEqual(plain(o.operator), ref('gone'), 'der Bezug bleibt');
    o.operator = null;
    assertEqual(derived(o, ['result']).result.hasOperators, false, 'ohne Prüfer');
  });

  test('points: je Messwert eine Zeile, leer ohne Ergebnis', () => {
    const { points } = derived(legacy(), ['points']);
    assertEqual(points.length, 15);
    assertDeepEqual(points[0], { part: '1', operator: 'A', value: 10.02 });
    assertDeepEqual(derived(new State(), ['points']).points, []);
    const m = legacy(); m.operator = ref('gone');
    assertDeepEqual(derived(m, ['points']).points, []);
  });

  test('points ist eine Massenableitung', () => {
    assertDeepEqual([...State.schema.derivedBulk], ['points']);
  });

  test('activeParams und activeColumnSlots', () => {
    const d = derived(legacy(), ['activeParams', 'activeColumnSlots']);
    assertDeepEqual(d.activeParams, ['refValue', 'partsPerRow', 'connectWithin', 'showOperatorMean', 'gageInfo']);
    assertDeepEqual(d.activeColumnSlots, ['part', 'operator', 'measurement']);
    assertDeepEqual(derived(new State(), ['activeColumnSlots']).activeColumnSlots, ['part', 'operator', 'measurement']);
  });

  test('alle Ableitungen ohne Wurf, auch ohne Übersetzer', () => {
    const d = evaluateDerived(legacy(), SRC);
    assertDeepEqual(Object.keys(d).sort(), ['activeColumnSlots', 'activeParams', 'points', 'result']);
    assert(d.result && !('error' in d.result), 'result ohne Fehler');
  });
});
