import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { Model } from '../../js/dialogs/cycle-switch-confirm/cycle-switch-confirm-model.js';

suite('cycle-switch-confirm Model', () => {
  test('apply stores impact fields', () => {
    const m = new Model();
    m.apply({
      lostPhasesText: 'Improve, Control', newAddedText: '', mapped: 3, fallback: 1,
      firstNewPhaseLabel: 'Design',
    });
    assertEqual(m.lostPhasesText, 'Improve, Control');
    assertEqual(m.mapped, 3);
    assertEqual(m.fallback, 1);
    assertTrue(m.hasLost);
    assertTrue(!m.hasNewAdded);
  });
  test('validate always true; result true (no input)', () => {
    const m = new Model();
    assertTrue(m.validate());
    assertEqual(m.result(), true);
  });
});
