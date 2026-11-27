import { suite, test, assertEqual } from '../../test-utils.js';
import { legendModel } from '../../../js/modules/contour-plot/domain/legend.js';

const fixed1 = (v) => v.toFixed(1);

suite('contour-plot: legendModel', () => {
  test('produces N≤10 swatch items with rgb colors and fixed-1 values', () => {
    const m = legendModel(0, 100, 5, 'viridis', () => [10, 20, 30], 'Legend', fixed1);
    assertEqual(m.title, 'Legend', fixed1);
    assertEqual(m.items.length, 5);
    assertEqual(m.items[0].color, 'rgb(10,20,30)');
    assertEqual(m.items[0].value, '0.0');
    assertEqual(m.items[4].value, '100.0');
  });

  test('caps steps at 10 even when n is larger', () => {
    const m = legendModel(0, 9, 25, 'viridis', () => [1, 2, 3], 'L', fixed1);
    assertEqual(m.items.length, 10);
    // last step t = 9/9 = 1 → value 9 → "9.0"
    assertEqual(m.items[9].value, '9.0');
  });

  test('passes the interpolation parameter t to getColor', () => {
    const seen = [];
    legendModel(0, 100, 5, 'magma', (t) => { seen.push(t); return [0, 0, 0]; }, 'L', fixed1);
    assertEqual(seen.length, 5);
    assertEqual(seen[0], 0);
    assertEqual(seen[4], 1);
  });
});
