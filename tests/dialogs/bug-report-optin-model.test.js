import { suite, test, assertDeepEqual } from '../test-utils.js';
import { Model } from '../../js/dialogs/bug-report-optin/bug-report-optin-model.js';

suite('bug-report-optin Model', () => {
  test('both boxes start off, also on reopen', () => {
    const m = new Model();
    m.screenshot = true; m.project = true;
    m.apply({});
    assertDeepEqual(m.result(), { screenshot: false, project: false });
  });

  test('result reflects the boxes', () => {
    const m = new Model().apply();
    m.screenshot = true;
    assertDeepEqual(m.result(), { screenshot: true, project: false });
  });
});
