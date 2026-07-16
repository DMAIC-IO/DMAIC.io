import { suite, test, assertEqual } from '../test-utils.js';
import { shouldApplyRoute } from '../../js/core/template-module.js';

// Approach: pure-helper tests.
//
// A full Alpine mount is impractical in the headless unit harness (the
// template-module.test.js sibling never mounts Alpine either).  Instead,
// `shouldApplyRoute(store, instanceId)` is exported from template-module.js
// as a side-effect-free predicate that encapsulates the correctness keystone
// of the generic onRouteChanged wiring: only the currently-routed instance
// reacts; all hidden sibling instances stay silent.

suite('shouldApplyRoute — route-instance gate', () => {
  test('returns true when store.instanceId matches', () => {
    assertEqual(shouldApplyRoute({ instanceId: 'abc', sub: ['x'] }, 'abc'), true);
  });

  test('returns false when store.instanceId differs', () => {
    assertEqual(shouldApplyRoute({ instanceId: 'other', sub: ['x'] }, 'abc'), false);
  });

  test('returns false for null store', () => {
    assertEqual(shouldApplyRoute(null, 'abc'), false);
  });

  test('returns false for undefined store', () => {
    assertEqual(shouldApplyRoute(undefined, 'abc'), false);
  });

  test('returns false when store has no instanceId', () => {
    assertEqual(shouldApplyRoute({ sub: ['x'] }, 'abc'), false);
  });

  test('returns false when instanceId is empty string and store.instanceId is different', () => {
    assertEqual(shouldApplyRoute({ instanceId: 'abc' }, ''), false);
  });

  test('returns true when both instanceId are empty string', () => {
    assertEqual(shouldApplyRoute({ instanceId: '' }, ''), true);
  });
});
