import { suite, test, assertEqual } from '../test-utils.js';
import { scenarioConfirmData } from '../../js/dialogs/scenario-confirm/scenario-confirm.js';
import { Model } from '../../js/dialogs/scenario-confirm/scenario-confirm-model.js';

/**
 * Stub i18n `t()`: records the last (key, params) call and renders a
 * deterministic string so assertions can check both which key was used and
 * that the params reached it — a wrong key here would fail silently in the
 * app (raw key string shown to the user), so these lines get direct coverage
 * independent of Alpine/DOM.
 */
function stubT(key, params) {
  const p = params ? ` ${JSON.stringify(params)}` : '';
  return `[${key}]${p}`;
}

suite('scenario-confirm data(t) line helpers', () => {
  test('newLine renders confirmNew with the new-module count', () => {
    const model = new Model().apply({ newCount: 20, worksheetCount: 2 });
    const view = scenarioConfirmData(stubT);
    assertEqual(view.newLine.call({ model }), '[confirmNew] {"count":20}');
  });

  test('worksheetLine renders confirmWorksheets with the worksheet count', () => {
    const model = new Model().apply({ newCount: 20, worksheetCount: 2 });
    const view = scenarioConfirmData(stubT);
    assertEqual(view.worksheetLine.call({ model }), '[confirmWorksheets] {"count":2}');
  });
});
