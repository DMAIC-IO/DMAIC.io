/**
 * Einzelwertdiagramm: Migration der Altform (domain/migrations.js).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/individual-value-plot/domain/model.js';
import { from0 } from '../../../js/modules/individual-value-plot/domain/migrations.js';
import { loadModel } from '../../../js/core/initial-model.js';
import { buildPrefill } from '../../../js/modules/chart-suggestion/domain/prefill.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const row = (value, group = null, group2 = null, group3 = null) => ({ value, group, group2, group3 });
const plain = (v) => JSON.parse(JSON.stringify(v));

const WS = '5b1e2c3d-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const col = (c) => ({ instanceId: WS, sheetId: 'sheet_1', columnId: c });

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
const LEGACY = {
  seriesRefs: [col('col_ivp_a'), col('col_ivp_b')],
  groupRefs: [col('col_ivp_g'), null],
  showMean: true, showMedian: true, connectMeans: true, showOverallMean: true, jitter: 0.3,
  showStats: true, confLevel: 90,
  refLines: [{ dir: 'h', value: 20, label: 'Ziel' }], refAreas: [],
  bgColor: '#fff8e1', pointColors: ['#d62728'], pointSymbol: 'square', pointSize: 8,
  exampleWorksheetId: null,
};

suite('individual-value-plot: Migration', () => {
  test('Altfixture: Zeilen, Konfidenz, Darstellung nur mit Abweichungen', () => {
    const m = State.fromJSON(LEGACY);
    assertDeepEqual(plain(m.datasets), [row(col('col_ivp_a'), col('col_ivp_g')), row(col('col_ivp_b'))]);
    assertEqual(m.confLevel, 90);
    assertEqual(m.showStats, true);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {
      showMedian: true, connectMeans: true, showOverallMean: true, jitter: 0.3,
      pointSize: 8, pointSymbol: 'square', pointColors: ['#d62728'], bgColor: '#fff8e1',
      refLines: [{ dir: 'h', value: 20, label: 'Ziel' }],
    });
  });

  test('groupRefs: Array, Einzelbezug, null und fehlend', () => {
    const out = from0({
      seriesRefs: [ref('a'), ref('b'), ref('c'), ref('d')],
      groupRefs: [[ref('g1'), null, ref('g3')], ref('g'), null],
    });
    assertDeepEqual(out.datasets, [row(ref('a'), ref('g1'), null, ref('g3')), row(ref('b'), ref('g')), row(ref('c')), row(ref('d'))]);
  });

  test('seriesRefs: Nicht-Objekte fallen heraus, die Zuordnung zu groupRefs folgt der gefilterten Liste', () => {
    const out = from0({ seriesRefs: [null, ref('a'), 'x', ref('b')], groupRefs: [ref('ga'), ref('gb')] });
    assertDeepEqual(out.datasets, [row(ref('a'), ref('ga')), row(ref('b'), ref('gb'))]);
  });

  test('unprüfbare Bezüge entfallen; ohne gültige Zeile gilt die Vorgabe', () => {
    const out = from0({ seriesRefs: [{ instanceId: 'w' }, ref('a')], groupRefs: [null, { columnId: 'x' }] });
    assertDeepEqual(out.datasets, [row(ref('a'))]);
    assertEqual(from0({ seriesRefs: [{ instanceId: '' , columnId: 'c' }] }).datasets, undefined);
    assertDeepEqual(plain(State.fromJSON({ seriesRefs: [] }).datasets), plain(new State().datasets));
  });

  test('confLevel: null, außerhalb und 90', () => {
    assertEqual(from0({ confLevel: null }).confLevel, 95);
    assertEqual(from0({ confLevel: 150 }).confLevel, 95);
    assertEqual(from0({ confLevel: 0 }).confLevel, 95);
    assertEqual(from0({ confLevel: 90 }).confLevel, 90);
    assertEqual(State.fromJSON({ confLevel: null }, { context: { cycle: 'dmaic', confidenceLevel: 80 } }).confLevel, 95);
  });

  test('confLevel fehlt: entfällt, die Einstellung gilt, kein Inhalt', () => {
    assertEqual(Object.hasOwn(from0({}), 'confLevel'), false);
    assertEqual(Object.hasOwn(from0({ seriesRefs: [ref('a')] }), 'confLevel'), false);
    const m = State.fromJSON({}, { context: { cycle: 'dmaic', confidenceLevel: 80 } });
    assertEqual(m.confLevel, 80);
    assertEqual(m.hasContent(), false);
  });

  test('Darstellungsfelder: Vorgaben entfallen', () => {
    const out = from0({
      showMean: true, showMedian: false, connectMeans: false, showOverallMean: false, jitter: 0.6,
      pointSymbol: 'circle', pointSize: 6, refLines: [], refAreas: [], bgColor: null, pointColors: [],
    });
    assertDeepEqual(out.chart, {});
  });

  test('Darstellungsfelder: Klemmen, Lücken in pointColors, ungültige Einträge', () => {
    const area = { dir: 'y', min: 1, max: 2 };
    const out = from0({
      showMean: false, jitter: 3, pointSize: -2, pointSymbol: '', pointColors: [null, '', '#123456', 7],
      refLines: [{ dir: 'h', value: 1 }, { dir: 'schräg', value: 'x' }], refAreas: [area, null], bgColor: '',
    });
    assertDeepEqual(out.chart, {
      showMean: false, jitter: 1, pointSize: 0, pointColors: [null, null, '#123456', null],
      refLines: [{ dir: 'h', value: 1 }], refAreas: [area],
    });
    assertEqual(from0({ jitter: -1 }).chart.jitter, 0);
    assertEqual(from0({ pointColors: [null, ''] }).chart.pointColors, undefined);
    assertEqual(from0({ showMedian: 'ja' }).chart.showMedian, undefined);
  });

  test('showStats und exampleWorksheetId bleiben', () => {
    const m = loadModel(State, { seriesRefs: [ref('a')], showStats: false, exampleWorksheetId: 'ws-9' });
    assertEqual(m.showStats, false);
    assertEqual(m.exampleWorksheetId, 'ws-9');
  });

  test('Vorbelegung der Diagrammempfehlung: zwei Reihen mit gleicher Gruppe bzw. ohne', () => {
    const col = (id, role) => ({ id, name: id, role, type: role === 'continuous' ? 'numeric' : 'text', values: [1, 2], roleConfirmed: false });
    const withGroup = buildPrefill('individual-value-plot', [col('a', 'continuous'), col('b', 'continuous'), col('g', 'categorical')], 'w', 's');
    const m = State.fromJSON(withGroup.state);
    assertDeepEqual(plain(m.datasets), [row(ref('a'), ref('g')), row(ref('b'), ref('g'))]);
    assertEqual(m.confLevel, 95);
    const without = buildPrefill('individual-value-plot', [col('a', 'continuous'), col('b', 'continuous')], 'w', 's');
    assertDeepEqual(plain(State.fromJSON(without.state).datasets), [row(ref('a')), row(ref('b'))]);
  });
});
