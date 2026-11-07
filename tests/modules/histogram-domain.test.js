import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import { State } from '../../js/modules/histogram/domain/model.js';
import { buildGroups } from '../../js/modules/histogram/domain/analyze.js';
import { CHART_COLORS_RGBA } from '../../js/core/chart/chart-colors.js';

const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const sheet = { a: [1, 2, 3, 'x', null], b: [5], g: ['m', 'm', 'w', 'w', ''], e: ['', null, '', '', ''] };
const read = { values: (r) => sheet[r.columnId] ?? null, name: (r) => r.columnId.toUpperCase() };

suite('histogram: Model', () => {
  test('Vorgaben', () => {
    const m = new State();
    assertDeepEqual(m.datasets, [{ valueRef: null, groupRef: null }]);
    assertEqual(m.binMode, 'auto');
    assertEqual(m.binWidth, null);
    assertEqual(m.confLevel, 95);
    assertEqual(m.showStats, true);
    assertDeepEqual(m.histogramChart, {});
    assertEqual(m.hasContent(), false);
  });
  test('Farben je Zeile aus der Vorgabe', () => {
    assertDeepEqual([...State.schema.fields.datasets.colors], [...CHART_COLORS_RGBA]);
  });
  test('binWidthOnlyManual und setBinMode', () => {
    const m = new State();
    assertThrows(() => { m.binWidth = 2; }, /binWidthOnlyManual/);
    m.setBinMode({ binMode: 'manual' });
    m.binWidth = 2;
    m.setBinMode({ binMode: 'auto' });
    assertEqual(m.binWidth, null);
    assertEqual(m.binMode, 'auto');
  });
  test('Ansicht zählt nicht als Inhalt', () => {
    const m = new State();
    m.showStats = false;
    m.histogramChart = { title: 'X' };
    assertEqual(m.hasContent(), false);
  });
});

suite('histogram: buildGroups', () => {
  test('ohne Gruppe: nur Zahlen, Name der Spalte', () => {
    assertDeepEqual(buildGroups([{ valueRef: ref('a'), groupRef: null }], read), { groups: [{ col: 'A', level: null, values: [1, 2, 3] }] });
  });
  test('Zeilen ohne valueRef zählen nicht', () => {
    assertDeepEqual(buildGroups([{ valueRef: null, groupRef: null }], read), { groups: [] });
  });
  test('zu wenige Werte', () => {
    assertDeepEqual(buildGroups([{ valueRef: ref('b'), groupRef: null }], read), { error: 'errTooFew', params: { col: 'B' } });
  });
  test('Gruppen: Stufen mit mindestens zwei Werten', () => {
    assertDeepEqual(buildGroups([{ valueRef: ref('a'), groupRef: ref('g') }], read), { groups: [{ col: 'A', level: 'm', values: [1, 2] }] });
  });
  test('Gruppe ohne Stufen', () => {
    assertDeepEqual(buildGroups([{ valueRef: ref('a'), groupRef: ref('e') }], read), { error: 'errNoGroupLevels', params: { n: 1 } });
  });
});
