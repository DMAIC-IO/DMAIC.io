/**
 * Tests for modules/random-generator/io/export.js — die Werte als Spalte
 * `Value` (stetig auf 8 Stellen gerundet, diskret ganz, attributiv Text, ohne
 * Werte null) und der Dateiname der Altform. Gegen die Rundung der
 * Alt-CSV: dieselben Werte, nur das Format kommt vom Kern.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { toRows, fileNameOf } from '../../../js/modules/random-generator/io/export.js';
import { generateSamples, resolveParams } from '../../../js/engines/random-variates-engine.js';

suite('random-generator Export', () => {
  test('stetig: Kopf Value, Zahlen auf 8 Stellen gerundet', () => {
    assertDeepEqual(toRows('normal', [1.123456789123, -2]), [['Value'], [1.12345679], [-2]]);
  });

  test('diskret ganz, attributiv Text, ohne Werte null', () => {
    assertDeepEqual(toRows('poisson', [3, 0]), [['Value'], [3], [0]]);
    assertDeepEqual(toRows('attributive', ['A', 'B, "x"']), [['Value'], ['A'], ['B, "x"']]);
    assertEqual(toRows('normal', []), null);
    assertEqual(toRows(null, []), null);
  });

  test('Dateiname wie die Altform, leerer Startwert als 42', () => {
    assertEqual(fileNameOf({ currentDist: 'normal', seed: 7, attrSeed: 1 }, 200), 'normal_seed7_n200');
    assertEqual(fileNameOf({ currentDist: 'attributive', seed: 7, attrSeed: 0 }, 300), 'attributive_seed0_n300');
    assertEqual(fileNameOf({ currentDist: 'uniform', seed: null, attrSeed: 0 }, 5), 'uniform_seed42_n5');
  });

  test('dieselben Werte wie die Alt-CSV (toFixed(8)) bei normal 5/2, n 200, Startwert 7', () => {
    const values = generateSamples('normal', resolveParams('normal', { mu: 5, sigma: 2 }), 200, 7);
    const legacy = ['Value', ...values.map((v) => v.toFixed(8))];
    const rows = toRows('normal', values);
    assertEqual(rows.length, legacy.length);
    for (let i = 1; i < rows.length; i++) assertEqual(rows[i][0], Number(legacy[i]), `Zeile ${i}`);
  });
});
