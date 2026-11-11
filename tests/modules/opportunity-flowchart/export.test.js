import { suite, test, assertEqual, assertDeepEqual } from '../../test-utils.js';
import { State } from '../../../js/modules/opportunity-flowchart/domain/model.js';
import { toJsonTree } from '../../../js/modules/opportunity-flowchart/io/export.js';

suite('Opportunity-Flowchart JSON-Export', () => {
  const model = () => State.fromJSON({
    steps: [
      { id: 'a', title: 'A', description: 'd', side: 'va', substeps: [{ id: 'x', title: 'X' }] },
      { id: 'b', title: 'B', description: '', side: 'nva', substeps: [] },
    ],
    expanded: ['a'],
  });

  test('Schritte und Unterschritte vollständig, ohne _schema und expanded', () => {
    const out = toJsonTree(model());
    assertDeepEqual(Object.keys(out), ['steps']);
    assertEqual(out.steps.length, 2);
    assertDeepEqual(out.steps[0].substeps, [{ id: 'x', title: 'X' }]);
    assertEqual(out.steps[1].side, 'nva');
    assertEqual('expanded' in out.steps[0], false);
  });

  test('der Baum ist eine Kopie', () => {
    const m = model();
    const out = toJsonTree(m);
    out.steps[0].title = 'geändert';
    assertEqual(m.steps[0].title, 'A');
  });
});
