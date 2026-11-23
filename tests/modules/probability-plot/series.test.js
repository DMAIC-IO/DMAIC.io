/**
 * Wahrscheinlichkeitsnetz: Reihenbau (domain/series.js) — die Fälle des alten
 * Reihenbaus im Altmodul.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { buildGroups, buildSeries, seriesName } from '../../../js/modules/probability-plot/domain/series.js';

/** Spaltenleser über eine Tabelle Spalten-Id → { name, values }. */
const reader = (cols) => ({
  values: (ref) => cols[ref.columnId]?.values ?? null,
  name: (ref) => (cols[ref.columnId] ? cols[ref.columnId].name : null),
});
const ref = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
const row = (valueRef, groupRef = null) => ({ valueRef, groupRef });

const COLS = {
  a: { name: 'A', values: [1, 2, 3, 4, 5, 6] },
  b: { name: 'B', values: [7, '2,5', null, 8, NaN, 9, Infinity] },
  g: { name: 'G', values: ['x', 'y', 'x', 'y', 'z', 'x'] },
  gs: { name: 'G kurz', values: ['x', 'y', 'x'] },
  gn: { name: 'G leer', values: [null, '', 'p', 'p', null, ''] },
  ge: { name: 'G nichts', values: [null, '', null] },
  one: { name: 'Eins', values: [4] },
  text: { name: 'Text', values: ['1', '2', 3] },
};
const R = reader(COLS);

suite('probability-plot: Reihenbau', () => {
  test('ohne Gruppe: Zahlen außer NaN zählen, Text „2,5“ nicht', () => {
    const out = buildGroups([row(ref('a')), row(ref('b'))], R);
    assertDeepEqual(out, { groups: [
      { col: 'A', level: null, values: [1, 2, 3, 4, 5, 6] },
      { col: 'B', level: null, values: [7, 8, 9, Infinity] },
    ] });
  });

  test('ohne Gruppe: weniger als zwei Werte → errTooFew mit Spaltenname', () => {
    assertDeepEqual(buildGroups([row(ref('a')), row(ref('one'))], R), { error: 'errTooFew', params: { col: 'Eins' } });
    assertDeepEqual(buildGroups([row(ref('text'))], R), { error: 'errTooFew', params: { col: 'Text' } });
  });

  test('fehlende Spalte zählt wie leer, Name „?“', () => {
    assertDeepEqual(buildGroups([row(ref('gone'))], R), { error: 'errTooFew', params: { col: '?' } });
  });

  test('Zeile ohne valueRef wird übersprungen, keine Zeile ergibt keine Gruppe', () => {
    assertDeepEqual(buildGroups([row(null, ref('g')), row(ref('a'))], R).groups.map((g) => g.col), ['A']);
    assertDeepEqual(buildGroups([row(null)], R), { groups: [] });
    assertDeepEqual(buildGroups([], R), { groups: [] });
  });

  test('mit Gruppe: Reihenfolge des ersten Auftretens, Stufe mit < 2 Werten fällt still weg', () => {
    const out = buildGroups([row(ref('a'), ref('g'))], R);
    assertDeepEqual(out, { groups: [
      { col: 'A', level: 'x', values: [1, 3, 6] },
      { col: 'A', level: 'y', values: [2, 4] },
    ] });
  });

  test('mit Gruppe: die kürzere Spalte bestimmt die Länge, null und leerer Text fallen heraus', () => {
    assertDeepEqual(buildGroups([row(ref('a'), ref('gs'))], R), { groups: [{ col: 'A', level: 'x', values: [1, 3] }] });
    assertDeepEqual(buildGroups([row(ref('a'), ref('gn'))], R), { groups: [{ col: 'A', level: 'p', values: [3, 4] }] });
  });

  test('mit Gruppe: keine Stufe → errNoGroupLevels mit Zeilennummer, alle Stufen < 2 → errTooFew', () => {
    assertDeepEqual(buildGroups([row(ref('a')), row(ref('a'), ref('ge'))], R), { error: 'errNoGroupLevels', params: { n: 2 } });
    assertDeepEqual(buildGroups([row(ref('a'), ref('gone'))], R), { error: 'errNoGroupLevels', params: { n: 1 } });
    assertDeepEqual(buildGroups([row(ref('one'), ref('g'))], R), { error: 'errTooFew', params: { col: 'Eins' } });
  });

  test('Name: Spalte, mit Gruppe „Spalte — Stufe“', () => {
    assertEqual(seriesName({ col: 'A', level: null }), 'A');
    assertEqual(seriesName({ col: 'A', level: 'x' }), 'A — x');
  });

  test('buildSeries: Name, Werte, sichtbar, ohne Farbe; legacySeries je Index samt name', () => {
    const datasets = [row(ref('a'), ref('g')), row(ref('b'))];
    const plainOut = buildSeries({ datasets, legacySeries: [] }, R);
    assertDeepEqual(plainOut.series.map((s) => Object.keys(s).sort()), [['name', 'values', 'visible'], ['name', 'values', 'visible'], ['name', 'values', 'visible']]);
    assertDeepEqual(plainOut.series.map((s) => s.name), ['A — x', 'A — y', 'B']);
    const out = buildSeries({ datasets, legacySeries: [{ name: 'Linie Eins', color: '#aa3355' }, {}, { visible: false, lineColor: '#336699' }, { name: 'zu viel' }] }, R);
    assertDeepEqual(out.series.map(({ values, ...s }) => s), [
      { name: 'Linie Eins', visible: true, color: '#aa3355' },
      { name: 'A — y', visible: true },
      { name: 'B', visible: false, lineColor: '#336699' },
    ]);
  });

  test('buildSeries reicht den Fehler weiter', () => {
    assertDeepEqual(buildSeries({ datasets: [row(ref('one'))], legacySeries: [] }, R), { error: 'errTooFew', params: { col: 'Eins' } });
  });
});
