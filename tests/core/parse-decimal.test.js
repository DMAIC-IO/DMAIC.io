/**
 * Tests for js/core/parse-decimal.js — Dezimaleingaben mit Komma oder Punkt.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { parseDecimalInput, decimalOr } from '../../js/core/parse-decimal.js';

suite('parseDecimalInput', () => {
  test('leer, null, undefined und nur Leerraum ergeben null', () => {
    for (const raw of [null, undefined, '', '   ', '\t']) {
      assertEqual(parseDecimalInput(raw), null, `Eingabe ${JSON.stringify(raw)}`);
    }
  });

  test('Zahlen und gültige Schreibweisen', () => {
    const cases = [
      ['3,5', 3.5],
      [' 3,5 ', 3.5],
      ['-0,25', -0.25],
      [',5', 0.5],
      ['1.234,5', 1234.5],
      ['-1.234.567,89', -1234567.89],
      ['1234.5', 1234.5],
      ['-0.5', -0.5],
      ['1e3', 1000],
      ['1.234', 1.234],
      ['20', 20],
      ['0', 0],
      [3.5, 3.5],
      [0, 0],
    ];
    for (const [raw, expected] of cases) {
      assertEqual(parseDecimalInput(raw), expected, `Eingabe ${JSON.stringify(raw)}`);
    }
  });

  test('Ungültiges ergibt NaN', () => {
    for (const raw of ['3,5x', '-', '1,2,3', 'abc', '1.2,3.4', '1,234.5', '3x']) {
      const v = parseDecimalInput(raw);
      assertTrue(Number.isNaN(v), `Eingabe ${JSON.stringify(raw)} → ${v}`);
    }
  });
});

suite('decimalOr', () => {
  test('gültige Zahl, auch 0, sonst Rückfallwert', () => {
    assertEqual(decimalOr('0', -1), 0);
    assertEqual(decimalOr('2,5', -1), 2.5);
    assertEqual(decimalOr(7, -1), 7);
    assertEqual(decimalOr('', -1), -1);
    assertEqual(decimalOr(undefined, 1), 1);
    assertEqual(decimalOr('abc', 1), 1);
    assertEqual(decimalOr('3,5x', null), null);
  });
});
