/**
 * Mosaikdiagramm: Migration der Altform (domain/migrations.js).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/mosaic/domain/model.js';
import { from0 } from '../../../js/modules/mosaic/domain/migrations.js';
import { buildPrefill } from '../../../js/modules/chart-suggestion/domain/prefill.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const plain = (v) => JSON.parse(JSON.stringify(v));

const WS = '5b1e2c3d-4f5a-4b6c-8d7e-9f0a1b2c3d4e';
const col = (c) => ({ instanceId: WS, sheetId: 'sheet_1', columnId: c });

/** Instanz der Altprojekt-Fixture (Stand des Altmoduls, ohne `_schema`). */
const LEGACY = {
  xRef: col('col_mos_werk'),
  gRef: col('col_mos_status'),
  chartConfig: {
    title: 'Modelltitel', showTitle: true, showLegend: true, showCellLabels: false,
    columnGap: 6, segmentGap: 1, bgColor: '#fff8e1',
  },
  exampleWorksheetId: null,
};

suite('mosaic: Migration', () => {
  test('Altfixture: eine Zeile x/g, Darstellung nur mit Abweichungen', () => {
    const m = State.fromJSON(LEGACY);
    assertDeepEqual(plain(m.datasets), [{ x: col('col_mos_werk'), g: col('col_mos_status') }]);
    assertEqual(m.exampleWorksheetId, null);
    assertDeepEqual(plain(m.chart), { title: 'Modelltitel', showTitle: true, showCellLabels: false, columnGap: 6, bgColor: '#fff8e1' });
  });

  test('unprüfbare Bezüge entfallen; nur ein Slot bleibt; beide leer → Vorgabe', () => {
    assertDeepEqual(from0({ xRef: ref('a'), gRef: { instanceId: 'w' } }).datasets, [{ x: ref('a'), g: null }]);
    assertDeepEqual(from0({ xRef: null, gRef: ref('b') }).datasets, [{ x: null, g: ref('b') }]);
    assertDeepEqual(from0({ xRef: { instanceId: 'w', sheetId: 's', columnId: 'c', extra: 1 } }).datasets, [{ x: ref('c'), g: null }]);
    assertDeepEqual(from0({ xRef: { instanceId: 'w', columnId: 'c' } }).datasets, [{ x: { instanceId: 'w', columnId: 'c' }, g: null }]);
    assertEqual(from0({ xRef: null, gRef: null }).datasets, undefined);
    assertEqual(from0({ xRef: { instanceId: '', columnId: 'c' }, gRef: 'x' }).datasets, undefined);
    const m = State.fromJSON({ xRef: null, gRef: null });
    assertDeepEqual(plain(m.datasets), plain(new State().datasets));
    assertEqual(m.hasContent(), false);
  });

  test('chartConfig: Vorgaben entfallen', () => {
    const out = from0({ chartConfig: { title: '', showTitle: true, showLegend: true, showCellLabels: true, columnGap: 2, segmentGap: 1, bgColor: null } });
    assertDeepEqual(out.chart, {});
    assertDeepEqual(from0({}).chart, {});
    assertDeepEqual(from0({ chartConfig: 'kaputt' }).chart, {});
  });

  test('Titel: sichtbar bringt showTitle mit, ausgeschaltet nicht', () => {
    assertDeepEqual(from0({ chartConfig: { title: 'T' } }).chart, { title: 'T', showTitle: true });
    assertDeepEqual(from0({ chartConfig: { title: 'T', showTitle: true } }).chart, { title: 'T', showTitle: true });
    assertDeepEqual(from0({ chartConfig: { title: 'T', showTitle: false } }).chart, { title: 'T' });
    assertDeepEqual(from0({ chartConfig: { title: '', showTitle: false } }).chart, {});
  });

  test('Schalter, Abstände geklemmt, Hintergrund', () => {
    assertDeepEqual(from0({ chartConfig: { showLegend: false, showCellLabels: false, columnGap: -3, segmentGap: 4, bgColor: '#123456' } }).chart,
      { showLegend: false, showCellLabels: false, columnGap: 0, segmentGap: 4, bgColor: '#123456' });
    assertDeepEqual(from0({ chartConfig: { showLegend: 'nein', columnGap: Number.NaN, segmentGap: '3', bgColor: '' } }).chart, {});
  });

  test('legendTitle und Fremdschlüssel entfallen', () => {
    const out = from0({ chartConfig: { legendTitle: 'Status', fremd: 1, xLabel: 'X' }, fremd: 2 });
    assertDeepEqual(out, { chart: {} });
    const m = State.fromJSON({ xRef: ref('a'), gRef: ref('b'), chartConfig: { legendTitle: 'Status', fremd: 1 } });
    assertDeepEqual(plain(m.chart), {});
  });

  test('exampleWorksheetId bleibt, Nicht-Text entfällt', () => {
    assertEqual(State.fromJSON({ exampleWorksheetId: 'ws-9' }).exampleWorksheetId, 'ws-9');
    assertEqual(State.fromJSON({ exampleWorksheetId: 5 }).exampleWorksheetId, null);
  });

  test('Vorbelegung der Diagrammempfehlung: genau eine Zeile x/g, Darstellung leer', () => {
    const cat = (id) => ({ id, name: id, role: 'categorical', type: 'text', values: ['a', 'b'], roleConfirmed: false });
    const p = buildPrefill('mosaic', [cat('a'), cat('b')], 'w', 's');
    const m = State.fromJSON(p.state);
    assertDeepEqual(plain(m.datasets), [{ x: ref('a'), g: ref('b') }]);
    assertDeepEqual(plain(m.chart), {});
    assertEqual(m.hasContent(), true);
  });
});
