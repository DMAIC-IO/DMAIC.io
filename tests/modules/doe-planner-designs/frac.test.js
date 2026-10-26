/**
 * D.Mike — design type "frac" (designs/frac.js)
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import frac from '../../../js/modules/doe-planner/designs/frac.js';
import { stateWith, NO_SOURCE } from './state.js';

const t = (key) => `t:${key}`;

function fourFactors(extra = {}) {
  return stateWith({
    designType: 'frac',
    factors: [['A', ['-1', '1']], ['B', ['-1', '1']], ['C', ['-1', '1']], ['D', ['-1', '1']]],
    ...extra,
  });
}

suite('doe-planner designs — frac', () => {
  test('flags', () => {
    assertEqual(frac.centerPoints, true);
    assertEqual(frac.twoLevelOnly, true);
    assertEqual(frac.dispersion, true);
  });

  test('needs a resolution', () => {
    assertDeepEqual(frac.check(fourFactors(), NO_SOURCE), { ok: false, reason: 'noResolution' });
    const s = fourFactors({ selectedRes: { k: 4, runs: 8, res: 'IV', p: 1 } });
    assertEqual(frac.isValid(s, NO_SOURCE), true);
  });

  test('rejects factors with more than two levels first', () => {
    const s = stateWith({ designType: 'frac', factors: [['A', ['1', '2', '3']], ['B', ['1', '2']]] });
    assertDeepEqual(frac.check(s, NO_SOURCE), { ok: false, reason: 'twoLevelOnly' });
  });

  test('runs from the selected resolution, +3 with center points; ? without', () => {
    assertEqual(frac.runs(fourFactors()), '?');
    assertEqual(frac.runs(fourFactors({ selectedRes: { k: 4, runs: 8, res: 'IV', p: 1 } })), 8);
    assertEqual(frac.runs(fourFactors({ selectedRes: { k: 4, runs: 8, res: 'IV', p: 1 }, options: { centerPoints: true } })), 11);
  });

  test('resolution label', () => {
    assertEqual(frac.resolution(fourFactors()), '');
    assertEqual(frac.resolution(fourFactors({ selectedRes: { k: 4, runs: 8, res: 'IV', p: 1 } })), 'IV');
  });

  test('table cells', () => {
    const s = fourFactors({ selectedRes: { k: 4, runs: 8, res: 'IV', p: 1 } });
    assertDeepEqual(frac.def(4, 8), { k: 4, runs: 8, p: 1, res: 'IV' });
    assertEqual(frac.def(4, 4), null);
    assertEqual(frac.cellClass(4, 4, s), 'doe__res-cell--empty');
    assertEqual(frac.cellClass(4, 8, s), 'doe__res-iv doe__res-cell--selected');
    assertEqual(frac.cellClass(4, 16, s), 'doe__res-full');
    assertEqual(frac.cellClass(5, 16, s), 'doe__res-v doe__res-cell--disabled');
    assertEqual(frac.cellData(4, 8, 'res', s), 'IV');
    assertEqual(frac.cellData(4, 8, 'p', s), 1);
    assertEqual(frac.cellData(5, 16, 'k', s), null);
    assertEqual(frac.cellLabel(4, 16, t), 't:resFull');
    assertEqual(frac.cellLabel(4, 8, t), 'IV');
    assertEqual(frac.cellLabel(4, 4, t), '');
  });

  test('alias detail names the factors, null for a full design', () => {
    assertEqual(frac.aliasDetail(fourFactors({ selectedRes: { k: 4, runs: 16, res: 'Full', p: 0 } })), null);
    const d = frac.aliasDetail(fourFactors({ selectedRes: { k: 4, runs: 8, res: 'IV', p: 1 } }));
    assertEqual(d.generators.length, 1);
    assertTrue(d.generators[0].startsWith('D = '));
    assertEqual(d.defining.length, 1);
  });
});
