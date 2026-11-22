/**
 * Einzelwertdiagramm: Punktgruppen aus den Datensätzen (domain/groups.js).
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { buildGroups } from '../../../js/modules/individual-value-plot/domain/groups.js';

const REF = (id) => ({ instanceId: id, sheetId: 's1', columnId: id });
const row = (value, group = null, group2 = null, group3 = null) => ({ value, group, group2, group3 });

/** Leser über eine Tabelle Spalten-Id → Werte; Name „<id> col“ oder der gegebene. */
function reader(values, names = {}) {
  return {
    values: (ref) => values[ref.instanceId] ?? null,
    name: (ref) => (ref.instanceId in values ? (names[ref.instanceId] ?? `${ref.instanceId} col`) : null),
  };
}

suite('individual-value-plot: buildGroups ohne Gruppen', () => {
  const read = reader({ c1: [10, 12, 8, 15, 25], c2: [20, 22, 18, 25, 35] });

  test('eine Gruppe je Reihe', () => {
    const out = buildGroups([row(REF('c1'))], read);
    assertDeepEqual(out, { groups: [{ name: 'c1 col', values: [10, 12, 8, 15, 25] }] });
  });

  test('zwei Reihen → zwei Gruppen', () => {
    const out = buildGroups([row(REF('c1')), row(REF('c2'))], read);
    assertDeepEqual(out.groups.map((g) => g.name), ['c1 col', 'c2 col']);
  });

  test('nicht numerische, NaN und leere Werte fallen heraus', () => {
    const out = buildGroups([row(REF('m'))], reader({ m: [1, NaN, 2, null, 'x', 3] }));
    assertDeepEqual(out.groups[0].values, [1, 2, 3]);
  });

  test('ein einzelner Wert reicht (n = 1)', () => {
    assertDeepEqual(buildGroups([row(REF('c4'))], reader({ c4: [5] })).groups[0].values, [5]);
  });

  test('Zeilen ohne Wertespalte zählen nicht; ohne fertige Zeile keine Gruppen und kein Fehler', () => {
    assertDeepEqual(buildGroups([], read), { groups: [] });
    assertDeepEqual(buildGroups([row(null, REF('c1'))], read), { groups: [] });
    assertDeepEqual(buildGroups([row(null), row(REF('c2'))], read).groups.map((g) => g.name), ['c2 col']);
  });
});

suite('individual-value-plot: buildGroups mit Gruppen', () => {
  test('eine Gruppenspalte: eine Gruppe je Wert in der Reihenfolge des ersten Auftretens', () => {
    const out = buildGroups([row(REF('c1'), REF('g'))], reader({ c1: [10, 12, 8, 15, 25], g: ['G2', 'G1', 'G1', 'G2', 'G1'] }, { c1: 'C1' }));
    assertDeepEqual(out.groups, [{ name: 'C1 — G2', values: [10, 15] }, { name: 'C1 — G1', values: [12, 8, 25] }]);
  });

  test('Zeilen mit leerem Gruppenwert fallen heraus', () => {
    const out = buildGroups([row(REF('c1'), REF('g'))], reader({ c1: [1, 2, 3, 4], g: ['A', null, 'A', 'B'] }, { c1: 'C' }));
    assertDeepEqual(out.groups, [{ name: 'C — A', values: [1, 3] }, { name: 'C — B', values: [4] }]);
  });

  test('mehrere Gruppenspalten: Tupel mit „ | “', () => {
    const out = buildGroups([row(REF('c1'), REF('g1'), REF('g2'))], reader({
      c1: [1, 2, 3, 4], g1: ['A', 'A', 'B', 'B'], g2: ['X', 'Y', 'X', 'X'],
    }, { c1: 'C' }));
    assertDeepEqual(out.groups.map((g) => g.name), ['C — A | X', 'C — A | Y', 'C — B | X']);
  });

  test('G3 ohne G2 zählt wie eine Gruppenspalte', () => {
    const out = buildGroups([row(REF('c1'), null, null, REF('g'))], reader({ c1: [1, 2], g: ['A', 'B'] }, { c1: 'C' }));
    assertDeepEqual(out.groups.map((g) => g.name), ['C — A', 'C — B']);
  });

  test('Länge = kürzeste Spalte', () => {
    const out = buildGroups([row(REF('c1'), REF('g'))], reader({ c1: [1, 2, 3, 4, 5], g: ['A', 'A'] }, { c1: 'C' }));
    assertDeepEqual(out.groups, [{ name: 'C — A', values: [1, 2] }]);
  });
});

suite('individual-value-plot: buildGroups Fehler', () => {
  test('Reihe ohne Gruppen ohne Zahlen → errTooFew mit dem Spaltennamen', () => {
    assertDeepEqual(buildGroups([row(REF('c1'))], reader({ c1: ['x', null, NaN] }, { c1: 'C1' })), { error: 'errTooFew', params: { col: 'C1' } });
  });

  test('Gruppen ergeben nichts → errNoData', () => {
    assertDeepEqual(buildGroups([row(REF('c1'), REF('g'))], reader({ c1: [1, 2], g: [null, null] })), { error: 'errNoData', params: {} });
  });

  test('gelöschte Wertespalte: errTooFew mit „?“, gelöschte Gruppenspalte: errNoData', () => {
    assertDeepEqual(buildGroups([row(REF('gone'))], reader({})), { error: 'errTooFew', params: { col: '?' } });
    assertDeepEqual(buildGroups([row(REF('c1'), REF('gone'))], reader({ c1: [1, 2] })), { error: 'errNoData', params: {} });
  });
});
