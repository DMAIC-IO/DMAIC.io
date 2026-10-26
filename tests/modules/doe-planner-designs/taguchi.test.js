/**
 * D.Mike — design type "taguchi" (designs/taguchi.js)
 */
import { suite, test, assertEqual, assertDeepEqual, assertTrue } from '../../test-utils.js';
import taguchi from '../../../js/modules/doe-planner/designs/taguchi.js';
import { stateWith, NO_SOURCE } from './state.js';

suite('doe-planner designs — taguchi', () => {
  test('flags: no center points, no dispersion', () => {
    assertEqual(taguchi.centerPoints, false);
    assertEqual(taguchi.dispersion, false);
  });

  test('needs an array', () => {
    assertDeepEqual(taguchi.check(stateWith({ designType: 'taguchi' }), NO_SOURCE), { ok: false, reason: 'noTaguchiArray' });
    assertEqual(taguchi.isValid(stateWith({ designType: 'taguchi', options: { taguchiArray: 'L4' } }), NO_SOURCE), true);
  });

  test('runs from the array, ? without', () => {
    assertEqual(taguchi.runs(stateWith({ options: { taguchiArray: 'L4' } })), 4);
    assertEqual(taguchi.runs(stateWith()), '?');
  });

  test('resolution is the array name, OA without', () => {
    assertEqual(taguchi.resolution(stateWith({ options: { taguchiArray: 'L8' } })), 'L8');
    assertEqual(taguchi.resolution(stateWith()), 'OA');
  });

  test('candidates, selection and the level text key', () => {
    const s = stateWith();
    assertDeepEqual(taguchi.levelCounts(s), [2, 2]);
    const names = taguchi.candidates(s).map((c) => c.name);
    assertTrue(names.includes('L4'));
    assertEqual(taguchi.selected(s), names[0]);
    assertEqual(taguchi.selected(stateWith({ options: { taguchiArray: 'L8' } })), 'L8');
    assertEqual(taguchi.levelsKey(s), 'taguchiLevels2');
    assertEqual(taguchi.levelsKey(stateWith({ factors: [['A', ['1', '2', '3']], ['B', ['1', '2', '3']]] })), 'taguchiLevels3');
    assertEqual(taguchi.levelsKey(stateWith({ factors: [['A', ['1', '2', '3']], ['B', ['1', '2']]] })), 'taguchiLevelsMixed');
  });
});
