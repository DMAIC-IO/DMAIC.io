/**
 * D.Mike — design type "full" (designs/full.js)
 * Spec: docs/superpowers/specs/2026-10-25-doe-planner-teil-viewmodels-design.md (E2)
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import full from '../../../js/modules/doe-planner/designs/full.js';
import { stateWith, NO_SOURCE } from './state.js';

suite('doe-planner designs — full', () => {
  test('flags', () => {
    assertEqual(full.id, 'full');
    assertEqual(full.centerPoints, true);
    assertEqual(full.twoLevelOnly, false);
    assertEqual(full.dispersion, true);
  });

  test('always valid on its own', () => {
    assertDeepEqual(full.check(stateWith(), NO_SOURCE), { ok: true, reason: null });
    assertEqual(full.isValid(stateWith(), NO_SOURCE), true);
  });

  test('2^k runs for two-level factors, +3 with center points', () => {
    assertEqual(full.runs(stateWith()), 4);
    assertEqual(full.runs(stateWith({ options: { centerPoints: true } })), 7);
  });

  test('product of level counts for mixed levels', () => {
    const s = stateWith({ factors: [['A', ['1', '2', '3']], ['B', ['1', '2']]] });
    assertEqual(full.runs(s), 6);
  });

  test('resolution is Full', () => {
    assertEqual(full.resolution(stateWith()), 'Full');
  });
});
