import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { gageRunEncoding } from '../../../js/modules/msa-typ5/domain/gage-run.js';

const rows = (...v) => v.map((value) => ({ value }));
const lv = { positive: 'ok', negative: 'nok' };

suite('MSA Typ 5 — gageRunEncoding', () => {
  test('Zahlen: numeric', () => {
    assertDeepEqual(gageRunEncoding(rows('1', '2'), 'ordinal', lv), { kind: 'numeric' });
  });
  test('binär mit zwei Stufen', () => {
    assertDeepEqual(gageRunEncoding(rows('ok', 'nok'), 'binary', lv), { kind: 'binary', pos: 'ok', neg: 'nok' });
  });
  test('binär mit nur einer Stufe: null', () => {
    assertEqual(gageRunEncoding(rows('ok'), 'binary', { positive: 'ok', negative: null }), null);
  });
  test('nominal Text: null', () => {
    assertEqual(gageRunEncoding(rows('Kratzer', 'Delle'), 'nominal', lv), null);
  });
  test('keine Zeilen: null', () => {
    assertEqual(gageRunEncoding([], 'binary', lv), null);
    assertEqual(gageRunEncoding(null, 'binary', lv), null);
  });
});
