import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { describeRange } from '../../js/core/param-input.js';

const t = (key) => (key === 'common.rangeAnd' ? 'und' : key === 'common.rangeInteger' ? 'ganzzahlig' : key);

suite('param-input', () => {
  test('describeRange beschreibt offene und geschlossene Grenzen', () => {
    assertEqual(describeRange({ min: 0.1, max: 10 }, 'de', t), '≥ 0,1 und ≤ 10');
    assertEqual(describeRange({ exclusiveMin: 0, exclusiveMax: 1 }, 'en', t), '> 0 und < 1');
    assertEqual(describeRange({ min: 1, integer: true }, 'de', t), '≥ 1, ganzzahlig');
    const big = describeRange({ min: 0.5, max: 1234.5 }, 'de', t);
    assertTrue(big.includes('≥ 0,5') && big.includes('≤ 1.234,5'), big);
  });
});
