/**
 * Tests for core/agent/agent-results.js — rohe Zahlen und Punktzeilen für die
 * Lesefläche der Regelkarten.
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { finiteOrNull, zipPoints, warning } from '../../../js/core/agent/agent-results.js';

suite('agent-results finiteOrNull', () => {
  test('endliche Zahlen bleiben, alles andere wird null', () => {
    assertEqual(finiteOrNull(1.5), 1.5);
    assertEqual(finiteOrNull(0), 0);
    assertEqual(finiteOrNull(-3), -3);
    for (const v of [NaN, Infinity, -Infinity, null, undefined, '3', {}, []]) {
      assertEqual(finiteOrNull(v), null, String(v));
    }
  });
});

suite('agent-results zipPoints', () => {
  test('legt Listen zeilenweise zusammen und verteilt Einzelwerte', () => {
    const { rows, columns } = zipPoints({ value: [1, 2, 3], ucl: 5, lcl: [0, NaN, 0] }, { signal: [2] });
    assertDeepEqual(columns, ['value', 'ucl', 'lcl', 'signal']);
    assertDeepEqual(rows, [
      { value: 1, ucl: 5, lcl: 0, signal: false },
      { value: 2, ucl: 5, lcl: null, signal: false },
      { value: 3, ucl: 5, lcl: 0, signal: true },
    ]);
  });

  test('eine kürzere Liste wird mit null aufgefüllt, null bleibt null', () => {
    const { rows } = zipPoints({ z: [1, 2, 3], mr: [null, 1] });
    assertDeepEqual(rows, [{ z: 1, mr: null }, { z: 2, mr: 1 }, { z: 3, mr: null }]);
  });

  test('ohne Liste gibt es keine Zeilen, die Spalten bleiben benannt', () => {
    assertDeepEqual(zipPoints({ cl: 3 }), { rows: [], columns: ['cl'] });
    assertDeepEqual(zipPoints({}, { signal: [] }), { rows: [], columns: ['signal'] });
  });

  test('mehrere Merkmale unabhängig voneinander', () => {
    const { rows } = zipPoints({ c: [0, 0] }, { high: [0], low: [1] });
    assertDeepEqual(rows, [{ c: 0, high: true, low: false }, { c: 0, high: false, low: true }]);
  });
});

suite('agent-results warning', () => {
  test('Code und endliche Werte, Nicht-Zahlen werden null', () => {
    assertEqual(JSON.stringify(warning('warnFewEvents', { epv: 4.25 })), '{"code":"warnFewEvents","values":{"epv":4.25}}');
    assertEqual(JSON.stringify(warning('warnSmallN')), '{"code":"warnSmallN","values":{}}');
    assertEqual(JSON.stringify(warning('x', { a: NaN, b: '3' })), '{"code":"x","values":{"a":null,"b":null}}');
  });
});
