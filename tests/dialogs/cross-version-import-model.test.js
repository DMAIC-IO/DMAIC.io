import { suite, test, assertEqual, assertTrue } from '../test-utils.js';
import { Model } from '../../js/dialogs/cross-version-import/cross-version-import-model.js';

suite('cross-version-import Model', () => {
  test('apply seeds versions + preselects the first', () => {
    const m = new Model();
    m.apply({ versions: [
      { versionMM: '1.2', label: 'v1.2.0', projectCount: 3 },
      { versionMM: '1.1', label: 'v1.1.0', projectCount: 1 },
    ] });
    assertEqual(m.versions.length, 2);
    assertEqual(m.selected, '1.2', 'first version preselected');
  });
  test('validate requires a selection', () => {
    const m = new Model();
    assertTrue(!m.validate(), 'empty → invalid');
    m.apply({ versions: [{ versionMM: '1.0', label: 'x', projectCount: 0 }] });
    assertTrue(m.validate(), 'with selection → valid');
  });
  test('result returns the selected versionMM', () => {
    const m = new Model();
    m.apply({ versions: [
      { versionMM: '2.0', label: 'a', projectCount: 1 },
      { versionMM: '1.9', label: 'b', projectCount: 1 },
    ] });
    m.selected = '1.9';
    assertEqual(m.result(), '1.9');
  });
});
