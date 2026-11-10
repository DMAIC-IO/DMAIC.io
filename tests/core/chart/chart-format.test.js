/**
 * D.Mike — chart-core number and percent formatting follow the given locale
 *
 * Bug 11: statistics tables formatted numbers without a locale (the 'de'
 * default always won) and built percents as `toFixed(1) + '%'`, so German
 * showed "1.234,5" next to "69.1%" and English showed German numbers.
 * `formatNum` therefore requires a locale, and `formatPct` formats a share
 * (0…1) the way `Intl.NumberFormat` does for that locale.
 */

import { suite, test, assertEqual, assertTrue } from '../../test-utils.js';
import { formatNum, formatPct } from '../../../js/core/chart/chart-core.js';

const NBSP = ' ';

suite('chart-core formatNum — locale', () => {
  test('de: comma decimal, dot grouping', () => {
    assertEqual(formatNum(1234.5, 1, 'de'), '1.234,5');
  });
  test('en: dot decimal, comma grouping', () => {
    assertEqual(formatNum(1234.5, 1, 'en'), '1,234.5');
  });
  test('auto precision keeps the locale', () => {
    assertEqual(formatNum(3.14159, null, 'en'), '3.142');
    assertEqual(formatNum(3.14159, null, 'de'), '3,142');
  });
  test('without a locale it throws instead of silently using German', () => {
    let threw = false;
    try { formatNum(1.5, 1); } catch (e) { threw = e instanceof TypeError; }
    assertTrue(threw, 'formatNum without locale must throw a TypeError');
  });
});

suite('chart-core formatPct — share 0…1, locale-aware', () => {
  test('de: comma decimal and a no-break space before %', () => {
    assertEqual(formatPct(0.691, 1, 'de'), `69,1${NBSP}%`);
  });
  test('en: dot decimal, % directly attached', () => {
    assertEqual(formatPct(0.691, 1, 'en'), '69.1%');
  });
  test('100 % with fixed decimals', () => {
    assertEqual(formatPct(1, 1, 'de'), `100,0${NBSP}%`);
    assertEqual(formatPct(1, 1, 'en'), '100.0%');
  });
  test('grouping above 1000 %', () => {
    assertEqual(formatPct(12.345, 1, 'de'), `1.234,5${NBSP}%`);
    assertEqual(formatPct(12.345, 1, 'en'), '1,234.5%');
  });
  test('zero decimals', () => {
    assertEqual(formatPct(0.8, 0, 'en'), '80%');
  });
  test('non-finite share renders as a dash', () => {
    assertEqual(formatPct(NaN, 1, 'de'), '—');
  });
  test('without a locale it throws', () => {
    let threw = false;
    try { formatPct(0.5, 1); } catch (e) { threw = e instanceof TypeError; }
    assertTrue(threw, 'formatPct without locale must throw a TypeError');
  });
});

suite('chart-core formatNum — Ausgabe-Pins (de/en unverändert)', () => {
  const PINS = {
    "0.012345|null|de": "0,0123",
    "0.012345|null|en": "0.0123",
    "0.012345|0|de": "0",
    "0.012345|0|en": "0",
    "0.012345|2|de": "0,01",
    "0.012345|2|en": "0.01",
    "1.23456|null|de": "1,235",
    "1.23456|null|en": "1.235",
    "1.23456|0|de": "1",
    "1.23456|0|en": "1",
    "1.23456|2|de": "1,23",
    "1.23456|2|en": "1.23",
    "999.95|null|de": "1.000",
    "999.95|null|en": "1,000",
    "999.95|0|de": "1.000",
    "999.95|0|en": "1,000",
    "999.95|2|de": "999,95",
    "999.95|2|en": "999.95",
    "1234.5|null|de": "1.235",
    "1234.5|null|en": "1,235",
    "1234.5|0|de": "1.235",
    "1234.5|0|en": "1,235",
    "1234.5|2|de": "1.234,50",
    "1234.5|2|en": "1,234.50",
    "-98765.4|null|de": "-98.765",
    "-98765.4|null|en": "-98,765",
    "-98765.4|0|de": "-98.765",
    "-98765.4|0|en": "-98,765",
    "-98765.4|2|de": "-98.765,40",
    "-98765.4|2|en": "-98,765.40",
    "1.005|2|en": "1.00",
    "1.005|2|de": "1,00",
    "2.675|2|en": "2.67",
    "2.675|2|de": "2,67",
    "8.345|2|en": "8.35",
    "8.345|2|de": "8,35",
  };
  for (const [key, expected] of Object.entries(PINS)) {
    const [v, d, l] = key.split('|');
    test(`formatNum(${v}, ${d}, ${l}) = ${expected}`, () => {
      assertEqual(formatNum(Number(v), d === 'null' ? null : Number(d), l), expected);
    });
  }
  test('NaN bleibt "NaN"', () => {
    assertEqual(formatNum(NaN, 2, 'de'), 'NaN');
  });
  test('unbekannte Sprache wirft nicht', () => {
    assertEqual(typeof formatNum(1234.5, 1, 'fr'), 'string');
  });
});
