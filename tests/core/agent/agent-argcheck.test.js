/**
 * Tests for core/agent/agent-argcheck.js — requireNumber (E6).
 *
 * Die übrigen Prüfer sind über die Paritätsspecs der Module belegt; requireNumber
 * hat eine Zwischenform (Zahl oder Zahlentext), die hier direkt gesichert wird.
 */
import { suite, test, assertEqual } from '../../test-utils.js';
import { requireNumber } from '../../../js/core/agent/agent-argcheck.js';

suite('agent-argcheck requireNumber', () => {
  test('nimmt eine endliche Zahl und gibt sie zurück', () => {
    assertEqual(requireNumber('value', 10), 10);
    assertEqual(requireNumber('value', -0.5), -0.5);
  });

  test('wandelt einen Zahlentext in eine Zahl', () => {
    assertEqual(requireNumber('value', '10'), 10);
    assertEqual(requireNumber('value', ' 2.5 '), 2.5);
  });

  test('nimmt Exponent und Vorzeichen, lehnt Hex und Binär ab', () => {
    assertEqual(requireNumber('value', '1e3'), 1000);
    assertEqual(requireNumber('value', '-2.5'), -2.5);
    for (const bad of ['0x10', '0b101', '0o7', -Infinity]) {
      let msg = '';
      try { requireNumber('value', bad); } catch (e) { msg = e.message; }
      assertEqual(msg.includes('allowed: any finite number'), true, `Wert ${String(bad)}: ${msg}`);
    }
  });

  test('weist Nicht-Zahlen mit der Menge "any finite number" ab', () => {
    for (const bad of ['zehn', '', '  ', NaN, Infinity, null, undefined, {}, [], true]) {
      let msg = '';
      try { requireNumber('value', bad); } catch (e) { msg = e.message; }
      assertEqual(msg.includes('allowed: any finite number'), true, `Wert ${String(bad)}: ${msg}`);
    }
  });
});
