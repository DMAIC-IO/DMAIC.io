/**
 * D.Mike — design types "dopt"/"aopt"/"gopt" (designs/optimal.js)
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import optimal from '../../../js/modules/doe-planner/designs/optimal.js';
import { stateWith, NO_SOURCE } from './state.js';

suite('doe-planner designs — optimal', () => {
  test('flags', () => {
    assertEqual(optimal.id, 'optimal');
    assertEqual(optimal.centerPoints, false);
    assertEqual(optimal.dispersion, true);
  });

  test('min runs from the active terms; with a source the new runs shrink, at least 1', () => {
    const s = stateWith({ designType: 'dopt' });
    // default terms for k=2: M0, M1, M0·M1 → 3 terms + intercept = 4
    assertEqual(optimal.minRuns(s), 4);
    assertEqual(optimal.minNewRuns(s, NO_SOURCE), 4);
    assertEqual(optimal.minNewRuns(s, { sourceRowCount: 2 }), 2);
    assertEqual(optimal.minNewRuns(s, { sourceRowCount: 10 }), 1);
  });

  test('raiseRunsToMinimum raises too few runs and never lowers', () => {
    const s = stateWith({ designType: 'dopt', options: { optimalRuns: 2 } });
    optimal.raiseRunsToMinimum(s, NO_SOURCE);
    assertEqual(s.options.optimalRuns, 4);
    s.options.optimalRuns = 9;
    optimal.raiseRunsToMinimum(s, NO_SOURCE);
    assertEqual(s.options.optimalRuns, 9);
    s.options.optimalRuns = 0;
    optimal.raiseRunsToMinimum(s, { sourceRowCount: 2 });
    assertEqual(s.options.optimalRuns, 2);
  });

  test('too few runs is invalid', () => {
    assertDeepEqual(optimal.check(stateWith({ designType: 'dopt', options: { optimalRuns: 3 } }), NO_SOURCE),
      { ok: false, reason: 'tooFewOptimalRuns' });
    assertEqual(optimal.isValid(stateWith({ designType: 'dopt', options: { optimalRuns: 4 } }), NO_SOURCE), true);
    assertEqual(optimal.isValid(stateWith({ designType: 'dopt', options: { optimalRuns: 2 } }), { sourceRowCount: 2 }), true);
  });

  test('runs: the requested count, else the minimum', () => {
    assertEqual(optimal.runs(stateWith({ designType: 'dopt', options: { optimalRuns: 9 } })), 9);
    assertEqual(optimal.runs(stateWith({ designType: 'dopt' })), 4);
  });

  test('resolution follows the criterion', () => {
    assertEqual(optimal.resolution(stateWith({ designType: 'dopt' })), 'D-Opt');
    assertEqual(optimal.resolution(stateWith({ designType: 'aopt' })), 'A-Opt');
    assertEqual(optimal.resolution(stateWith({ designType: 'gopt' })), 'G-Opt');
  });
});
