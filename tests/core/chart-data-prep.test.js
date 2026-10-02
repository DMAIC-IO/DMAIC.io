/**
 * D.Mike — chart-data-prep `toNum`: strict number coercion for cell values.
 * A typo'd cell ("20abc") must not pass as 20.
 */

import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { toNum } from '../../js/core/chart/chart-data-prep.js';

suite('chart-data-prep — toNum', () => {
  test('rejects a number followed by text', () => {
    assertTrue(Number.isNaN(toNum('20abc')), "'20abc' → NaN");
    assertTrue(Number.isNaN(toNum('1,5x')), "'1,5x' → NaN");
  });

  test('accepts surrounding whitespace and exponent notation', () => {
    assertEqual(toNum(' 12 '), 12);
    assertEqual(toNum('1e3'), 1000);
  });

  test('empty is NaN, numbers pass through', () => {
    assertTrue(Number.isNaN(toNum('')), "'' → NaN");
    assertTrue(Number.isNaN(toNum(null)), 'null → NaN');
    assertEqual(toNum(7), 7);
  });
});
