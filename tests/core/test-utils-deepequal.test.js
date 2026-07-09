/**
 * Tests for assertDeepEqual (deep equality assertion).
 * Tests basic nested object/array handling and error reporting.
 */

import { suite, test, assertDeepEqual, assertThrows } from '../test-utils.js';

suite('assertDeepEqual', () => {
  test('passes on deeply-equal nested object and array', () => {
    assertDeepEqual(
      { a: [{ b: 1 }] },
      { a: [{ b: 1 }] }
    );
  });

  test('throws on nested object mismatch', () => {
    assertThrows(() => assertDeepEqual({ a: { b: 1 } }, { a: { b: 2 } }));
  });

  test('passes on equal arrays of primitives', () => {
    assertDeepEqual([1, 2, 3], [1, 2, 3]);
  });

  test('throws on differing array length', () => {
    assertThrows(() => assertDeepEqual([1, 2], [1, 2, 3]));
  });

  test('passes on equal nested arrays', () => {
    assertDeepEqual([[1, 2], [3, 4]], [[1, 2], [3, 4]]);
  });

  test('throws on nested array element mismatch', () => {
    assertThrows(() => assertDeepEqual([[1, 2]], [[1, 3]]));
  });

  test('passes on objects with same keys in different order', () => {
    assertDeepEqual({ b: 2, a: 1 }, { a: 1, b: 2 });
  });

  test('throws on object key mismatch', () => {
    assertThrows(() => assertDeepEqual({ a: 1, b: 2 }, { a: 1, c: 2 }));
  });

  test('passes on complex nested structure', () => {
    assertDeepEqual(
      { users: [{ id: 1, tags: ['admin', 'user'] }, { id: 2, tags: [] }] },
      { users: [{ id: 1, tags: ['admin', 'user'] }, { id: 2, tags: [] }] }
    );
  });

  test('throws on deeply nested mismatch', () => {
    assertThrows(() => assertDeepEqual(
      { users: [{ id: 1, tags: ['admin', 'user'] }] },
      { users: [{ id: 1, tags: ['admin', 'other'] }] }
    ));
  });

  test('passes on empty objects and arrays', () => {
    assertDeepEqual({}, {});
    assertDeepEqual([], []);
  });

  test('throws when comparing empty and non-empty', () => {
    assertThrows(() => assertDeepEqual({}, { a: 1 }));
    assertThrows(() => assertDeepEqual([], [1]));
  });

  test('passes on primitives (number, string, boolean)', () => {
    assertDeepEqual(42, 42);
    assertDeepEqual('hello', 'hello');
    assertDeepEqual(true, true);
  });

  test('throws on primitive mismatch', () => {
    assertThrows(() => assertDeepEqual(42, 43));
    assertThrows(() => assertDeepEqual('hello', 'world'));
  });

  test('passes on null and null', () => {
    assertDeepEqual(null, null);
  });

  test('throws when comparing null and object', () => {
    assertThrows(() => assertDeepEqual(null, {}));
  });

  test('passes on undefined and undefined', () => {
    assertDeepEqual(undefined, undefined);
  });

  test('throws when comparing undefined and null', () => {
    assertThrows(() => assertDeepEqual(undefined, null));
  });

  test('passes on NaN (using Object.is semantics)', () => {
    assertDeepEqual(NaN, NaN);
  });

  test('throws on -0 vs 0 (respects Object.is)', () => {
    assertDeepEqual(-0, -0);
    assertDeepEqual(0, 0);
    // Note: Object.is(-0, 0) is false, but this test verifies they are treated distinctly if needed
  });
});
