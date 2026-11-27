import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { legendModel, gridRange } from '../../../js/core/chart/color-legend.js';
import { getColor } from '../../../js/core/chart/color-schemes.js';

const fixed1 = (v) => v.toFixed(1);

suite('color-legend: legendModel', () => {
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

suite('color-legend: gridRange', () => {
  test('kleinster und größter endlicher Wert, Lücken übersprungen', () => {
    assertDeepEqual(gridRange([[3, null], [NaN, -1], [7]]), { zMin: -1, zMax: 7 });
  });
  test('ohne Wert null', () => {
    assertEqual(gridRange([[null], []]), null);
    assertEqual(gridRange([]), null);
  });
});

suite('color-schemes: hue (Altfarbe response-optimization)', () => {
  // Altform: hsl(220 − 210·t, 70 %, 55 %), umgerechnet und gerundet.
  test('Enden sind die Altfarben blau (220°) und rot (10°)', () => {
    assertDeepEqual(getColor(0, 'hue'), [60, 113, 221]);
    assertDeepEqual(getColor(1, 'hue'), [221, 87, 60]);
  });
  test('Mitte ist das Grün bei 115°', () => {
    // hsl(115, 70 %, 55 %) = rgb(73, 221, 60); linear zwischen 120° und 110° gerundet 74.
    const [r, g, b] = getColor(0.5, 'hue');
    assertDeepEqual([r, g, b], [74, 221, 60]);
  });
});
