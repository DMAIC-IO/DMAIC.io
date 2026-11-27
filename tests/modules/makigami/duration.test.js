/**
 * Makigami: Dauertexte (domain/duration.js) — alle Fälle der alten Suite,
 * dazu Dezimalkomma über parseDecimalInput und Bruchteile über roundTo.
 */
import { suite, test, assertEqual } from '../../test-utils.js';
import { parseDuration, formatDuration, canonicalize } from '../../../js/modules/makigami/domain/duration.js';
import { createDefaultTimeUnits } from '../../../js/modules/makigami/domain/defaults.js';

const UNITS = createDefaultTimeUnits();

suite('makigami Dauertexte', () => {
  test('leere Eingabe ist gültig und ergibt 0', () => {
    assertEqual(parseDuration('', UNITS).valid, true);
    assertEqual(parseDuration('', UNITS).seconds, 0);
    assertEqual(parseDuration('   ', UNITS).valid, true);
    assertEqual(parseDuration(null, UNITS).valid, true);
  });
  test('ein Baustein', () => {
    assertEqual(parseDuration('45min', UNITS).seconds, 2700);
    assertEqual(parseDuration('45 min', UNITS).seconds, 2700);
    assertEqual(parseDuration('45MIN', UNITS).seconds, 2700);
  });
  test('mehrere Bausteine addieren sich, 1 d = 28800 s', () => {
    assertEqual(parseDuration('1d 5h 30min', UNITS).seconds, 28800 + 18000 + 1800);
    assertEqual(parseDuration('1h 1h', UNITS).seconds, 7200);
  });
  test('Dezimalkomma und -punkt', () => {
    assertEqual(parseDuration('1,5h', UNITS).seconds, 5400);
    assertEqual(parseDuration('1.5h', UNITS).seconds, 5400);
  });
  test('ungültig: ohne Einheit, fremde Einheit, negativ, Text', () => {
    assertEqual(parseDuration('5', UNITS).valid, false);
    assertEqual(parseDuration('5x', UNITS).valid, false);
    assertEqual(parseDuration('-1h', UNITS).valid, false);
    assertEqual(parseDuration('20 Minuten', UNITS).valid, false);
    assertEqual(parseDuration('5x', UNITS).seconds, 0);
  });
  test('ohne Einheiten ungültig; Einheiten ohne Kürzel oder Faktor zählen nicht', () => {
    assertEqual(parseDuration('1h', []).valid, false);
    assertEqual(parseDuration('1h', [{ label: '', factorSeconds: 60 }, { label: 'h', factorSeconds: 0 }]).valid, false);
  });
  test('das längste Kürzel gewinnt (min vor m)', () => {
    const u = [{ label: 'm', factorSeconds: 60 }, { label: 'min', factorSeconds: 60 }];
    assertEqual(parseDuration('5min', u).valid, true);
    assertEqual(parseDuration('5min', u).seconds, 300);
  });
  test('formatDuration: gierig in der größten Einheit', () => {
    assertEqual(formatDuration(28800 + 18000 + 1800, UNITS), '1d 5h 30min');
    assertEqual(formatDuration(0, UNITS), '0s');
    assertEqual(formatDuration(5, []), '5');
  });
  test('formatDuration: Bruchteile mit höchstens zwei Stellen und Punkt', () => {
    const coarse = [{ label: 'h', factorSeconds: 3600 }];
    assertEqual(formatDuration(5400, coarse), '1.5h');
    assertEqual(formatDuration(1200, coarse), '0.33h');
    assertEqual(formatDuration(3600 + 1200, coarse), '1.33h');
  });
  test('canonicalize: lesbar in Normalform, unlesbar bleibt der Text', () => {
    assertEqual(canonicalize('90min', UNITS).text, '1h 30min');
    assertEqual(canonicalize('90min', UNITS).valid, true);
    assertEqual(canonicalize('gibberish', UNITS).valid, false);
    assertEqual(canonicalize('gibberish', UNITS).text, 'gibberish');
  });
});
