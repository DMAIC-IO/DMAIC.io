/**
 * Boxplot: Boxen aus den Datensätzen (domain/groups.js), gegen den alten
 * Gruppenbau festgehalten.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { buildGroups } from '../../../js/modules/boxplot/domain/groups.js';

const REF = (id) => ({ instanceId: id, sheetId: 's1', columnId: id });
const row = (value, group = null) => ({ value, group });

/** Leser über eine Tabelle Spalten-Id → Werte; Name „<id> col“ oder der gegebene. */
function reader(values, names = {}) {
  return {
    values: (ref) => values[ref.instanceId] ?? null,
    name: (ref) => (ref.instanceId in values ? (names[ref.instanceId] ?? `${ref.instanceId} col`) : null),
  };
}

suite('boxplot: buildGroups ohne Gruppe', () => {
  const read = reader({ c1: [10, 12, 8, 15, 25], c2: [20, 22, 18, 25, 35] });

  test('eine Box je Reihe, Name aus der Spalte', () => {
    assertDeepEqual(buildGroups([row(REF('c1')), row(REF('c2'))], read), {
      groups: [{ name: 'c1 col', values: [10, 12, 8, 15, 25] }, { name: 'c2 col', values: [20, 22, 18, 25, 35] }],
    });
  });

  test('nur Zahlen zählen: NaN, null und Text „2,5“ fallen heraus', () => {
    const out = buildGroups([row(REF('m'))], reader({ m: [1, NaN, 2, null, '2,5', 3] }));
    assertDeepEqual(out.groups[0].values, [1, 2, 3]);
  });

  test('weniger als zwei Werte → errTooFew für die ganze Zeichnung', () => {
    const out = buildGroups([row(REF('c1')), row(REF('one'))], reader({ c1: [1, 2, 3], one: [7] }, { one: 'Eins' }));
    assertDeepEqual(out, { error: 'errTooFew', params: { col: 'Eins' } });
  });

  test('fehlende Spalte zählt wie leer, Name „?“', () => {
    assertDeepEqual(buildGroups([row(REF('gone'))], read), { error: 'errTooFew', params: { col: '?' } });
  });

  test('Zeilen ohne Wertespalte zählen nicht; ohne fertige Zeile keine Boxen und kein Fehler', () => {
    assertDeepEqual(buildGroups([], read), { groups: [] });
    assertDeepEqual(buildGroups([row(null, REF('c1'))], read), { groups: [] });
    assertDeepEqual(buildGroups([row(null), row(REF('c2'))], read).groups.map((g) => g.name), ['c2 col']);
  });
});

suite('boxplot: buildGroups mit Gruppe', () => {
  test('eine Box je Gruppenwert in der Reihenfolge des ersten Auftretens', () => {
    const out = buildGroups([row(REF('c1'), REF('g'))], reader({ c1: [10, 12, 8, 15, 25], g: ['G2', 'G1', 'G1', 'G2', 'G1'] }, { c1: 'C1' }));
    assertDeepEqual(out, { groups: [{ name: 'C1 — G2', values: [10, 15] }, { name: 'C1 — G1', values: [12, 8, 25] }] });
  });

  test('Gruppen mit weniger als zwei Werten fallen still heraus', () => {
    const out = buildGroups([row(REF('c1'), REF('g'))], reader({ c1: [1, 2, 3], g: ['a', 'a', 'b'] }));
    assertDeepEqual(out.groups.map((g) => g.name), ['c1 col — a']);
  });

  test('kürzere Spalte begrenzt; null in Wert oder Gruppe fällt heraus; Zahlen als Gruppenwert werden Text', () => {
    const out = buildGroups([row(REF('c1'), REF('g'))], reader({ c1: [1, null, 3, 4, 5, 6, 7], g: [1, 1, null, 1, 2, 2] }));
    assertDeepEqual(out.groups, [{ name: 'c1 col — 1', values: [1, 4] }, { name: 'c1 col — 2', values: [5, 6] }]);
  });

  test('keine Box → errNoData; fehlende Gruppenspalte ergibt keine Box', () => {
    assertDeepEqual(buildGroups([row(REF('c1'), REF('g'))], reader({ c1: [1, 2], g: ['a', 'b'] })), { error: 'errNoData', params: {} });
    assertDeepEqual(buildGroups([row(REF('c1'), REF('gone'))], reader({ c1: [1, 2, 3] })), { error: 'errNoData', params: {} });
  });

  test('gemischt: Reihe mit und ohne Gruppe', () => {
    const out = buildGroups([row(REF('a'), REF('g')), row(REF('b'))], reader({ a: [1, 2, 3, 4], b: [5, 6], g: ['x', 'y', 'x', 'y'] }));
    assertDeepEqual(out.groups.map((g) => [g.name, g.values]), [['a col — x', [1, 3]], ['a col — y', [2, 4]], ['b col', [5, 6]]]);
  });

  test('Altprojekt: Durchsatz nach Linie und Zeit wie am Altmodul', () => {
    const read = reader({
      a: [10, 11, 12, 11, 10, 12, 11, 45, 10, 11, 12, 11],
      b: [20, 22, 21, 23, 22, 20, 21, 22, 23, 21, 22, 20],
      g: ['L1', 'L2', 'L1', 'L2', 'L1', 'L2', 'L1', 'L2', 'L1', 'L2', 'L1', 'L2'],
    }, { a: 'Durchsatz', b: 'Zeit' });
    const out = buildGroups([row(REF('a'), REF('g')), row(REF('b'))], read);
    assertDeepEqual(out.groups.map((g) => [g.name, g.values.length]), [['Durchsatz — L1', 6], ['Durchsatz — L2', 6], ['Zeit', 12]]);
    assertEqual(Math.max(...out.groups[1].values), 45);
  });
});
