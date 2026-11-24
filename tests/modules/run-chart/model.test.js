/**
 * Verlaufsdiagramm: Model (domain/model.js) — Schema, Vorgaben und Ableitungen.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertThrows } from '../../test-utils.js';
import { State } from '../../../js/modules/run-chart/domain/model.js';
import { analyze, resultOf } from '../../../js/modules/run-chart/domain/analyze.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import runChart from '../../../js/widgets/run-chart/schema.js';
import { sheetSource } from '../../helpers/sheet-source.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Übersetzer-Stub: die Ableitungen übersetzen nicht, der Stub zeigt es. */
const T = (k) => `«${k}»`;

/** Spalte „Durchmesser“ der Altprojekt-Fixture, dazu eine zu kurze und eine Textspalte. */
const D = [
  9.96, 9.98, 10.01, 10.03, 10, 10.02, 10.04, 10.05, 10.03, 10.06, 10.08, 10.07,
  10.36, 10.38, 10.41, 10.43, 10.4, 10.42, 10.44, 10.45, 10.43, 10.46, 10.48, 10.47,
];
const SRC = sheetSource({ d: D, short: [1, 2], txt: ['1,5', 2, 3, 4] }, { names: { d: 'Durchmesser' } });

/** Stand der Altprojekt-Fixture (nach der Migration). */
const legacy = () => State.fromJSON({ columnRef: ref('d'), alpha: 0.1, exampleWorksheetId: null });

/** @param {any} m @param {string[]} [names] */
const derived = (m, names) => evaluateDerived(m, SRC, names, T);

suite('run-chart: Model — Schema und Vorgaben', () => {
  test('Spaltenfeld: numerisch, mindestens zwei Werte, nullbar', () => {
    const c = State.schema.fields.columnRef;
    assertDeepEqual([...c.types], ['numeric']);
    assertEqual(c.minCount, 2);
    assertEqual(c.nullable, true);
  });

  test('α: Inhaltsfeld mit offenen Grenzen 0 und 1, Vorgabe 0,05', () => {
    const a = State.schema.fields.alpha;
    assertEqual(a.exclusiveMin, 0);
    assertEqual(a.exclusiveMax, 1);
    assertEqual(Object.hasOwn(State.schema.view, 'alpha'), false, 'kein Ansichtsfeld');
  });

  test('Ansicht: Beispielblatt und Editor-Einstellungen des Diagramms', () => {
    assertDeepEqual(Object.keys(State.schema.view).sort(), ['chart', 'exampleWorksheetId']);
    assertEqual(State.schema.view.chart.kind, runChart.edits().kind);
    assertDeepEqual(Object.keys(State.schema.fields).sort(), ['alpha', 'columnRef']);
  });

  test('Vorgaben und kein Inhalt', () => {
    const m = new State();
    assertEqual(m.columnRef, null);
    assertEqual(m.alpha, 0.05);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
    assertEqual(m.hasContent(), false);
  });

  test('hasContent: Spalte oder abweichendes α zählt, Ansichtsfelder nicht', () => {
    const a = new State(); a.columnRef = ref('d');
    assertEqual(a.hasContent(), true);
    const b = new State(); b.alpha = 0.1;
    assertEqual(b.hasContent(), true);
    const c = new State(); c.exampleWorksheetId = 'x';
    assertEqual(c.hasContent(), false);
  });

  test('instance.set: α 0, 1, 1,5, −0,1 abgelehnt, Stand unverändert; 0,01 angenommen', () => {
    const m = new State();
    for (const a of [0, 1, 1.5, -0.1]) {
      assertThrows(() => setFields(m, { alpha: a }), undefined, String(a));
      assertEqual(m.alpha, 0.05, String(a));
    }
    assertDeepEqual(setFields(m, { alpha: 0.01 }), { alpha: 0.01 });
    assertEqual(m.alpha, 0.01);
    setFields(m, { columnRef: ref('d') });
    assertDeepEqual(plain(m.columnRef), ref('d'));
    setFields(m, { columnRef: null });
    assertEqual(m.columnRef, null);
  });
});

suite('run-chart: Model — Ableitungen', () => {
  test('result: gleich der Rechnung der Altprojekt-Fixture', () => {
    const { result } = derived(legacy(), ['result']);
    assertDeepEqual(result, resultOf(analyze(D), 0.1));
    assertEqual(result.n, 24);
    assertEqual(result.median.toFixed(4), '10.2200');
    assertEqual(result.runsAboutMedian, 2);
    assertEqual(result.runsUpDown, 12);
    assertEqual(result.flagged, 2);
    assertDeepEqual(result.tests.map((t) => t.p.toFixed(4)), ['0.0000', '1.0000', '0.0324', '0.9676']);
  });

  test('result folgt α', () => {
    const m = legacy();
    m.alpha = 0.01;
    assertEqual(derived(m, ['result']).result.flagged, 1);
  });

  test('result: null ohne Spalte, unter drei, bei gelöschter Spalte und bei Text', () => {
    assertEqual(derived(new State(), ['result']).result, null);
    const m = legacy();
    m.columnRef = ref('short');
    assertEqual(derived(m, ['result']).result, null);
    m.columnRef = ref('gone');
    assertEqual(derived(m, ['result']).result, null);
    assertDeepEqual(plain(m.columnRef), ref('gone'), 'der Bezug bleibt');
    m.columnRef = ref('txt');
    assertEqual(derived(m, ['result']).result.n, 3, 'Text „1,5“ zählt nicht');
  });

  test('points: je Wert eine Zeile, leer ohne Ergebnis', () => {
    const { points } = derived(legacy(), ['points']);
    assertEqual(points.length, 24);
    assertDeepEqual(points[0], { value: 9.96 });
    assertDeepEqual(points[23], { value: 10.47 });
    assertDeepEqual(derived(new State(), ['points']).points, []);
    const m = legacy(); m.columnRef = ref('gone');
    assertDeepEqual(derived(m, ['points']).points, []);
  });

  test('points ist eine Massenableitung', () => {
    assertDeepEqual([...State.schema.derivedBulk], ['points']);
  });

  test('activeParams und activeColumnSlots', () => {
    const d = derived(legacy(), ['activeParams', 'activeColumnSlots']);
    assertDeepEqual(d.activeParams, ['alpha']);
    assertDeepEqual(d.activeColumnSlots, ['columnRef']);
    assertDeepEqual(derived(new State(), ['activeColumnSlots']).activeColumnSlots, ['columnRef']);
  });

  test('alle Ableitungen ohne Wurf, auch ohne Übersetzer', () => {
    const d = evaluateDerived(legacy(), SRC);
    assertDeepEqual(Object.keys(d).sort(), ['activeColumnSlots', 'activeParams', 'points', 'result']);
    assert(d.result && !('error' in d.result), 'result ohne Fehler');
  });
});
