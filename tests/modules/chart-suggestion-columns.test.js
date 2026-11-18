/**
 * Unit tests for chart-suggestion domain/columns.js.
 */
import { suite, test, assertEqual, assertDeepEqual, assertThrows } from '../test-utils.js';
import {
  toNum, parseDateValue, mean, countCategories, crossTabCategorical, collectTimeOrderedSeries,
  collectDateLineGroups, boxplotGroups, groupedAxisLabels, liveColumns, checkRefs, shownType,
} from '../../js/modules/chart-suggestion/domain/columns.js';
import { storedSource } from '../helpers/stored-source.js';

const ref = (id) => ({ instanceId: 'ws', sheetId: 's', columnId: id });
const key = (id, sheet = 's') => `ws|${sheet}|${id}`;
/** Ein Leser über ein Arbeitsblatt `ws` mit dem Blatt `s`; `roleConfirmed` ist `roleManual` im Stand. */
function fakeData(cols) {
  const columns = Object.entries(cols).map(([id, c]) => ({
    id, name: c.name, type: c.type, role: c.role, roleManual: c.roleConfirmed, values: c.values,
  }));
  return storedSource({ ws: { sheets: [{ id: 's', name: 'S', state: { columns } }] } });
}

suite('chart-suggestion domain — Zahlen und Daten', () => {
  test('toNum', () => {
    assertEqual(toNum('2,5'), 2.5);
    assertEqual(toNum(4), 4);
    assertEqual(Number.isNaN(toNum('')), true);
    assertEqual(Number.isNaN(toNum(null)), true);
    assertEqual(toNum('1.234,5'), 1234.5);
    assertEqual(toNum('1,234.5'), 1234.5);
    assertEqual(Number.isNaN(toNum('abc')), true);
  });
  test('parseDateValue', () => {
    assertEqual(parseDateValue(''), null);
    assertEqual(parseDateValue(5), 5);
    assertEqual(parseDateValue('nope'), null);
    assertEqual(parseDateValue('2026-01-01') > 0, true);
  });
  test('mean', () => {
    assertEqual(mean([]), 0);
    assertEqual(mean([1, 2, 3]), 2);
  });
});

suite('chart-suggestion domain — Gruppierungen', () => {
  test('countCategories überspringt leere Werte', () => {
    assertDeepEqual(countCategories(['a', 'b', 'a', '', null]), { categories: ['a', 'b'], counts: [2, 1] });
  });
  test('crossTabCategorical', () => {
    const r = crossTabCategorical({ values: ['x', 'x', 'y'] }, { values: ['p', 'q', 'p'] });
    assertDeepEqual(r.categories, ['x', 'y']);
    assertDeepEqual(r.groups.map((g) => g.values), [[1, 1], [1, 0]]);
  });
  test('collectTimeOrderedSeries sortiert nach Datum', () => {
    const r = collectTimeOrderedSeries(
      [{ name: 'D', values: ['2026-01-03', '2026-01-01', '2026-01-02'] }],
      [{ name: 'V', values: [3, 1, 2] }]);
    assertDeepEqual(r.values, [1, 2, 3]);
    assertEqual(r.xLabel, 'D');
    assertEqual(collectTimeOrderedSeries([], []), null);
  });
  test('collectDateLineGroups', () => {
    const d = { name: 'D', values: ['2026-01-01', '2026-01-02'] };
    const y = { name: 'Y', values: [1, 2] };
    const g = { name: 'G', values: ['a', 'b'] };
    const r = collectDateLineGroups([d], [y], [g]);
    assertEqual(r.groups.length, 2);
    assertEqual('legendTitle' in r, false);
    assertEqual(collectDateLineGroups([], [y], []), null);
  });
  test('boxplotGroups', () => {
    assertEqual(boxplotGroups([], []), null);
    const r = boxplotGroups([{ name: 'Y', values: [1, 2, 3] }], [{ name: 'G', values: ['a', 'a', 'b'] }]);
    assertDeepEqual(r.map((x) => [x.name, x.values]), [['a', [1, 2]], ['b', [3]]]);
  });
  test('groupedAxisLabels nimmt die übergebenen Texte', () => {
    const labels = { variable: 'Var', value: 'Wert' };
    assertDeepEqual(groupedAxisLabels([{ name: 'a' }, { name: 'b' }], [], labels), { xLabel: 'Var', yLabel: 'Wert' });
    assertDeepEqual(groupedAxisLabels([{ name: 'a' }], [{ name: 'g' }], labels), { xLabel: 'g', yLabel: 'a' });
  });
});

suite('chart-suggestion domain — liveColumns, checkRefs, shownType', () => {
  test('liveColumns lässt nicht auflösbare Bezüge weg', () => {
    const data = fakeData({ a: { name: 'A', type: 'numeric', role: 'continuous', roleConfirmed: true, values: [1] } });
    assertDeepEqual(liveColumns([ref('a'), ref('gone')], data),
      [{ id: 'a', name: 'A', type: 'numeric', role: 'continuous', roleConfirmed: true, values: [1] }]);
  });
  test('liveColumns: Name wie die Fassade (name, sonst Kurzname, sonst ?), Bezug ohne Blatt fällt weg', () => {
    const data = storedSource({ ws: { sheets: [{ id: 's', name: 'S', state: { columns: [
      { id: 'a', name: '', shortName: 'K', type: 'numeric', values: [1] },
      { id: 'b', name: '', type: 'text', values: ['x'] },
    ] } }] } });
    const cols = liveColumns([ref('a'), ref('b'), { instanceId: 'ws', columnId: 'a' }], data);
    assertDeepEqual(cols.map((c) => [c.name, c.roleConfirmed]), [['K', false], ['?', false]]);
  });
  test('checkRefs: leer, unbekannt, doppelt, zwei Blätter, gültig', () => {
    const keys = [key('a'), key('b')];
    assertThrows(() => checkRefs([], keys), /non-empty list/);
    assertThrows(() => checkRefs('x', keys), /non-empty list/);
    assertThrows(() => checkRefs([ref('zz')], keys), /ref/);
    assertThrows(() => checkRefs([ref('a'), ref('a')], keys), /each column once/);
    assertThrows(() => checkRefs([ref('a'), { ...ref('b'), sheetId: 's2' }], [key('a'), key('b', 's2')]), /columns of one sheet/);
    checkRefs([ref('a'), ref('b')], keys);
  });
  test('shownType', () => {
    assertEqual(shownType([{ type: 'bar' }, { type: 'pie' }], 'pie'), 'pie');
    assertEqual(shownType([{ type: 'bar' }], 'pie'), 'bar');
    assertEqual(shownType([{ type: 'bar' }], null), 'bar');
    assertEqual(shownType([], 'pie'), null);
  });
});
