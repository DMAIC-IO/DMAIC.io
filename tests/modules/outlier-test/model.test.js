/**
 * Ausreißertest: Model (domain/model.js) — Schema, Vorgaben, Invariante,
 * Kommando und Ableitungen.
 */
import { suite, test, assert, assertEqual, assertDeepEqual, assertThrows } from '../../test-utils.js';
import { State } from '../../../js/modules/outlier-test/domain/model.js';
import { ALL_METHODS, VALID_SIDES, PARAM_KEYS, analyze, buildResult } from '../../../js/modules/outlier-test/domain/analyze.js';
import { evaluateDerived } from '../../../js/core/derived.js';
import { setFields } from '../../../js/core/model.js';
import individualValuePlotChart from '../../../js/widgets/individual-value-plot-chart/schema.js';
import { sheetSource, spySource } from '../../helpers/sheet-source.js';

const CTX = { cycle: 'dmaic', confidenceLevel: 95, power: 80 };
const plain = (v) => JSON.parse(JSON.stringify(v));
const ref = (c) => ({ instanceId: 'ws1', sheetId: 's1', columnId: c });

/** Spalte „Durchmesser“ der Altprojekt-Fixture, dazu eine zu kurze und eine Textspalte. */
const D = [10.02, 9.98, 10.01, 9.97, 10.03, 10, 9.99, 10.02, 10.01, 9.98, 10, 10.03, 9.97, 10.01, 9.99, 10.02, 10, 9.98, 10.01, 10.45];
const SRC = sheetSource({ d: D, short: [1, 2], txt: ['1,5', '2', '3', '4'] }, { names: { d: 'Durchmesser' } });

/** Stand der Altprojekt-Fixture (nach der Migration). */
const legacy = () => State.fromJSON({
  colRef: ref('d'), alpha: 0.1, side: 'upper', tukeyFactor: 2, hampelK: 2.5, zThreshold: 2.5,
  modZThreshold: 3, esdMaxOutliers: 3, enabled: ['z-score', 'grubbs', 'tukey-iqr', 'generalized-esd'],
  chartMethod: 'grubbs', exampleWorksheetId: null,
}, { context: CTX });

/** @param {any} m @param {string[]} [names] */
const derived = (m, names) => evaluateDerived(m, spySource(SRC), names);

suite('outlier-test: Model — Schema und Vorgaben', () => {
  test('Schema-Literale gleich ALL_METHODS und VALID_SIDES', () => {
    const f = State.schema.fields;
    assertDeepEqual([...f.enabled.item.values], [...ALL_METHODS]);
    assertDeepEqual([...f.side.values], [...VALID_SIDES]);
    assertDeepEqual([...State.schema.view.chartMethod.values], ['all', ...ALL_METHODS]);
    assertDeepEqual([...State.schema.commands.toggleMethod.params.method.values], [...ALL_METHODS]);
    assertDeepEqual(plain(new State(CTX).enabled), [...ALL_METHODS]);
    assertEqual(f.enabled.sorted ?? false, false, 'ohne sorted');
  });

  test('Spaltenfeld: numerisch, mindestens drei Werte, nullbar', () => {
    const c = State.schema.fields.colRef;
    assertDeepEqual([...c.types], ['numeric']);
    assertEqual(c.minCount, 3);
    assertEqual(c.nullable, true);
  });

  test('Vorgaben und kein Inhalt', () => {
    const m = new State(CTX);
    assertEqual(m.colRef, null);
    assertEqual(m.alpha, 0.05);
    assertEqual(m.side, 'two-sided');
    assertEqual(m.tukeyFactor, 1.5);
    assertEqual(m.hampelK, 3);
    assertEqual(m.zThreshold, 3);
    assertEqual(m.modZThreshold, 3.5);
    assertEqual(m.esdMaxOutliers, null);
    assertEqual(m.chartMethod, 'all');
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {});
    assertEqual(State.schema.view.chart.kind, individualValuePlotChart.edits().kind);
    assertEqual(m.hasContent(), false);
  });

  test('alpha aus dem Konfidenzniveau, auf den Bereich geklemmt', () => {
    assertEqual(new State({ ...CTX, confidenceLevel: 90 }).alpha, 0.1);
    assertEqual(new State({ ...CTX, confidenceLevel: 40 }).alpha, 0.5);
    assertEqual(new State({ ...CTX, confidenceLevel: 99.995 }).alpha, 0.0001);
  });

  test('hasContent: Spalte oder ein abweichender Parameter zählt, Ansichtsfelder nicht', () => {
    const a = new State(CTX); a.colRef = ref('d');
    assertEqual(a.hasContent(), true);
    const b = new State(CTX); b.tukeyFactor = 2;
    assertEqual(b.hasContent(), true);
    const c = new State(CTX); c.chartMethod = 'grubbs'; c.exampleWorksheetId = 'x';
    assertEqual(c.hasContent(), false);
  });

  test('Bereiche: außerhalb wird abgelehnt, Ränder angenommen', () => {
    const m = new State(CTX);
    assertThrows(() => { m.alpha = 0.6; });
    assertThrows(() => { m.alpha = 0; });
    m.alpha = 0.0001;
    assertEqual(m.alpha, 0.0001);
    assertThrows(() => { m.tukeyFactor = 0.05; });
    assertThrows(() => { m.hampelK = 21; });
    assertThrows(() => { m.zThreshold = 11; });
    assertThrows(() => { m.modZThreshold = 0; });
    assertThrows(() => { m.esdMaxOutliers = 51; });
    assertThrows(() => { m.esdMaxOutliers = 2.5; });
    assertThrows(() => { m.side = 'both'; });
    m.esdMaxOutliers = 50;
    m.esdMaxOutliers = null;
    assertEqual(m.esdMaxOutliers, null);
  });
});

suite('outlier-test: Model — toggleMethod und Invariante enabledNotEmpty', () => {
  test('an und aus, immer in fester Reihenfolge', () => {
    const m = State.fromJSON({ _schema: { version: '1.0' }, enabled: ['z-score'] }, { context: CTX });
    m.execute({ type: 'toggleMethod', method: 'grubbs', on: true });
    m.toggleMethod({ method: 'hampel', on: true });
    assertDeepEqual(plain(m.enabled), ['grubbs', 'hampel', 'z-score']);
    m.toggleMethod({ method: 'grubbs', on: true });
    assertDeepEqual(plain(m.enabled), ['grubbs', 'hampel', 'z-score']);
    m.toggleMethod({ method: 'hampel', on: false });
    assertDeepEqual(plain(m.enabled), ['grubbs', 'z-score']);
  });

  test('unbekanntes Verfahren wird abgelehnt', () => {
    const m = new State(CTX);
    assertThrows(() => m.toggleMethod({ method: 'nope', on: true }));
    assertThrows(() => m.toggleMethod({ method: 'grubbs', on: 'ja' }));
  });

  test('das letzte Verfahren abwählen wird abgelehnt, Stand unverändert', () => {
    const m = State.fromJSON({ _schema: { version: '1.0' }, enabled: ['grubbs'] }, { context: CTX });
    let err;
    try { m.toggleMethod({ method: 'grubbs', on: false }); } catch (e) { err = e; }
    assertEqual(err?.invariant, 'enabledNotEmpty');
    assertDeepEqual(plain(m.enabled), ['grubbs']);
  });

  test('instance.set enabled: [] wird abgelehnt; jede Reihenfolge angenommen, Doppelte entfallen', () => {
    const m = new State(CTX);
    let err;
    try { setFields(m, { enabled: [] }); } catch (e) { err = e; }
    assertEqual(err?.invariant, 'enabledNotEmpty');
    assertDeepEqual(plain(m.enabled), [...ALL_METHODS]);
    setFields(m, { enabled: ['hampel', 'hampel'] });
    assertDeepEqual(plain(m.enabled), ['hampel']);
    assertThrows(() => setFields(m, { enabled: ['nope'] }));
    setFields(m, { enabled: ['z-score', 'grubbs'] });
    assertDeepEqual(plain(m.enabled), ['z-score', 'grubbs']);
  });

  test('Laden mit Reparatur: enabled [] wird zu allen sieben, onRepair meldet', () => {
    const reports = [];
    const m = State.fromJSON({ _schema: { version: '1.0' }, enabled: [] },
      { repair: true, onRepair: (n) => reports.push(n), context: CTX });
    assertDeepEqual(plain(m.enabled), [...ALL_METHODS]);
    assert(reports.length > 0, 'onRepair gemeldet');
  });
});

suite('outlier-test: Model — Ableitungen', () => {
  test('result: gleich der Rechnung der Altprojekt-Fixture', () => {
    const m = legacy();
    const { result } = derived(m, ['result']);
    const expected = buildResult(D, analyze(D, m));
    assertDeepEqual(plain(result), plain(expected));
    assertEqual(result.n, 20);
    assertDeepEqual(result.flaggedIdxs, [19]);
    assertDeepEqual(result.methods.map((x) => x.id), ['grubbs', 'generalized-esd', 'tukey-iqr', 'z-score']);
    assertEqual(result.methods[0].metrics.statistic.toFixed(4), '4.1774');
  });

  test('result: null ohne Spalte, unter drei Zahlen, bei gelöschter Spalte und bei Text', () => {
    assertEqual(derived(new State(CTX), ['result']).result, null);
    const m = legacy();
    m.colRef = ref('short');
    assertEqual(derived(m, ['result']).result, null);
    m.colRef = ref('gone');
    assertEqual(derived(m, ['result']).result, null);
    assertDeepEqual(plain(m.colRef), ref('gone'), 'der Bezug bleibt');
    m.colRef = ref('txt');
    assertEqual(derived(m, ['result']).result, null, 'nur Zahlen zählen');
  });

  test('chartMethodOptions: all und jedes markierende aktive Verfahren', () => {
    const m = legacy();
    assertDeepEqual(derived(m, ['chartMethodOptions']).chartMethodOptions, ['all', 'grubbs', 'generalized-esd', 'tukey-iqr', 'z-score']);
    m.colRef = null;
    assertDeepEqual(derived(m, ['chartMethodOptions']).chartMethodOptions, ['all']);
  });

  test('activeParams und activeColumnSlots', () => {
    const d = derived(new State(CTX), ['activeParams', 'activeColumnSlots']);
    assertDeepEqual(d.activeParams, [...PARAM_KEYS]);
    assertDeepEqual(d.activeParams, ['alpha', 'side', 'tukeyFactor', 'hampelK', 'zThreshold', 'modZThreshold', 'esdMaxOutliers', 'enabled']);
    assertDeepEqual(d.activeColumnSlots, ['colRef']);
    for (const k of d.activeParams) assert(k in State.schema.fields, k);
  });
});
