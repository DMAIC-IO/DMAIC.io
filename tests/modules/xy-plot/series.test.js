import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { buildSeries, statsInput, sourceColumns } from '../../../js/modules/xy-plot/domain/series.js';
import { CHART_COLORS } from '../../../js/core/chart/chart-colors.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const sheet = {
  x: [1, 'a', 3, 4], y: [2, 5, null, 8], Y: [2, 5, null, 8],
  gx: [1, 2, 3, 4, 5], gy: [1, 2, 3, 4, 5], g: ['B', 'B', 'A', 'A', 'C'],
  s: [0, 4, -1, 16], x4: [1, 2, 3, 4], y4: [1, 2, 3, 4],
  e: ['', '', '', '', ''],
};
const read = { values: (r) => sheet[r.columnId] ?? null, name: (r) => (r.columnId === 'y' ? 'Y' : r.columnId.toUpperCase()) };
const ds = (o) => ({ x: null, y: null, group: null, size: null, ...o });
const model = (datasets, o = {}) => ({ datasets, showMarkers: true, showLines: false, legacySeries: [], ...o });

suite('xy-plot: Reihenbau', () => {
  test('paarweise ohne Nichtzahlen', () => {
    const r = buildSeries(model([ds({ x: ref('x'), y: ref('y') })]), read);
    assertDeepEqual(r.series[0].x, [1, 4]);
    assertDeepEqual(r.series[0].y, [2, 8]);
    assertEqual(r.series[0].name, 'Y');
    assertDeepEqual(r.xRef, ref('x'));
  });
  test('Darstellung', () => {
    const s = buildSeries(model([ds({ x: ref('x'), y: ref('y') })], { showLines: true }), read).series[0];
    assertEqual(s.color, CHART_COLORS[0]);
    assertEqual(s.symbol, 'circle');
    assertEqual(s.strokeWidth, 1.5);
    assertEqual(s.stroke, 'var(--chart-marker-stroke)');
    assertEqual(s.markerSize, 7);
    assertEqual(s.visible, true);
    assertDeepEqual(s.connectLine, { show: true, dash: 'solid', width: 2 });
  });
  test('ohne Marker: markerSize 0', () => {
    const s = buildSeries(model([ds({ x: ref('x'), y: ref('y') })], { showMarkers: false }), read).series[0];
    assertEqual(s.markerSize, 0);
  });
  test('Gruppen in Einfügereihenfolge, Stufe mit einem Punkt entfällt', () => {
    const r = buildSeries(model([ds({ x: ref('gx'), y: ref('gy'), group: ref('g') })]), read);
    assertDeepEqual(r.series.map((s) => s.name), ['GY — B', 'GY — A']);
    assertEqual(r.series[1].color, CHART_COLORS[1]);
  });
  test('alle Stufen unter 2 Punkten', () => {
    const r = buildSeries(model([ds({ x: ref('x'), y: ref('Y'), group: ref('x4') })]), read);
    assertDeepEqual(r, { error: 'errTooFew', params: { col: 'Y' } });
  });
  test('Gruppenspalte leer', () => {
    const r = buildSeries(model([ds({ x: ref('x'), y: ref('y'), group: ref('e') })]), read);
    assertDeepEqual(r, { error: 'errNoGroupLevels', params: { n: 1 } });
  });
  test('zu wenige Punkte', () => {
    const r = buildSeries(model([ds({ x: ref('x'), y: ref('e') })]), read);
    assertEqual(r.error, 'errTooFew');
  });
  test('Größe unter 0 entfernt die Zeile; Blase nur mit Marker', () => {
    const d = ds({ x: ref('x4'), y: ref('y4'), size: ref('s') });
    const s = buildSeries(model([d]), read).series[0];
    assertDeepEqual(s.x, [1, 2, 4]);
    assertDeepEqual(s.sizeValues, [0, 4, 16]);
    assertDeepEqual(s.sizes.map(Math.round), [6, 17, 28]);
    assertEqual(s.sizeLabel, 'S');
    const n = buildSeries(model([d], { showMarkers: false }), read).series[0];
    assertEqual(n.sizes, undefined);
    assertEqual(n.markerSize, 0);
  });
  test('unvollständige Reihe wird übersprungen', () => {
    const r = buildSeries(model([ds({ x: ref('x') }), ds({ x: ref('x4'), y: ref('y4') })]), read);
    assertEqual(r.series.length, 1);
    assertEqual(r.series[0].color, CHART_COLORS[0]);
    assertDeepEqual(r.xRef, ref('x4'));
  });
  test('keine fertige Reihe', () => {
    assertDeepEqual(buildSeries(model([ds({ x: ref('x') })]), read), { series: [], xRef: null });
  });
  test('legacySeries liegt je Index auf', () => {
    const r = buildSeries(model(
      [ds({ x: ref('x4'), y: ref('y4') }), ds({ x: ref('x4'), y: ref('y4') })],
      { legacySeries: [undefined, { name: 'Neu', connectLine: { show: true, dash: 'dot', width: 2 } }] },
    ), read);
    assertEqual(r.series[0].name, 'Y4');
    assertEqual(r.series[1].name, 'Neu');
    assertDeepEqual(r.series[1].connectLine, { show: true, dash: 'dot', width: 2 });
    assertEqual('color' in r.series[0].connectLine, false);
  });
  test('statsInput: nur sichtbare Reihen', () => {
    const out = statsInput([
      { name: 'a', y: [1], color: 'c', visible: true },
      { name: 'b', y: [2], color: 'd', visible: false },
    ]);
    assertDeepEqual(out, [{ name: 'a', values: [1], color: 'c', visible: true }]);
  });
  test('sourceColumns liefert values und name', () => {
    assertEqual(typeof sourceColumns({}).values, 'function');
  });
});
