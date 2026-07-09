import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { Model } from '../../js/dialogs/cycle-picker/cycle-picker-model.js';

suite('cycle-picker Model', () => {
  test('apply seeds cycles + preselects current (fallback to first)', () => {
    const cycles = [
      { id: 'dmaic', name: 'DMAIC', short: 'x', description: 'y' },
      { id: 'dmadv', name: 'DMADV', short: 'a', description: 'b' },
    ];
    const m = new Model();
    m.apply({ cycles, preselected: 'dmadv' });
    assertEqual(m.selected, 'dmadv');
    const m2 = new Model().apply({ cycles, preselected: null });
    assertEqual(m2.selected, 'dmaic', 'fallback to first');
  });
  test('validate requires a selection; result returns it', () => {
    const m = new Model();
    assertTrue(!m.validate());
    m.apply({ cycles: [{ id: 'dmaic', name: 'D', short: '', description: '' }], preselected: 'dmaic' });
    assertTrue(m.validate());
    assertEqual(m.result(), 'dmaic');
  });
});
