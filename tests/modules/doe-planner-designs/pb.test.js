/**
 * D.Mike — design type "pb" (designs/pb.js)
 */
import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import pb from '../../../js/modules/doe-planner/designs/pb.js';
import { stateWith, NO_SOURCE } from './state.js';

suite('doe-planner designs — pb', () => {
  test('flags', () => {
    assertEqual(pb.centerPoints, true);
    assertEqual(pb.twoLevelOnly, true);
  });

  test('needs a selected PB row and two-level factors', () => {
    assertDeepEqual(pb.check(stateWith({ designType: 'pb' }), NO_SOURCE), { ok: false, reason: 'noPBDesign' });
    assertEqual(pb.isValid(stateWith({ designType: 'pb', selectedPBIdx: 0 }), NO_SOURCE), true);
    const multi = stateWith({ designType: 'pb', selectedPBIdx: 0, factors: [['A', ['1', '2', '3']], ['B', ['1', '2']]] });
    assertDeepEqual(pb.check(multi, NO_SOURCE), { ok: false, reason: 'twoLevelOnly' });
  });

  test('runs: next multiple of 4 above k, +3 with center points', () => {
    assertEqual(pb.runs(stateWith()), 4);
    const seven = stateWith({ factors: Array.from({ length: 7 }, (_, i) => [`F${i}`, ['-1', '1']]) });
    assertEqual(pb.runs(seven), 8);
    assertEqual(pb.runs(stateWith({ options: { centerPoints: true } })), 7);
  });

  test('resolution III', () => {
    assertEqual(pb.resolution(stateWith()), 'III');
  });
});
