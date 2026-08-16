import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { Model } from '../../js/dialogs/scenario-confirm/scenario-confirm-model.js';

suite('scenario-confirm Model', () => {
  test('apply stores summary fields', () => {
    const m = new Model();
    m.apply({ scenarioTitle: 'Pizza — vollständig', newCount: 4, worksheetCount: 2 });
    assertEqual(m.scenarioTitle, 'Pizza — vollständig');
    assertEqual(m.newCount, 4);
    assertEqual(m.worksheetCount, 2);
  });

  test('apply defaults missing fields', () => {
    const m = new Model();
    m.apply();
    assertEqual(m.scenarioTitle, '');
    assertEqual(m.newCount, 0);
    assertEqual(m.worksheetCount, 0);
  });

  test('validate always true; result true (no input)', () => {
    const m = new Model();
    assertTrue(m.validate());
    assertEqual(m.result(), true);
  });
});
