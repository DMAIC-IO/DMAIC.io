/**
 * Heatmap: Migration der Altform (domain/migrations.js), samt der beiden
 * Vorbelegungen der Diagrammempfehlung.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/heatmap/domain/model.js';
import { from0 } from '../../../js/modules/heatmap/domain/migrations.js';
import { buildPrefill } from '../../../js/modules/chart-suggestion/domain/prefill.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const plain = (v) => JSON.parse(JSON.stringify(v));

const WS = '4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f7a';
const col = (c) => ({ instanceId: WS, sheetId: 'sheet_1', columnId: c });

/** Vollständiges altes `chartConfig` mit den alten Vorgaben. */
const OLD_DEFAULTS = {
  title: '', showTitle: true, aggregation: 'mean', showCellLabels: true,
  cellGap: 1, valueDecimals: 1, colorScheme: 'viridis', bgColor: null,
};

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
const LEGACY = {
  xRef: col('col_hm_x'),
  gRef: col('col_hm_g'),
  vRef: col('col_hm_v'),
  chartConfig: {
    title: 'Modelltitel', showTitle: true, aggregation: 'sum', showCellLabels: true,
    cellGap: 3, valueDecimals: 2, colorScheme: 'plasma', bgColor: '#fff8e1',
  },
  exampleWorksheetId: null,
};

suite('heatmap: Migration', () => {
  test('Altfixture: eine Zeile x/g/v, Aggregation, Darstellung nur mit Abweichungen', () => {
    const m = State.fromJSON(LEGACY);
    assertDeepEqual(plain(m.datasets), [{ x: col('col_hm_x'), g: col('col_hm_g'), v: col('col_hm_v') }]);
    assertEqual(m.aggregation, 'sum');
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {
      title: 'Modelltitel', showTitle: true, cellGap: 3, valueDecimals: 2, colorScheme: 'plasma', bgColor: '#fff8e1',
    });
  });

  test('unprüfbare Bezüge entfallen; nur x, nur v bleiben; alle leer → Vorgabe', () => {
    assertDeepEqual(from0({ xRef: ref('a'), gRef: { instanceId: 'w' }, vRef: 'x' }).datasets, [{ x: ref('a'), g: null, v: null }]);
    assertDeepEqual(from0({ xRef: { instanceId: 'w', sheetId: 's', columnId: 'c', extra: 1 } }).datasets, [{ x: ref('c'), g: null, v: null }]);
    assertDeepEqual(from0({ xRef: { instanceId: 'w', columnId: 'c' } }).datasets, [{ x: { instanceId: 'w', columnId: 'c' }, g: null, v: null }]);
    assertDeepEqual(from0({ vRef: ref('b') }).datasets, [{ x: null, g: null, v: ref('b') }]);
    assertEqual(from0({ xRef: null, gRef: null, vRef: null }).datasets, undefined);
    assertEqual(from0({ xRef: { instanceId: '', columnId: 'c' }, gRef: {}, vRef: 5 }).datasets, undefined);
    const m = State.fromJSON({ xRef: null, gRef: null, vRef: null });
    assertDeepEqual(plain(m.datasets), plain(new State().datasets));
    assertEqual(m.hasContent(), false);
    assertDeepEqual(plain(State.fromJSON({ xRef: ref('a') }).datasets), [{ x: ref('a'), g: null, v: null }]);
    assertDeepEqual(plain(State.fromJSON({ vRef: ref('b') }).datasets), [{ x: null, g: null, v: ref('b') }]);
  });

  test('aggregation: sum bleibt, alles andere wird die Vorgabe mean', () => {
    assertEqual(State.fromJSON({ chartConfig: { aggregation: 'sum' } }).aggregation, 'sum');
    assertEqual(State.fromJSON({ chartConfig: { aggregation: 'median' } }).aggregation, 'mean');
    assertEqual(State.fromJSON({ chartConfig: {} }).aggregation, 'mean');
    assertEqual(State.fromJSON({}).aggregation, 'mean');
    assertEqual(from0({ chartConfig: { aggregation: 'mean' } }).aggregation, undefined);
    assertEqual(from0({ chartConfig: { aggregation: 'median' } }).aggregation, undefined);
  });

  test('chartConfig: Vorgaben entfallen', () => {
    assertDeepEqual(from0({ chartConfig: OLD_DEFAULTS }).chart, {});
    assertDeepEqual(from0({}).chart, {});
    assertDeepEqual(from0({ chartConfig: 'kaputt' }).chart, {});
  });

  test('Titel: mit Text übernommen, sichtbarer Titel bringt showTitle: true mit, leerer entfällt', () => {
    assertDeepEqual(from0({ chartConfig: { title: 'T' } }).chart, { title: 'T', showTitle: true });
    assertDeepEqual(from0({ chartConfig: { title: 'T', showTitle: true } }).chart, { title: 'T', showTitle: true });
    assertDeepEqual(from0({ chartConfig: { title: 'T', showTitle: false } }).chart, { title: 'T' });
    assertDeepEqual(from0({ chartConfig: { title: '', showTitle: false } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { title: '', showTitle: true } }).chart, {});
  });

  test('Zellbeschriftung, Zellabstand, Nachkommastellen, Farbschema, Hintergrund', () => {
    assertDeepEqual(from0({ chartConfig: { showCellLabels: false } }).chart, { showCellLabels: false });
    assertDeepEqual(from0({ chartConfig: { showCellLabels: true } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { showCellLabels: 'nein' } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { cellGap: -2 } }).chart, { cellGap: 0 });
    assertDeepEqual(from0({ chartConfig: { cellGap: 1 } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { cellGap: 2.5 } }).chart, { cellGap: 2.5 });
    assertDeepEqual(from0({ chartConfig: { cellGap: '3' } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { valueDecimals: 9 } }).chart, { valueDecimals: 6 });
    assertDeepEqual(from0({ chartConfig: { valueDecimals: -1 } }).chart, { valueDecimals: 0 });
    assertDeepEqual(from0({ chartConfig: { valueDecimals: 1.4 } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { valueDecimals: 2.6 } }).chart, { valueDecimals: 3 });
    assertDeepEqual(from0({ chartConfig: { valueDecimals: NaN } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { colorScheme: 'viridis' } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { colorScheme: 'plasma' } }).chart, { colorScheme: 'plasma' });
    assertDeepEqual(from0({ chartConfig: { colorScheme: '' } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { bgColor: '#123456' } }).chart, { bgColor: '#123456' });
    assertDeepEqual(from0({ chartConfig: { bgColor: '' } }).chart, {});
  });

  test('xLabel, yLabel, titleSize und Fremdschlüssel entfallen', () => {
    const out = from0({ fremd: 2, chartConfig: { xLabel: 'X', yLabel: 'Y', titleSize: 18, fremd: 1 } });
    assertDeepEqual(out, { chart: {} });
    const m = State.fromJSON({ xRef: ref('a'), chartConfig: { xLabel: 'X', yLabel: 'Y', titleSize: 18, fremd: 1 } });
    assertDeepEqual(plain(m.chart), {});
  });

  test('exampleWorksheetId bleibt, Nicht-Text entfällt', () => {
    assertEqual(State.fromJSON({ exampleWorksheetId: 'ws-9' }).exampleWorksheetId, 'ws-9');
    assertEqual(State.fromJSON({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
  });
});

suite('heatmap: Migration — Vorbelegung der Diagrammempfehlung', () => {
  const cat = (id) => ({ id, name: id, role: 'categorical', type: 'text', values: ['a', 'b'], roleConfirmed: false });
  const cont = (id) => ({ id, name: id, role: 'continuous', type: 'numeric', values: [1, 2], roleConfirmed: false });

  test('stetig und zwei kategorial → x, g, v; Aggregation Vorgabe, zwei Nachkommastellen', () => {
    const p = buildPrefill('heatmap', [cont('k'), cat('a'), cat('b')], 'w', 's');
    assertEqual(p.target, 'heatmap');
    assertDeepEqual(p.state, { xRef: ref('b'), gRef: ref('a'), vRef: ref('k'), chartConfig: { aggregation: 'mean', valueDecimals: 2 } });
    const m = State.fromJSON(p.state);
    assertDeepEqual(plain(m.datasets), [{ x: ref('b'), g: ref('a'), v: ref('k') }]);
    assertEqual(m.aggregation, 'mean');
    assertDeepEqual(plain(m.chart), { valueDecimals: 2 });
    assertEqual(m.hasContent(), true);
  });

  test('zwei kategorial → x und g, Darstellung leer', () => {
    const p = buildPrefill('heatmap', [cat('a'), cat('b')], 'w', 's');
    assertDeepEqual(p.state, { xRef: ref('b'), gRef: ref('a'), vRef: null });
    const m = State.fromJSON(p.state);
    assertDeepEqual(plain(m.datasets), [{ x: ref('b'), g: ref('a'), v: null }]);
    assertEqual(m.aggregation, 'mean');
    assertDeepEqual(plain(m.chart), {});
  });
});
