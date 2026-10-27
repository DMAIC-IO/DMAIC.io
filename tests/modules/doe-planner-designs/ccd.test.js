/**
 * D.Mike — design type "ccd" (designs/ccd.js)
 * Spec: docs/superpowers/specs/2026-10-25-doe-planner-teil-viewmodels-design.md (E2)
 */
import { suite, test, assertEqual } from '../../test-utils.js';
import ccd from '../../../js/modules/doe-planner/designs/ccd.js';
import { stateWith, NO_SOURCE } from './state.js';

suite('doe-planner designs — ccd', () => {
  test('flags', () => {
    assertEqual(ccd.centerPoints, false);
    assertEqual(ccd.twoLevelOnly, false);
    assertEqual(ccd.dispersion, true);
  });

  test('always valid on its own', () => {
    assertEqual(ccd.isValid(stateWith({ designType: 'ccd' }), NO_SOURCE), true);
  });

  test('2^k + 2k + center points (default 3)', () => {
    assertEqual(ccd.runs(stateWith()), 4 + 4 + 3);
    assertEqual(ccd.runs(stateWith({ options: { ccdCenterPoints: 5 } })), 4 + 4 + 5);
  });

  test('resolution CCD', () => {
    assertEqual(ccd.resolution(stateWith()), 'CCD');
  });
});
