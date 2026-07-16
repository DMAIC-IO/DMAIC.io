/** Unit tests for the shared factorial helper. */
import { suite, test, assertEqual } from '../test-utils.js';
import { factorial } from '../../js/engines/factorial.js';

suite('factorial', () => {
  test('0! = 1', () => assertEqual(factorial(0), 1));
  test('1! = 1', () => assertEqual(factorial(1), 1));
  test('5! = 120', () => assertEqual(factorial(5), 120));
  test('rounds input: factorial(5.4) = 120', () => assertEqual(factorial(5.4), 120));
  test('negative → NaN', () => assertEqual(Number.isNaN(factorial(-1)), true));
  test('171 → Infinity', () => assertEqual(factorial(171), Infinity));
});
