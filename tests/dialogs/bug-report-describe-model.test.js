import { suite, test, assertEqual } from '../test-utils.js';
import { Model } from '../../js/dialogs/bug-report-describe/bug-report-describe-model.js';

suite('bug-report-describe Model', () => {
  test('apply resets the text and stores hasScreenshot', () => {
    const m = new Model();
    m.description = 'old';
    m.apply({ hasScreenshot: true });
    assertEqual(m.description, '');
    assertEqual(m.hasScreenshot, true);
  });

  test('result trims; empty is allowed', () => {
    const m = new Model().apply({});
    m.description = '  Histogramm leer \n';
    assertEqual(m.result(), 'Histogramm leer');
    m.description = '';
    assertEqual(m.result(), '');
  });
});
