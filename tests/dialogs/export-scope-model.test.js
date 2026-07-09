import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { Model } from '../../js/dialogs/export-scope/export-scope-model.js';

suite('export-scope Model', () => {
  test('apply sets projectCount and defaults scope to current', () => {
    const m = new Model();
    m.apply({ projectCount: 4 });
    assertEqual(m.projectCount, 4);
    assertEqual(m.scope, 'current');
  });
  test('validate always passes (radio preselected)', () => {
    assertTrue(new Model().validate());
  });
  test('result returns the chosen scope', () => {
    const m = new Model();
    m.apply({ projectCount: 2 });
    m.scope = 'all';
    assertEqual(m.result(), 'all');
  });
});
