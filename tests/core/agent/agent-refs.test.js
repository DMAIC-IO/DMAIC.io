/**
 * Tests for core/agent/agent-refs.js — the { $from, path } reference form
 * from Spec §4 and its runtime resolution.
 */
import { suite, test, assertEqual, assertTrue, assertDeepEqual } from '../../test-utils.js';
import { isRef, collectRefs, resolveRefs } from '../../../js/core/agent/agent-refs.js';

suite('agent reference detection', () => {
  test('recognises the object form', () => {
    assertTrue(isRef({ $from: 'a1', path: 'instanceId' }));
  });

  test('a plain object is not a reference', () => {
    assertEqual(isRef({ from: 'a1', path: 'x' }), false);
  });

  test('a string starting with $ is NOT a reference (user data collision)', () => {
    assertEqual(isRef('$a1.instanceId'), false);
  });

  test('$from without path is not a reference', () => {
    assertEqual(isRef({ $from: 'a1' }), false);
  });

  test('null and arrays are not references', () => {
    assertEqual(isRef(null), false);
    assertEqual(isRef([{ $from: 'a1', path: 'x' }]), false);
  });
});

suite('agent reference collection', () => {
  test('finds a reference nested inside args', () => {
    const action = { op: 'instance.call', instance: { $from: 'a3', path: 'instanceId' },
                     method: 'setSource', args: [{ $from: 'a1', path: 'instanceId' }] };
    assertDeepEqual(collectRefs(action), [
      { from: 'a3', path: 'instanceId' },
      { from: 'a1', path: 'instanceId' },
    ]);
  });

  test('finds a reference deep inside a nested object', () => {
    assertDeepEqual(collectRefs({ args: [{ opts: { src: { $from: 'r1', path: 'instances.0.id' } } }] }),
      [{ from: 'r1', path: 'instances.0.id' }]);
  });

  test('returns an empty list when there is nothing to resolve', () => {
    assertDeepEqual(collectRefs({ op: 'module.add', module: 'worksheet' }), []);
  });
});

suite('agent reference resolution', () => {
  const results = new Map([
    ['a1', { instanceId: 'ws-1' }],
    ['r1', { instances: [{ id: 'fw-1' }, { id: 'fw-2' }] }],
  ]);

  test('substitutes a reference with the referenced value', () => {
    const r = resolveRefs({ instance: { $from: 'a1', path: 'instanceId' } }, results);
    assertDeepEqual(r, { ok: true, value: { instance: 'ws-1' } });
  });

  test('resolves a path with a numeric index into a read result', () => {
    const r = resolveRefs({ instance: { $from: 'r1', path: 'instances.1.id' } }, results);
    assertEqual(r.value.instance, 'fw-2');
  });

  test('leaves non-reference values untouched, including $-prefixed strings', () => {
    const r = resolveRefs({ args: ['$not-a-ref', 7, null] }, results);
    assertDeepEqual(r.value.args, ['$not-a-ref', 7, null]);
  });

  test('an unknown id fails with the offending from/path', () => {
    const r = resolveRefs({ x: { $from: 'nope', path: 'instanceId' } }, results);
    assertEqual(r.ok, false);
    assertEqual(r.from, 'nope');
    assertEqual(r.path, 'instanceId');
  });

  test('a path that does not exist at runtime names the segment and the siblings', () => {
    const r = resolveRefs({ x: { $from: 'a1', path: 'instanceID' } }, results);
    assertEqual(r.ok, false);
    assertEqual(r.segment, 'instanceID');
    assertDeepEqual(r.available, ['instanceId']);
  });

  test('resolution does not mutate the input action', () => {
    const action = { instance: { $from: 'a1', path: 'instanceId' } };
    resolveRefs(action, results);
    assertDeepEqual(action, { instance: { $from: 'a1', path: 'instanceId' } });
  });
});
