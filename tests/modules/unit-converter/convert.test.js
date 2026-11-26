/**
 * Tests for modules/unit-converter/domain/convert.js — verträgliche
 * Einheiten, Vorgaben, Umrechnung, Faktor, Schnellreferenz und die
 * Zeitzonenrechnung (Sommerzeit, Datumsgrenze, Stunde 24). Dazu die Fälle der
 * alten Suite.
 */
import { suite, test, assertEqual, assertDeepEqual, assertAlmostEqual, assertTrue } from '../../test-utils.js';
import {
  TIME_RE, groupMembers, unitKeysOf, defaultUnits, compatibleTo, convert, factor, refRows,
  parseGmtOffset, formatTzDiff, tzOffsetMinutes, utcFromInput, zonedParts, convertTimezone,
} from '../../../js/modules/unit-converter/domain/convert.js';

suite('unit-converter convert: Einheiten', () => {
  test('Größenart ohne Gruppen liefert alle Einheiten', () => {
    const members = groupMembers('laenge', 'm');
    assertTrue(members.includes('cm') && members.includes('m'));
    assertDeepEqual(members, unitKeysOf('laenge'));
  });

  test('Laborwerte liefern nur die Gruppe der Einheit', () => {
    assertDeepEqual(groupMembers('laborwerte', 'mgdl_bz'), ['mgdl_bz', 'mmoll_bz', 'gl_bz', 'mgml_bz']);
    assertTrue(!groupMembers('laborwerte', 'mgdl_bz').includes('umoll_kr'));
  });

  test('unbekannte Größenart: keine Einheiten', () => {
    assertDeepEqual(groupMembers('time', 'h'), []);
    assertDeepEqual(unitKeysOf('time'), []);
  });

  test('Vorgaben: die ersten zwei verträglichen Einheiten', () => {
    assertDeepEqual(defaultUnits('laenge'), { from: 'nm', to: 'um' });
    assertDeepEqual(defaultUnits('laborwerte'), { from: 'mgdl_bz', to: 'mmoll_bz' });
  });

  test('compatibleTo: bevorzugt, bisherig, sonst die erste andere', () => {
    assertEqual(compatibleTo('laborwerte', 'proz_hb', 'mmoll_bz', 'mmoll_bz'), 'mmolmol_hb');
    assertEqual(compatibleTo('laenge', 'm', 'cm', 'km'), 'km');
    assertEqual(compatibleTo('laenge', 'm', 'cm', 'm'), 'cm');
    assertEqual(compatibleTo('laenge', 'cm', 'cm'), 'nm');
  });
});

suite('unit-converter convert: Umrechnung', () => {
  test('1 m → cm = 100, 0 °C → °F = 32', () => {
    assertAlmostEqual(convert('laenge', 'm', 'cm', 1), 100, 1e-9);
    const keys = unitKeysOf('temperatur');
    assertAlmostEqual(convert('temperatur', keys[0], keys[1], 0), 32, 1e-9);
  });

  test('ungültige Eingabe oder Einheit: null', () => {
    assertEqual(convert('laenge', 'm', 'cm', NaN), null);
    assertEqual(convert('laenge', 'm', 'kg', 1), null);
    assertEqual(convert('time', 'h', 'min', 1), null);
  });

  test('Faktor: eine Ausgangseinheit; logarithmisch ohne festen Faktor', () => {
    assertAlmostEqual(factor('druck', 'bar', 'Pa'), 100000, 1e-6);
    assertAlmostEqual(factor('masse', 'kg', 'mg'), 1e6, 1e-6);
    assertAlmostEqual(convert('ph', 'pH', 'Hmol', 7), 1e-7, 1e-15);
  });

  test('Schnellreferenz Länge: 1 in → mm = 25,4', () => {
    const row = refRows('laenge').find((r) => r.from === 'in' && r.to === 'mm');
    assertTrue(Boolean(row));
    assertAlmostEqual(row.result, 25.4, 1e-9);
    assertDeepEqual(refRows('time'), []);
  });
});

suite('unit-converter convert: Zeitzonen', () => {
  test('formatTzDiff: Vorzeichen auch unter einer Stunde', () => {
    assertEqual(formatTzDiff(-30), '-0h 30min');
    assertEqual(formatTzDiff(-45), '-0h 45min');
    assertEqual(formatTzDiff(30), '+0h 30min');
    assertEqual(formatTzDiff(-90), '-1h 30min');
    assertEqual(formatTzDiff(0), '+0h');
    assertEqual(formatTzDiff(-60), '-1h');
    assertEqual(formatTzDiff(330), '+5h 30min');
  });

  test('parseGmtOffset', () => {
    assertEqual(parseGmtOffset('GMT-0:30'), -30);
    assertEqual(parseGmtOffset('GMT+5:30'), 330);
    assertEqual(parseGmtOffset('GMT-3:30'), -210);
    assertEqual(parseGmtOffset('GMT'), 0);
    assertEqual(parseGmtOffset('GMT+0'), 0);
    assertEqual(parseGmtOffset('GMT+1'), 60);
    assertEqual(parseGmtOffset('UTC'), 0);
  });

  test('Versatz mit Sommerzeit', () => {
    assertEqual(tzOffsetMinutes('Europe/Berlin', new Date('2026-01-12T12:00:00Z')), 60);
    assertEqual(tzOffsetMinutes('Europe/Berlin', new Date('2026-06-07T12:00:00Z')), 120);
    assertEqual(tzOffsetMinutes('Asia/Kolkata', new Date('2026-06-07T12:00:00Z')), 330);
  });

  test('utcFromInput: null ohne Uhrzeit, Datum oder Zone', () => {
    assertEqual(utcFromInput(1, '', '2026-01-12'), null);
    assertEqual(utcFromInput(1, '12:00', ''), null);
    assertEqual(utcFromInput(99, '12:00', '2026-01-12'), null);
    assertEqual(utcFromInput(1, '12:00', '2026-01-12').utc.toISOString(), '2026-01-12T11:00:00.000Z');
  });

  test('Berlin → New York über die Datumsgrenze', () => {
    assertDeepEqual(convertTimezone(1, 17, '01:00', '2026-01-12'), { time: '19:00', date: '2026-01-11', diffHours: -6 });
  });

  test('Paris → New York am Tag der Zeitumstellung', () => {
    assertDeepEqual(convertTimezone(5, 17, '23:30', '2026-03-29'), { time: '17:30', date: '2026-03-29', diffHours: -6 });
  });

  test('halbe Stunden als Bruchteil', () => {
    assertEqual(convertTimezone(0, 9, '00:00', '2026-06-07').diffHours, 5.5);
  });

  test('ohne Uhrzeit: alle Angaben null', () => {
    assertDeepEqual(convertTimezone(1, 0, '', '2026-06-07'), { time: null, date: null, diffHours: null });
  });

  test('zonedParts: Mitternacht ist 00, nie 24', () => {
    const p = zonedParts('UTC', new Date('2026-06-07T00:05:00Z'));
    assertDeepEqual(p, { date: '2026-06-07', time: '00:05' });
    assertTrue(TIME_RE.test(p.time));
  });

  test('TIME_RE: die Formen des Zeitfelds', () => {
    for (const ok of ['00:00', '09:05', '23:59']) assertTrue(TIME_RE.test(ok), ok);
    for (const bad of ['24:00', '9:00', '23:60', '14:30:00']) assertTrue(!TIME_RE.test(bad), bad);
  });
});
