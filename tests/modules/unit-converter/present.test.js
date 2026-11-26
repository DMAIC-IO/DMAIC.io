/**
 * Tests for modules/unit-converter/viewmodel/present.js — Zahlenstufen in
 * Deutsch und Englisch (Exponent, gerundet, signifikante Stellen), Ergebnis-
 * und Formeltext, Uhrzeit und Datum der Zeitzonen nach `de-DE`/`en-US`, das
 * Kürzel und der Zeitunterschied. Dazu die Formatfälle der alten Suite.
 */
import { suite, test, assertEqual } from '../../test-utils.js';
import {
  fmtUnit, resultText, formulaText, zoneTime, zoneDate, tzAbbr, tzDiffText, localeOf,
} from '../../../js/modules/unit-converter/viewmodel/present.js';
import { utcFromInput } from '../../../js/modules/unit-converter/domain/convert.js';

const t = (k) => ({ undefined: 'undefiniert', logConversion: 'logarithmische Umrechnung' })[k] ?? k;

suite('unit-converter present: Zahlen', () => {
  test('Fälle der alten Suite (Deutsch)', () => {
    assertEqual(fmtUnit(0, 'de'), '0');
    assertEqual(fmtUnit(NaN, 'de'), '—');
    assertEqual(fmtUnit(Infinity, 'de'), '—');
    assertEqual(fmtUnit(null, 'de'), '—');
    assertEqual(fmtUnit(100, 'de'), '100');
    assertEqual(fmtUnit(38.1, 'de'), '38,1');
  });

  test('Exponent ab 1e12 und unter 1e-6, im Deutschen mit Komma', () => {
    assertEqual(fmtUnit(1e-7, 'de'), '1,000000e-7');
    assertEqual(fmtUnit(1e-7, 'en'), '1.000000e-7');
    assertEqual(fmtUnit(1.23456e12, 'de'), '1,234560e+12');
  });

  test('ab 1e6 höchstens zwei Nachkommastellen, gruppiert', () => {
    assertEqual(fmtUnit(1234567.891, 'de'), '1.234.567,89');
    assertEqual(fmtUnit(1234567.891, 'en'), '1,234,567.89');
  });

  test('ab 1 zehn signifikante und höchstens sechs Nachkommastellen', () => {
    assertEqual(fmtUnit(1.609344, 'de'), '1,609344');
    assertEqual(fmtUnit(1.23456789, 'de'), '1,234568');
    assertEqual(fmtUnit(48602.36220472, 'en'), '48,602.3622');
    assertEqual(fmtUnit(1000, 'de'), '1.000');
    assertEqual(fmtUnit(-1234.5, 'de'), '-1.234,5');
  });

  test('unter 1 acht signifikante Stellen', () => {
    assertEqual(fmtUnit(0.0254, 'de'), '0,0254');
    assertEqual(fmtUnit(0.0258598391, 'de'), '0,025859839');
    assertEqual(fmtUnit(0.0025, 'en'), '0.0025');
  });

  test('Ergebnis und Formel', () => {
    assertEqual(resultText(false, null, 'de', t), '—');
    assertEqual(resultText(true, null, 'de', t), 'undefiniert');
    assertEqual(resultText(true, 2500, 'de', t), '2.500');
    assertEqual(formulaText(false, 100, 'm', 'cm', 'de', t), '—');
    assertEqual(formulaText(true, 100, 'm', 'cm', 'de', t), '1 m = 100 cm');
    assertEqual(formulaText(true, null, 'dBm', 'W', 'de', t), 'logarithmische Umrechnung (dBm → W)');
  });
});

suite('unit-converter present: Zeitzonen', () => {
  const at = new Date('2026-01-12T00:00:00Z');

  test('Gebietsschema: de-DE, sonst en-US', () => {
    assertEqual(localeOf('de'), 'de-DE');
    assertEqual(localeOf('en'), 'en-US');
  });

  test('Uhrzeit 24 h in beiden Sprachen, Sekunden für die Weltzeituhr', () => {
    assertEqual(zoneTime(at, 'America/New_York', 'de'), '19:00');
    assertEqual(zoneTime(at, 'America/New_York', 'en'), '19:00');
    assertEqual(zoneTime(at, 'UTC', 'de', true), '00:00:00');
  });

  test('Mitternacht in en-US als 00, nie 24 (hourCycle h23)', () => {
    assertEqual(zoneTime(at, 'UTC', 'en'), '00:00');
    assertEqual(zoneTime(at, 'UTC', 'en', true), '00:00:00');
  });

  test('Datum mit Wochentag: de-DE und en-US', () => {
    assertEqual(zoneDate(at, 'America/New_York', 'de'), 'So., 11.01.2026');
    assertEqual(zoneDate(at, 'America/New_York', 'en'), 'Sun, 01/11/2026');
  });

  test('Kürzel und Zeitunterschied', () => {
    assertEqual(tzAbbr('America/New_York', at), 'EST');
    assertEqual(tzDiffText(utcFromInput(1, '01:00', '2026-01-12'), 'America/New_York'), '-6h (GMT+1 → EST)');
    assertEqual(tzDiffText(null, 'UTC'), '—');
  });
});
