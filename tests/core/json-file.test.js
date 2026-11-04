/**
 * Tests for js/core/json-file.js — den Editor-Verweis $schema beim Lesen entfernen.
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../test-utils.js';
import { withoutSchema } from '../../js/core/json-file.js';

suite('json-file: withoutSchema', () => {
  test('entfernt $schema auf oberster Ebene, Rest bleibt', () => {
    const src = { $schema: '../x.json', a: 1, b: { $schema: 'innen' } };
    assertDeepEqual(withoutSchema(src), { a: 1, b: { $schema: 'innen' } });
    assertEqual(src.$schema, '../x.json', 'Quelle unverändert');
  });

  test('ohne $schema, Arrays und Nicht-Objekte: dieselbe Referenz', () => {
    const plain = { a: 1 };
    const list = [1];
    assertTrue(withoutSchema(plain) === plain);
    assertTrue(withoutSchema(list) === list);
    assertEqual(withoutSchema(null), null);
    assertEqual(withoutSchema('x'), 'x');
  });
});
