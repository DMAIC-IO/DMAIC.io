/**
 * D.Mike — design type "bb" (designs/bb.js)
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import bb from '../../../js/modules/doe-planner/designs/bb.js';
import { stateWith, NO_SOURCE } from './state.js';

const three = (extra = {}) => stateWith({
  designType: 'bb',
  factors: [['A', ['-1', '0', '1']], ['B', ['-1', '0', '1']], ['C', ['-1', '0', '1']]],
  ...extra,
});

suite('doe-planner designs — bb', () => {
  test('flags', () => {
    assertEqual(bb.centerPoints, false);
    assertEqual(bb.dispersion, true);
  });

  test('available for 3 to 7 factors only', () => {
    assertEqual(bb.available(three()), true);
    assertEqual(bb.available(stateWith({ designType: 'bb' })), false);
    assertDeepEqual(bb.check(stateWith({ designType: 'bb' }), NO_SOURCE), { ok: false, reason: 'bbUnavailable' });
    assertEqual(bb.isValid(three(), NO_SOURCE), true);
  });

  test('pairs × 4 + center points; ? when unavailable', () => {
    assertEqual(bb.runs(three()), 3 * 4 + 3);
    assertEqual(bb.runs(three({ options: { bbCenterPoints: 5 } })), 3 * 4 + 5);
    assertEqual(bb.runs(stateWith({ designType: 'bb' })), '?');
  });

  test('resolution BB', () => {
    assertEqual(bb.resolution(three()), 'BB');
  });
});
