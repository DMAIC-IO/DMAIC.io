/**
 * D.Mike — Bug report description dialog (dialogs/bug-report-describe)
 * Step 2: free text, optionally above it the screenshot editor, which the
 * bug reporter mounts imperatively into `.bug-report__editor-host` via
 * open()'s onMount (canvas gestures are no case for directives).
 */
import { createDialog } from '../../core/create-dialog.js';
import { Model } from './bug-report-describe-model.js';

/**
 * Build the description dialog; `open()` takes the dialog service (`ui.dialog`).
 * @param {{ i18n: object, eventBus: object }} ctx
 * @returns {{ open: (dialog: object, init: {hasScreenshot: boolean}, opts?: object) =>
 *             Promise<string|null> }}
 */
export function buildBugReportDescribeDialog(ctx) {
  return createDialog({ id: 'bug-report-describe', i18nKey: 'bugReport', titleKey: 'describeTitle', Model, ctx });
}
