/**
 * Tests for js/core/number-format.js — Zahlen nach App-Sprache lesen und formatieren.
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import {
  parseNumber,
  formatNumber,
  formatPercent,
  decimalSeparator,
  roundTo,
} from '../../js/core/number-format.js';

suite('parseNumber — Lesetabelle', () => {
  test('gültige Schreibweisen', () => {
    const cases = [
      ['24,5', 24.5],
      ['24.5', 24.5],
      ['1.234', 1.234],
      ['1,234', 1.234],
      ['1.234,5', 1234.5],
      ['1,234.5', 1234.5],
      ['1,234,567.5', 1234567.5],
      ['1e3', 1000],
      ['-0,5', -0.5],
      ['+3', 3],
      ['  -1.234,5 ', -1234.5],
      [24.5, 24.5],
    ];
    for (const [raw, want] of cases) assertEqual(parseNumber(raw), want, `Eingabe ${JSON.stringify(raw)}`);
  });

  test('leer ergibt null', () => {
    for (const raw of [null, undefined, '', '  ']) assertEqual(parseNumber(raw), null);
  });

  test('ungültig ergibt NaN', () => {
    for (const raw of ['3,5x', '1,2,3', '-', '1.23,5', '1,23.5']) {
      assertTrue(Number.isNaN(parseNumber(raw)), `Eingabe ${JSON.stringify(raw)}`);
    }
  });
});

suite('formatNumber — Profil input', () => {
  test('Dezimalzeichen nach Sprache, keine Gruppierung', () => {
    assertEqual(formatNumber(24.5, 'de', { profile: 'input' }), '24,5');
    assertEqual(formatNumber(24.5, 'en', { profile: 'input' }), '24.5');
    assertEqual(formatNumber(1234.5, 'de', { profile: 'input' }), '1234,5');
  });

  test('verlustfrei, e-Schreibweise bleibt', () => {
    assertEqual(formatNumber(0.1 + 0.2, 'de', { profile: 'input' }), '0,30000000000000004');
    assertEqual(formatNumber(1e-7, 'de', { profile: 'input' }), '1e-7');
    assertEqual(formatNumber(1.5e-7, 'de', { profile: 'input' }), '1,5e-7');
  });

  test('decimals und precision', () => {
    assertEqual(formatNumber(2, 'de', { profile: 'input', decimals: 3 }), '2,000');
    assertEqual(formatNumber(1234.5, 'de', { profile: 'input', precision: 6 }), '1234,50');
  });

  test('Rundtrip', () => {
    for (const v of [24.5, 0.1 + 0.2, -1e-7, 123456789.125, 1e21, 0]) {
      for (const lang of ['de', 'en']) {
        assertEqual(parseNumber(formatNumber(v, lang, { profile: 'input' })), v, `${v} ${lang}`);
      }
    }
  });
});

suite('formatNumber — Profil output', () => {
  test('mit decimals', () => {
    assertEqual(formatNumber(1234.5, 'de', { decimals: 1 }), '1.234,5');
    assertEqual(formatNumber(1234.5, 'en', { decimals: 1 }), '1,234.5');
    assertEqual(formatNumber(-0.5, 'de', { decimals: 2 }), '-0,50');
  });

  test('ohne decimals: kürzeste Darstellung, gruppiert', () => {
    assertEqual(formatNumber(1234.5, 'de'), '1.234,5');
    assertEqual(formatNumber(-1234567, 'en'), '-1,234,567');
    assertEqual(formatNumber(0.1 + 0.2, 'de'), '0,30000000000000004');
    assertEqual(formatNumber(1.5e-7, 'de'), '1,5e-7');
  });
});

suite('formatNumber — Sonderwerte', () => {
  test('null und undefined ergeben leeren Text', () => {
    assertEqual(formatNumber(null, 'de'), '');
    assertEqual(formatNumber(undefined, 'en', { profile: 'input' }), '');
  });

  test('NaN und Infinity wie String()', () => {
    for (const profile of ['input', 'output']) {
      assertEqual(formatNumber(NaN, 'de', { profile }), 'NaN');
      assertEqual(formatNumber(Infinity, 'de', { profile }), 'Infinity');
      assertEqual(formatNumber(-Infinity, 'en', { profile, decimals: 2 }), '-Infinity');
    }
  });
});

suite('formatPercent, decimalSeparator, roundTo', () => {
  test('formatPercent folgt Intl', () => {
    const want = (lang) => new Intl.NumberFormat(lang, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(0.1234);
    assertEqual(formatPercent(0.1234, 'de', 1), want('de'));
    assertEqual(formatPercent(0.1234, 'en', 1), '12.3%');
    assertTrue(formatPercent(0.1234, 'de', 1).startsWith('12,3'));
  });

  test('decimalSeparator', () => {
    assertEqual(decimalSeparator('de'), ',');
    assertEqual(decimalSeparator('en'), '.');
  });

  test('roundTo', () => {
    assertEqual(roundTo(0.123456, 4), 0.1235);
  });
});

suite('formatNumber — decimals entspricht toFixed (Binär-Halbfälle)', () => {
  test('1.005, 2.675, 8.345 mit 2 Stellen, de/en, beide Profile', () => {
    for (const v of [1.005, 2.675, 8.345]) {
      for (const lang of ['de', 'en']) {
        const sep = lang === 'de' ? ',' : '.';
        const want = v.toFixed(2).replace('.', sep);
        assertEqual(formatNumber(v, lang, { decimals: 2 }), want, `output ${v} ${lang}`);
        assertEqual(formatNumber(v, lang, { profile: 'input', decimals: 2 }), want, `input ${v} ${lang}`);
      }
    }
  });
  test('precision entspricht toPrecision', () => {
    assertEqual(formatNumber(1.005, 'en', { profile: 'input', precision: 3 }), (1.005).toPrecision(3));
    assertEqual(formatNumber(1234.5678, 'de', { profile: 'input', precision: 4 }), (1234.5678).toPrecision(4).replace('.', ','));
  });
});

