import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { longRows, orderRatings, wideRows } from '../../../js/modules/msa-typ5/domain/rows.js';

suite('MSA Typ 5 — longRows', () => {
  test('Leerwerte werden zeilenweise übersprungen', () => {
    const out = longRows({
      parts: [1, 2, '', 4], appraisers: ['A', 'A', 'A', null], ratings: ['x', '', 'y', 'z'],
      references: null, replicates: null,
    });
    assertDeepEqual(out.rows, [{ part: '1', appraiser: 'A', value: 'x', rep: null }]);
  });
  test('rep nicht numerisch: Zeilenindex + 1', () => {
    const out = longRows({
      parts: [1, 1], appraisers: ['A', 'A'], ratings: ['x', 'y'], references: null, replicates: [3, 'abc'],
    });
    assertEqual(out.rows[0].rep, 3);
    assertEqual(out.rows[1].rep, 2);
  });
  test('Referenz je Teil', () => {
    const out = longRows({
      parts: [1, 2], appraisers: ['A', 'A'], ratings: ['x', 'y'], references: ['r1', 'r2'], replicates: null,
    });
    assertDeepEqual(out.referenceMap, { 1: 'r1', 2: 'r2' });
  });
  test('Pflichtspalte fehlt: null', () => {
    assertEqual(longRows({ parts: [1], appraisers: null, ratings: ['x'], references: null, replicates: null }), null);
  });
});

suite('MSA Typ 5 — orderRatings', () => {
  const r = (c) => ({ instanceId: 'w', sheetId: 's', columnId: c });
  test('Klickreihenfolge C, A, B → Blattreihenfolge A, B, C', () => {
    const keys = ['w|s|A', 'w|s|B', 'w|s|C'];
    assertDeepEqual(orderRatings([r('C'), r('A'), r('B')], keys).map((x) => x.columnId), ['A', 'B', 'C']);
  });
});

suite('MSA Typ 5 — wideRows', () => {
  const col = (name, values) => ({ name, values });
  test('6 Spalten, trials 4: Meldung', () => {
    const columns = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => col(n, ['x']));
    assertDeepEqual(wideRows({ parts: [1], columns, trials: 4, references: null }),
      { invalid: { key: 'errWideColumnsNotDivisible', vars: { columns: 6, trials: 4 } } });
  });
  test('ungültige Versuche: dieselbe Meldung, für sie gibt es keinen eigenen Text', () => {
    const out = wideRows({ parts: [1], columns: [col('a', ['x'])], trials: 0, references: null });
    assertEqual(out.invalid.key, 'errWideColumnsNotDivisible');
  });
  test('Zeilen und Referenzen', () => {
    const out = wideRows({
      parts: [1, 2], columns: [col('A-1', ['x', 'y']), col('A-2', ['x', 'z'])], trials: 2, references: ['r1', 'r2'],
    });
    assertEqual(out.rows.length, 4);
    assertEqual(out.rows[0].appraiser, 'A');
    assertDeepEqual(out.referenceMap, { 1: 'r1', 2: 'r2' });
  });
  test('ohne Teile oder Spalten: null', () => {
    assertEqual(wideRows({ parts: null, columns: [col('a', [])], trials: 1, references: null }), null);
    assertEqual(wideRows({ parts: [1], columns: [], trials: 1, references: null }), null);
  });
});
