/**
 * D.Mike — Bug report opt-in dialog (dialogs/bug-report-optin)
 * Step 1 of the bug reporter: screenshot and project data are opt-in, both
 * boxes start unchecked (spec decision 2). No side effects of its own.
 */
import { createDialog } from '../../core/create-dialog.js';
import { Model } from './bug-report-optin-model.js';

/**
 * Build the opt-in dialog; `open()` takes the dialog service (`ui.dialog`).
 * @param {{ i18n: object, eventBus: object }} ctx
 * @returns {{ open: (dialog: object, init: object, opts?: object) =>
 *             Promise<{screenshot: boolean, project: boolean}|null> }}
 */
export function buildBugReportOptInDialog(ctx) {
  return createDialog({ id: 'bug-report-optin', i18nKey: 'bugReport', titleKey: 'optinTitle', Model, ctx });
}
