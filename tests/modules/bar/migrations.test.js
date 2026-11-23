/**
 * Balkendiagramm: Migration der Altform (domain/migrations.js), samt der drei
 * Vorbelegungen der Diagrammempfehlung.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/bar/domain/model.js';
import { from0 } from '../../../js/modules/bar/domain/migrations.js';
import { buildPrefill } from '../../../js/modules/chart-suggestion/domain/prefill.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const plain = (v) => JSON.parse(JSON.stringify(v));

const WS = '4d5e6f7a-8b9c-4d0e-8f1a-2b3c4d5e6f7a';
const col = (c) => ({ instanceId: WS, sheetId: 'sheet_1', columnId: c });

/** Vollständiges altes `chartConfig` mit den alten Vorgaben. */
const OLD_DEFAULTS = {
  showTitle: true, title: '', titleSize: 15, showLegend: true, stacked: false,
  aggregation: 'mean', barGap: 4, categoryGap: 0.3, bgColor: null, xLabel: '', yLabel: '',
};

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
const LEGACY = {
  xRef: col('col_bar_kat'),
  yRef: col('col_bar_wert'),
  gRef: col('col_bar_grp'),
  chartConfig: {
    title: 'Modelltitel', showTitle: true, titleSize: 18, showLegend: true, stacked: true,
    aggregation: 'sum', barGap: 4, categoryGap: 0.3, bgColor: '#fff8e1', xLabel: 'Kategorie alt', yLabel: '',
  },
  exampleWorksheetId: null,
};

suite('bar: Migration', () => {
  test('Altfixture: eine Zeile x/y/g, Aggregation, Stapeln, Darstellung nur mit Abweichungen', () => {
    const m = State.fromJSON(LEGACY);
    assertDeepEqual(plain(m.datasets), [{ x: col('col_bar_kat'), y: col('col_bar_wert'), g: col('col_bar_grp') }]);
    assertEqual(m.aggregation, 'sum');
    assertEqual(m.stacked, true);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), {
      title: 'Modelltitel', showTitle: true, xLabel: 'Kategorie alt', titleSize: 18, bgColor: '#fff8e1',
    });
  });

  test('unprüfbare Bezüge entfallen; nur y, nur g bleiben; alle leer → Vorgabe', () => {
    assertDeepEqual(from0({ xRef: ref('a'), yRef: { instanceId: 'w' }, gRef: 'x' }).datasets, [{ x: ref('a'), y: null, g: null }]);
    assertDeepEqual(from0({ xRef: { instanceId: 'w', sheetId: 's', columnId: 'c', extra: 1 } }).datasets, [{ x: ref('c'), y: null, g: null }]);
    assertDeepEqual(from0({ xRef: { instanceId: 'w', columnId: 'c' } }).datasets, [{ x: { instanceId: 'w', columnId: 'c' }, y: null, g: null }]);
    assertDeepEqual(from0({ yRef: ref('b') }).datasets, [{ x: null, y: ref('b'), g: null }]);
    assertDeepEqual(from0({ gRef: ref('c') }).datasets, [{ x: null, y: null, g: ref('c') }]);
    assertEqual(from0({ xRef: null, yRef: null, gRef: null }).datasets, undefined);
    assertEqual(from0({ xRef: { instanceId: '', columnId: 'c' }, yRef: {}, gRef: 5 }).datasets, undefined);
    const m = State.fromJSON({ xRef: null, yRef: null, gRef: null });
    assertDeepEqual(plain(m.datasets), plain(new State().datasets));
    assertEqual(m.hasContent(), false);
    assertDeepEqual(plain(State.fromJSON({ yRef: ref('b') }).datasets), [{ x: null, y: ref('b'), g: null }]);
    assertDeepEqual(plain(State.fromJSON({ gRef: ref('c') }).datasets), [{ x: null, y: null, g: ref('c') }]);
  });

  test('aggregation: sum bleibt, alles andere wird die Vorgabe mean', () => {
    assertEqual(State.fromJSON({ chartConfig: { aggregation: 'sum' } }).aggregation, 'sum');
    assertEqual(State.fromJSON({ chartConfig: { aggregation: 'median' } }).aggregation, 'mean');
    assertEqual(State.fromJSON({ chartConfig: {} }).aggregation, 'mean');
    assertEqual(State.fromJSON({}).aggregation, 'mean');
    assertEqual(from0({ chartConfig: { aggregation: 'mean' } }).aggregation, undefined);
    assertEqual(from0({ chartConfig: { aggregation: 'median' } }).aggregation, undefined);
  });

  test('stacked: nur true bleibt, alles andere wird die Vorgabe false', () => {
    assertEqual(State.fromJSON({ chartConfig: { stacked: true } }).stacked, true);
    assertEqual(State.fromJSON({ chartConfig: { stacked: 'ja' } }).stacked, false);
    assertEqual(State.fromJSON({ chartConfig: { stacked: 1 } }).stacked, false);
    assertEqual(State.fromJSON({ chartConfig: { stacked: false } }).stacked, false);
    assertEqual(from0({ chartConfig: { stacked: 'ja' } }).stacked, undefined);
    assertEqual(from0({ chartConfig: { stacked: false } }).stacked, undefined);
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

  test('Achsentitel, Titelgröße, Legende und Hintergrund', () => {
    assertDeepEqual(from0({ chartConfig: { xLabel: 'X', yLabel: 'Y' } }).chart, { xLabel: 'X', yLabel: 'Y' });
    assertDeepEqual(from0({ chartConfig: { titleSize: 60 } }).chart, { titleSize: 48 });
    assertDeepEqual(from0({ chartConfig: { titleSize: 2 } }).chart, { titleSize: 6 });
    assertDeepEqual(from0({ chartConfig: { titleSize: 15 } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { titleSize: '18' } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { showLegend: false } }).chart, { showLegend: false });
    assertDeepEqual(from0({ chartConfig: { showLegend: true } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { showLegend: 'nein' } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { bgColor: '#123456' } }).chart, { bgColor: '#123456' });
    assertDeepEqual(from0({ chartConfig: { bgColor: '' } }).chart, {});
  });

  test('barGap, categoryGap, legendTitle und Fremdschlüssel entfallen', () => {
    const out = from0({ fremd: 2, chartConfig: { barGap: 8, categoryGap: 0.5, legendTitle: 'Schicht', fremd: 1 } });
    assertDeepEqual(out, { chart: {} });
    const m = State.fromJSON({ xRef: ref('a'), chartConfig: { barGap: 8, categoryGap: 0.5, legendTitle: 'Schicht', fremd: 1 } });
    assertDeepEqual(plain(m.chart), {});
  });

  test('exampleWorksheetId bleibt, Nicht-Text entfällt', () => {
    assertEqual(State.fromJSON({ exampleWorksheetId: 'ws-9' }).exampleWorksheetId, 'ws-9');
    assertEqual(State.fromJSON({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
  });
});

suite('bar: Migration — Vorbelegung der Diagrammempfehlung', () => {
  const cat = (id) => ({ id, name: id, role: 'categorical', type: 'text', values: ['a', 'b'], roleConfirmed: false });
  const cont = (id) => ({ id, name: id, role: 'continuous', type: 'numeric', values: [1, 2], roleConfirmed: false });

  test('zwei Kategorienspalten → x und g, gestapelt, Aggregation Vorgabe, Darstellung leer', () => {
    const p = buildPrefill('bar', [cat('a'), cat('b')], 'w', 's');
    assertEqual(p.target, 'bar');
    assertDeepEqual(p.state, { xRef: ref('a'), gRef: ref('b'), yRef: null, chartConfig: { stacked: true, aggregation: 'mean' } });
    const m = State.fromJSON(p.state);
    assertDeepEqual(plain(m.datasets), [{ x: ref('a'), y: null, g: ref('b') }]);
    assertEqual(m.stacked, true);
    assertEqual(m.aggregation, 'mean');
    assertDeepEqual(plain(m.chart), {});
    assertEqual(m.hasContent(), true);
  });

  test('stetig und kategorial → x und y', () => {
    const p = buildPrefill('bar', [cont('k'), cat('a')], 'w', 's');
    assertDeepEqual(p.state, { xRef: ref('a'), yRef: ref('k'), gRef: null });
    const m = State.fromJSON(p.state);
    assertDeepEqual(plain(m.datasets), [{ x: ref('a'), y: ref('k'), g: null }]);
    assertEqual(m.stacked, false);
    assertEqual(m.aggregation, 'mean');
    assertDeepEqual(plain(m.chart), {});
  });

  test('eine Spalte → nur x', () => {
    const p = buildPrefill('bar', [cont('k')], 'w', 's');
    assertDeepEqual(p.state, { xRef: ref('k'), yRef: null, gRef: null });
    const m = State.fromJSON(p.state);
    assertDeepEqual(plain(m.datasets), [{ x: ref('k'), y: null, g: null }]);
    assertEqual(m.stacked, false);
    assertDeepEqual(plain(m.chart), {});
  });
});
