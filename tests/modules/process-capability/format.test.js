/**
 * Process Capability: Zahlformat der Anzeige (domain/format.js). Rein, läuft in Node.
 */
import { suite, test, assertEqual } from '../../test-utils.js';
import { fmt, fmtZ, fmtFraction, fmtDec } from '../../../js/modules/process-capability/domain/format.js';

suite('process-capability: Zahlformat', () => {
  test('fmt: feste Stellen in der App-Sprache, Strich ohne Wert', () => {
    assertEqual(fmt(0.72694, 4, 'en'), '0.7269');
    assertEqual(fmt(0.72694, 4, 'de'), '0,7269');
    assertEqual(fmt(1.5, 2, 'de'), '1,50');
    assertEqual(fmt(12.4, 0, 'de'), '12');
    assertEqual(fmt(null, 4, 'de'), '–');
    assertEqual(fmt(NaN, 4, 'de'), '–');
  });
  test('fmt: vier Stellen als Vorgabe', () => {
    assertEqual(fmt(1, undefined, 'de'), '1,0000');
  });
  test('fmtZ: Unendlich als Zeichen, sonst wie fmt', () => {
    assertEqual(fmtZ(Infinity, 4, 'de'), '∞');
    assertEqual(fmtZ(-Infinity, 4, 'de'), '−∞');
    assertEqual(fmtZ(2.18, 2, 'de'), '2,18');
    assertEqual(fmtZ(2.18, 2, 'en'), '2.18');
  });
  test('fmtFraction: Exponent unter 1e-4, sonst sechs Stellen, Dezimalzeichen der Sprache', () => {
    assertEqual(fmtFraction(0, 'de'), '0');
    assertEqual(fmtFraction(0.0123456, 'de'), '0,012346');
    assertEqual(fmtFraction(0.0123456, 'en'), '0.012346');
    assertEqual(fmtFraction(1.2346e-6, 'de'), '1,235e-6');
    assertEqual(fmtFraction(1.2346e-6, 'en'), '1.235e-6');
  });
  test('fmtDec: ganze Zahl ohne Stellen, sonst zwei Stellen', () => {
    assertEqual(fmtDec(5, 'de'), '5');
    assertEqual(fmtDec(4.8333, 'de'), '4,83');
    assertEqual(fmtDec(4.8333, 'en'), '4.83');
  });
});
