/**
 * Pareto-Diagramm: Migration der Altform (domain/migrations.js), samt
 * Vorbelegung der Diagrammempfehlung und Golden-Fixtures der Exporte.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/pareto/domain/model.js';
import { from0 } from '../../../js/modules/pareto/domain/migrations.js';
import { buildPrefill } from '../../../js/modules/chart-suggestion/domain/prefill.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const plain = (v) => JSON.parse(JSON.stringify(v));

const WS = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f';
const col = (c) => ({ instanceId: WS, sheetId: 'sheet_1', columnId: c });

/** Vollständiges altes `chartConfig` mit den alten Vorgaben. */
const OLD_DEFAULTS = {
  title: '', showTitle: true, aggregation: 'sum', maxItems: 20,
  otherBucket: true, refLineValue: 80, barOpacity: 0.75, bgColor: null,
};

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
const LEGACY = {
  xRef: col('col_par_art'),
  yRef: col('col_par_wert'),
  gRef: col('col_par_schicht'),
  chartConfig: {
    title: 'Modelltitel', showTitle: true, aggregation: 'mean', maxItems: 4,
    otherBucket: true, refLineValue: 70, barOpacity: 0.75, bgColor: '#fff8e1',
  },
  exampleWorksheetId: null,
};

const GOLDEN = ['v0.9.0', 'v1.0.0', 'v1.1.0', 'v1.2.0', 'v1.3.0', 'v1.4.0', 'v1.5.0', 'v1.6.0'];
const FIXTURES = new URL('../../fixtures/exports/', import.meta.url);

/** @param {string} file @returns {Promise<any>} */
async function fetchJSON(file) {
  const res = await fetch(new URL(file, FIXTURES), { cache: 'no-cache' });
  return res.json();
}

suite('pareto: Migration', () => {
  test('Altfixture: eine Zeile x/y/g, Aggregation, Darstellung nur mit Abweichungen', () => {
    const m = State.fromJSON(LEGACY);
    assertDeepEqual(plain(m.datasets), [{ x: col('col_par_art'), y: col('col_par_wert'), g: col('col_par_schicht') }]);
    assertEqual(m.aggregation, 'mean');
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), { title: 'Modelltitel', refLineValue: 70, maxItems: 4, bgColor: '#fff8e1' });
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

  test('aggregation: mean bleibt, alles andere wird die Vorgabe sum', () => {
    assertEqual(State.fromJSON({ chartConfig: { aggregation: 'mean' } }).aggregation, 'mean');
    assertEqual(State.fromJSON({ chartConfig: { aggregation: 'median' } }).aggregation, 'sum');
    assertEqual(State.fromJSON({ chartConfig: {} }).aggregation, 'sum');
    assertEqual(State.fromJSON({}).aggregation, 'sum');
    assertEqual(from0({ chartConfig: { aggregation: 'sum' } }).aggregation, undefined);
    assertEqual(from0({ chartConfig: { aggregation: 'median' } }).aggregation, undefined);
  });

  test('chartConfig: Vorgaben entfallen', () => {
    assertDeepEqual(from0({ chartConfig: OLD_DEFAULTS }).chart, {});
    assertDeepEqual(from0({}).chart, {});
    assertDeepEqual(from0({ chartConfig: 'kaputt' }).chart, {});
  });

  test('Titel: mit Text übernommen, showTitle nur als false bei sichtbarem Text', () => {
    assertDeepEqual(from0({ chartConfig: { title: 'T' } }).chart, { title: 'T' });
    assertDeepEqual(from0({ chartConfig: { title: 'T', showTitle: true } }).chart, { title: 'T' });
    assertDeepEqual(from0({ chartConfig: { title: 'T', showTitle: false } }).chart, { title: 'T', showTitle: false });
    assertDeepEqual(from0({ chartConfig: { title: '', showTitle: false } }).chart, {});
  });

  test('Zahlen: refLineValue auf ≥ 0 geklemmt, maxItems gerundet, 0 entfällt', () => {
    assertDeepEqual(from0({ chartConfig: { refLineValue: -5 } }).chart, { refLineValue: 0 });
    assertDeepEqual(from0({ chartConfig: { refLineValue: 90 } }).chart, { refLineValue: 90 });
    assertDeepEqual(from0({ chartConfig: { maxItems: 3.6 } }).chart, { maxItems: 4 });
    assertDeepEqual(from0({ chartConfig: { maxItems: 0 } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { maxItems: -3 } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { maxItems: 20.2 } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { refLineValue: '70', maxItems: Number.NaN } }).chart, {});
  });

  test('otherBucket nur als false, bgColor als Text', () => {
    assertDeepEqual(from0({ chartConfig: { otherBucket: false } }).chart, { otherBucket: false });
    assertDeepEqual(from0({ chartConfig: { otherBucket: true } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { otherBucket: 'nein' } }).chart, {});
    assertDeepEqual(from0({ chartConfig: { bgColor: '#123456' } }).chart, { bgColor: '#123456' });
    assertDeepEqual(from0({ chartConfig: { bgColor: '' } }).chart, {});
  });

  test('barOpacity, legendTitle und Fremdschlüssel entfallen', () => {
    const out = from0({ fremd: 2, chartConfig: { barOpacity: 0.4, legendTitle: 'Schicht', fremd: 1, xLabel: 'X' } });
    assertDeepEqual(out, { chart: {} });
    const m = State.fromJSON({ xRef: ref('a'), chartConfig: { barOpacity: 0.4, legendTitle: 'Schicht', fremd: 1 } });
    assertDeepEqual(plain(m.chart), {});
  });

  test('exampleWorksheetId bleibt, Nicht-Text entfällt', () => {
    assertEqual(State.fromJSON({ exampleWorksheetId: 'ws-9' }).exampleWorksheetId, 'ws-9');
    assertEqual(State.fromJSON({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
  });
});

suite('pareto: Migration — Vorbelegung der Diagrammempfehlung', () => {
  const cat = (id) => ({ id, name: id, role: 'categorical', type: 'text', values: ['a', 'b'], roleConfirmed: false });
  const cont = (id) => ({ id, name: id, role: 'continuous', type: 'numeric', values: [1, 2], roleConfirmed: false });

  test('zwei Kategorienspalten → x und g, Aggregation Vorgabe, Darstellung leer', () => {
    const p = buildPrefill('pareto', [cat('a'), cat('b')], 'w', 's');
    assertEqual(p.target, 'pareto');
    assertDeepEqual(p.state, { xRef: ref('a'), gRef: ref('b'), yRef: null });
    const m = State.fromJSON(p.state);
    assertDeepEqual(plain(m.datasets), [{ x: ref('a'), y: null, g: ref('b') }]);
    assertEqual(m.aggregation, 'sum');
    assertDeepEqual(plain(m.chart), {});
    assertEqual(m.hasContent(), true);
  });

  test('eine Spalte → nur x', () => {
    const p = buildPrefill('pareto', [cont('k')], 'w', 's');
    assertDeepEqual(p.state, { xRef: ref('k'), yRef: null, gRef: null });
    const m = State.fromJSON(p.state);
    assertDeepEqual(plain(m.datasets), [{ x: ref('k'), y: null, g: null }]);
    assertEqual(m.aggregation, 'sum');
    assertDeepEqual(plain(m.chart), {});
  });
});

suite('pareto: Migration — Golden-Fixtures', () => {
  for (const v of GOLDEN) {
    test(`${v}_single_project: Instanz inst-pareto in fremder Form → Vorgabe`, async () => {
      const json = await fetchJSON(`${v}_single_project.json`);
      const raw = json.moduleStates['inst-pareto'];
      assertEqual(Array.isArray(raw.datasets), true, 'fremdes datasets erwartet');
      const m = State.fromJSON(raw);
      assertDeepEqual(plain(m.toJSON()), plain(new State().toJSON()));
      assertEqual(m.hasContent(), false);
    });
  }
});
