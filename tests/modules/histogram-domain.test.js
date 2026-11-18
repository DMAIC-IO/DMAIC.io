import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import { State } from '../../js/modules/histogram/domain/model.js';
import { buildGroups } from '../../js/modules/histogram/domain/analyze.js';
import { evaluateDerived } from '../../js/core/derived.js';
import { storedSource } from '../helpers/stored-source.js';
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

suite('histogram: Model — derived stats', () => {
  const cols = { v: [1, 2, 3, 4, 5, 6], g: ['a', 'b', 'a', 'b', 'a', 'b'], w: [10, 11, 12, 13] };
  const wsOf = (columns) => storedSource({ w: { sheets: [{ id: 's', name: 'S', state: {
    rowCount: Math.max(0, ...Object.values(columns).map((v) => v.length)),
    columns: Object.entries(columns).map(([id, values]) => ({ id, name: id.toUpperCase(), values })),
  } }] } });
  const data = wsOf(cols);
  /** Leser, der außer read/list jedes Glied mit Wurf meldet. */
  const spy = (src) => new Proxy({}, { get(_t, k) {
    if (k === 'read') return (...a) => src.read(...a);
    if (k === 'list') return () => src.list();
    throw new Error(`derived greift auf src.${String(k)} zu`);
  } });

  test('stats liest nur über src.read', () => {
    const m = State.fromJSON({ datasets: [{ valueRef: ref('v'), groupRef: ref('g') }] });
    assertEqual(evaluateDerived(m, spy(data)).stats.length, 2);
  });

  test('zwei Gruppen: n, Mittel, Standardabweichung, Quartile und Konfidenzintervall je Stufe', () => {
    const m = State.fromJSON({ datasets: [{ valueRef: ref('v'), groupRef: ref('g') }] });
    const { stats } = evaluateDerived(m, data);
    assertEqual(stats.length, 2);
    assertEqual(stats[0].name, 'V — a');
    assertEqual(stats[1].name, 'V — b');
    const [a, b] = stats.map((r) => r.stats);
    assertEqual(a.n, 3); assertEqual(b.n, 3);
    assertEqual(a.mean, 3); assertEqual(b.mean, 4);
    assertEqual(a.stddev, 2); assertEqual(b.stddev, 2);
    assertEqual(a.median, 3); assertEqual(a.q1, 2); assertEqual(a.q3, 4);
    assertEqual(stats[0].ci.mean[0].toFixed(4), '-1.9683');
    assertEqual(stats[0].ci.mean[1].toFixed(4), '7.9683');
  });

  test('confLevel geht in das Intervall ein', () => {
    const wide = State.fromJSON({ datasets: [{ valueRef: ref('w'), groupRef: null }], confLevel: 99 });
    const narrow = State.fromJSON({ datasets: [{ valueRef: ref('w'), groupRef: null }], confLevel: 90 });
    const w = evaluateDerived(wide, data).stats[0].ci.mean;
    const n = evaluateDerived(narrow, data).stats[0].ci.mean;
    assertEqual(w[1] - w[0] > n[1] - n[0], true);
  });

  test('im Editor ausgeblendete Reihe fehlt, auch eine Gruppenreihe unter ihrem Namen', () => {
    const m = State.fromJSON({ datasets: [{ valueRef: ref('v'), groupRef: ref('g') }] });
    m.histogramChart = { series: [{ name: 'V — b', visible: false }] };
    assertDeepEqual(evaluateDerived(m, data).stats.map((r) => r.name), ['V — a']);
  });

  test('Einstellungen alter Stände (legacySeries) blenden nach Index aus', () => {
    const m = State.fromJSON({ datasets: [{ valueRef: ref('w'), groupRef: null }] });
    m.legacySeries = [{ visible: false }];
    assertDeepEqual(evaluateDerived(m, data).stats, []);
  });

  test('ohne Datensatz oder mit zu wenig Werten: leer; kein Zugriff auf i18n nötig', () => {
    assertDeepEqual(evaluateDerived(new State(), data).stats, []);
    const m = State.fromJSON({ datasets: [{ valueRef: ref('e'), groupRef: null }] });
    assertDeepEqual(evaluateDerived(m, wsOf({ v: [7] })).stats, []);
  });
});
