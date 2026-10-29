/**
 * Tests for core/agent/agent-argcheck.js — requireNumber.
 *
 * Die übrigen Prüfer sind über die Paritätsspecs der Module belegt; requireNumber
 * hat eine Zwischenform (Zahl oder Zahlentext), die hier direkt gesichert wird.
 */
import { suite, test, assertEqual, assertThrows } from '../../test-utils.js';
import { requireNumber, requireConfLevel, requireBoolean, requireNumericText, requireIndex, requireEnum }
  from '../../../js/core/agent/agent-argcheck.js';

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

  test('prüft einen Bereich und nennt ihn', () => {
    assertEqual(requireNumber('value', '0.8', { min: 0.5, max: 0.99 }), 0.8);
    assertThrows(() => requireNumber('value', 0.3, { min: 0.5, max: 0.99 }),
      /invalid value 0\.3; allowed: a number from 0\.5 to 0\.99/);
    assertThrows(() => requireNumber('value', 51, { min: 1, max: 50, integer: true }),
      /allowed: a whole number from 1 to 50/);
    assertThrows(() => requireNumber('value', 2.5, { min: 1, max: 50, integer: true }),
      /allowed: a whole number from 1 to 50/);
    assertThrows(() => requireNumber('value', -1, { min: 0 }), /allowed: a number of at least 0/);
    assertThrows(() => requireNumber('value', 9, { max: 5 }), /allowed: a number of at most 5/);
    assertThrows(() => requireNumber('value', 1.5, { integer: true }), /allowed: a whole number$/);
  });

  test('ohne Bereich bleibt die Prüfung unverändert', () => {
    assertEqual(requireNumber('mu0', '10'), 10);
    assertThrows(() => requireNumber('mu0', 'zehn'), /allowed: any finite number/);
  });

  test('prüft offene Grenzen und nennt sie', () => {
    assertEqual(requireNumber('value', 0.5, { exclusiveMin: 0, exclusiveMax: 1 }), 0.5);
    assertThrows(() => requireNumber('value', 0, { exclusiveMin: 0, exclusiveMax: 1 }),
      /invalid value 0; allowed: a number greater than 0 and less than 1$/);
    assertThrows(() => requireNumber('value', 1, { exclusiveMin: 0, exclusiveMax: 1 }),
      /allowed: a number greater than 0 and less than 1$/);
    assertEqual(requireNumber('value', 1, { exclusiveMin: 0, max: 1 }), 1);
    assertThrows(() => requireNumber('value', 0, { exclusiveMin: 0, max: 1 }),
      /allowed: a number greater than 0 and at most 1$/);
    assertThrows(() => requireNumber('value', -1, { exclusiveMin: 0 }), /allowed: a number greater than 0$/);
    assertThrows(() => requireNumber('value', 1, { min: 0, exclusiveMax: 1 }),
      /allowed: a number at least 0 and less than 1$/);
    assertThrows(() => requireNumber('value', 0, { exclusiveMin: 0, integer: true }),
      /allowed: a whole number greater than 0$/);
  });
});

suite('agent-argcheck requireConfLevel', () => {
  test('nimmt Werte echt zwischen 0 und 100, auch als Zahlentext', () => {
    assertEqual(requireConfLevel(95), 95);
    assertEqual(requireConfLevel('95'), 95);
    assertEqual(requireConfLevel(0.5), 0.5);
  });

  test('weist 0, 100, negative Werte und Nicht-Zahlen ab', () => {
    for (const bad of [0, 100, -1, 150]) {
      assertThrows(() => requireConfLevel(bad),
        new RegExp(`invalid value ${bad}; allowed: a number greater than 0 and less than 100`));
    }
    assertThrows(() => requireConfLevel('x'), /allowed: any finite number/);
  });
});

suite('agent-argcheck requireBoolean', () => {
  test('nimmt true und false und gibt sie zurück', () => {
    assertEqual(requireBoolean('on', true), true);
    assertEqual(requireBoolean('on', false), false);
  });
  test('weist alles andere mit "allowed: true, false" ab', () => {
    for (const bad of ['ja', 'true', 1, 0, null, undefined, {}]) {
      assertThrows(() => requireBoolean('on', bad), /^invalid on .*; allowed: true, false$/);
    }
  });
});

suite('agent-argcheck requireNumericText', () => {
  test('Text bleibt unverändert, auch Zwischenstände', () => {
    for (const s of ['', '-', '1.', '10', 'abc']) assertEqual(requireNumericText('value', s), s);
  });
  test('endliche Zahl wird Text', () => {
    assertEqual(requireNumericText('value', 10), '10');
    assertEqual(requireNumericText('value', -2.5), '-2.5');
  });
  test('weist NaN, Infinity und Nicht-Text ab', () => {
    for (const bad of [NaN, Infinity, null, undefined, true, {}, []]) {
      assertThrows(() => requireNumericText('value', bad),
        /allowed: any string or finite number, "" clears it$/);
    }
  });
});

suite('agent-argcheck requireIndex existing', () => {
  test('ohne Option bleibt 0..length erlaubt', () => {
    requireIndex('idx', 3, 3);
    assertThrows(() => requireIndex('idx', 4, 3), /allowed: 0\.\.3$/);
  });
  test('existing erlaubt nur vorhandene Elemente', () => {
    requireIndex('idx', 2, 3, { existing: true });
    assertThrows(() => requireIndex('idx', 3, 3, { existing: true }), /invalid idx 3; allowed: 0\.\.2$/);
    assertThrows(() => requireIndex('idx', -1, 3, { existing: true }), /allowed: 0\.\.2$/);
    assertThrows(() => requireIndex('idx', '1', 3, { existing: true }), /allowed: 0\.\.2$/);
  });
  test('leere Sammlung nennt das', () => {
    assertThrows(() => requireIndex('index', 0, 0, { existing: true }),
      /invalid index 0; allowed: none, the collection is empty$/);
  });
});

suite('agent-argcheck requireEnum numeric', () => {
  test('gibt das Mitglied zurück', () => {
    assertEqual(requireEnum('mode', 'a', ['a', 'b']), 'a');
  });
  test('ohne numeric bleibt Zahl gegen Zahlentext-Menge abgewiesen', () => {
    assertThrows(() => requireEnum('value', 6, ['6', '5.15']), /allowed: 6, 5\.15$/);
  });
  test('numeric ordnet Zahl und Zahlentext dem Mitglied zu', () => {
    assertEqual(requireEnum('value', 6, ['6', '5.15'], { numeric: true }), '6');
    assertEqual(requireEnum('value', 0.1, ['0.01', '0.05', '0.10'], { numeric: true }), '0.10');
    assertEqual(requireEnum('value', '2', [1, 2], { numeric: true }), 2);
    assertThrows(() => requireEnum('value', 5, ['6', '5.15'], { numeric: true }), /allowed: 6, 5\.15$/);
    assertThrows(() => requireEnum('value', true, [1, 2], { numeric: true }), /allowed: 1, 2$/);
    assertThrows(() => requireEnum('value', '0x2', [1, 2], { numeric: true }), /allowed: 1, 2$/);
  });
});
