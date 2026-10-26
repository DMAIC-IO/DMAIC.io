/**
 * nonReactive(): Core-Handles (Diagramme, Grids, Picker) bleiben in Alpine-
 * Viewmodel-Daten das Rohobjekt — kein Proxy, keine Reaktivität (Bug 14).
 */
import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { reactive } from '@vue/reactivity';
import { nonReactive } from '../../js/core/non-reactive.js';

suite('nonReactive', () => {
  test('setzt die Markierung und gibt dasselbe Objekt zurück', () => {
    const h = { a: 1 };
    assertTrue(nonReactive(h) === h);
    assertEqual(h.__v_skip, true);
  });

  test('die Markierung ist nicht aufzählbar und nicht beschreibbar', () => {
    const h = nonReactive({ a: 1 });
    const d = Object.getOwnPropertyDescriptor(h, '__v_skip');
    assertEqual(d.enumerable, false);
    assertEqual(d.writable, false);
    assertEqual(Object.keys(h).join(','), 'a');
    assertEqual(JSON.stringify(h), '{"a":1}');
  });

  test('zweimal markieren wirft nicht; null/undefined passieren', () => {
    const h = nonReactive(nonReactive({}));
    assertEqual(h.__v_skip, true);
    assertEqual(nonReactive(null), null);
    assertEqual(nonReactive(undefined), undefined);
  });

  test('reactive() lässt ein markiertes Handle unverpackt', () => {
    const h = nonReactive({ a: 1 });
    const data = reactive({ h, list: [h] });
    assertTrue(data.h === h);
    assertTrue(data.list[0] === h);
  });

  test('ohne Markierung verpackt reactive() das Objekt (Gegenprobe)', () => {
    const h = { a: 1 };
    assertTrue(reactive({ h }).h !== h);
  });
});
