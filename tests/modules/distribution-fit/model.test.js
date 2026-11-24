/**
 * Verteilungstest: Model (domain/model.js) — Schema, Vorgaben und Ableitungen.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertThrows } from '../../test-utils.js';
import { State } from '../../../js/modules/distribution-fit/domain/model.js';
import { DATA_TYPES, analyze, buildResult } from '../../../js/modules/distribution-fit/domain/analyze.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import histogramChart from '../../../js/widgets/histogram-chart/schema.js';
import { sheetSource } from '../../helpers/sheet-source.js';

const plain = (v) => JSON.parse(JSON.stringify(v));
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });
/** Übersetzer-Stub: die Ableitungen übersetzen nicht, der Stub zeigt es. */
const T = (k) => `«${k}»`;

/** Spalte „Fehler“ der Altprojekt-Fixture, dazu eine zu kurze, eine konstante und eine Textspalte. */
const F = [3, 5, 2, 4, 6, 3, 1, 4, 5, 2, 7, 3, 4, 0, 5, 3, 2, 6, 4, 3, 8, 2, 4, 5, 3, 1, 4, 9, 3, 5];
const SRC = sheetSource({
  f: F, short: [1, 2, 3, 4], flat: [2, 2, 2, 2, 2, 2], txt: ['1,5', '2', '3', '4', '5', '6'],
}, { names: { f: 'Fehler' } });

/** Stand der Altprojekt-Fixture (nach der Migration). */
const legacy = () => State.fromJSON({ columnRef: ref('f'), dataType: 'discrete', exampleWorksheetId: null });

/** @param {any} m @param {string[]} [names] */
const derived = (m, names) => evaluateDerived(m, SRC, names, T);

suite('distribution-fit: Model — Schema und Vorgaben', () => {
  test('dataType-Literale gleich DATA_TYPES, Inhaltsfeld', () => {
    assertDeepEqual([...State.schema.fields.dataType.values], [...DATA_TYPES]);
    assertEqual(Object.hasOwn(State.schema.view, 'dataType'), false, 'kein Ansichtsfeld');
  });

  test('Spaltenfeld: numerisch, mindestens ein Wert, nullbar', () => {
    const c = State.schema.fields.columnRef;
    assertDeepEqual([...c.types], ['numeric']);
    assertEqual(c.minCount, 1);
    assertEqual(c.nullable, true);
  });

  test('Ansicht: Beispielblatt und Editor-Einstellungen des Histogramms', () => {
    assertDeepEqual(Object.keys(State.schema.view).sort(), ['chart', 'exampleWorksheetId']);
    assertEqual(State.schema.view.chart.kind, histogramChart.edits().kind);
    assertDeepEqual(Object.keys(State.schema.fields).sort(), ['columnRef', 'dataType']);
  });

  test('Vorgaben und kein Inhalt', () => {
    const m = new State();
    assertEqual(m.columnRef, null);
    assertEqual(m.dataType, 'auto');
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
    assertEqual(m.hasContent(), false);
  });

  test('hasContent: Spalte oder abweichender Datentyp zählt, Ansichtsfelder nicht', () => {
    const a = new State(); a.columnRef = ref('f');
    assertEqual(a.hasContent(), true);
    const b = new State(); b.dataType = 'discrete';
    assertEqual(b.hasContent(), true);
    const c = new State(); c.exampleWorksheetId = 'x';
    assertEqual(c.hasContent(), false);
  });

  test("instance.set: dataType 'normal' abgelehnt, Stand unverändert; gültige Werte angenommen", () => {
    const m = new State();
    assertThrows(() => setFields(m, { dataType: 'normal' }));
    assertEqual(m.dataType, 'auto');
    assertDeepEqual(setFields(m, { dataType: 'continuous' }), { dataType: 'continuous' });
    assertEqual(m.dataType, 'continuous');
    setFields(m, { columnRef: ref('f') });
    assertDeepEqual(plain(m.columnRef), ref('f'));
    setFields(m, { columnRef: null });
    assertEqual(m.columnRef, null);
  });
});

suite('distribution-fit: Model — Ableitungen', () => {
  test('result: gleich der Rechnung der Altprojekt-Fixture', () => {
    const m = legacy();
    const { result } = derived(m, ['result']);
    assertDeepEqual(result, buildResult(analyze(F, 'discrete'), 'discrete'));
    assertEqual(result.stats.n, 30);
    assertDeepEqual(result.results.map((r) => r.name), ['Poisson', 'Binomial']);
    assertEqual(result.results[0].params['λ'].toFixed(4), '3.8667');
    assertEqual(result.results[0].chi2.chi2.toFixed(4), '0.8995');
    assertEqual(result.results[0].chi2.p.toFixed(4), '0.9703');
    assertEqual(result.stats.mean.toFixed(4), '3.8667');
    assertEqual(result._dataType, 'discrete');
  });

  test('result folgt dem Datentyp', () => {
    const m = legacy();
    m.dataType = 'auto';
    const types = new Set(derived(m, ['result']).result.results.map((r) => r.type));
    assertDeepEqual([...types].sort(), ['cont', 'disc']);
    m.dataType = 'continuous';
    assertEqual(derived(m, ['result']).result.results.every((r) => r.type === 'cont'), true);
  });

  test('result: null ohne Spalte, unter fünf, bei Varianz null, bei gelöschter Spalte und bei Text', () => {
    assertEqual(derived(new State(), ['result']).result, null);
    const m = legacy();
    m.columnRef = ref('short');
    assertEqual(derived(m, ['result']).result, null);
    m.columnRef = ref('flat');
    assertEqual(derived(m, ['result']).result, null);
    m.columnRef = ref('gone');
    assertEqual(derived(m, ['result']).result, null);
    assertDeepEqual(plain(m.columnRef), ref('gone'), 'der Bezug bleibt');
    m.columnRef = ref('txt');
    assertEqual(derived(m, ['result']).result, null, 'nur Zahlen zählen');
  });

  test('activeParams und activeColumnSlots', () => {
    const d = derived(legacy(), ['activeParams', 'activeColumnSlots']);
    assertDeepEqual(d.activeParams, ['dataType']);
    assertDeepEqual(d.activeColumnSlots, ['columnRef']);
    assertDeepEqual(derived(new State(), ['activeParams']).activeParams, ['dataType']);
  });

  test('alle Ableitungen ohne Wurf, auch ohne Übersetzer', () => {
    const d = evaluateDerived(legacy(), SRC);
    assertDeepEqual(Object.keys(d).sort(), ['activeColumnSlots', 'activeParams', 'result']);
    assert(d.result && !('error' in d.result), 'result ohne Fehler');
  });
});
