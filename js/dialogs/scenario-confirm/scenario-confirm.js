/**
 * D.Mike — Scenario confirm dialog (dialogs/scenario-confirm)
 * Asks before loading a scenario into the running project: names the module
 * that gets overwritten (if any) and how many further modules and data
 * collections will be created. Numbers are computed by the caller via
 * describeScenario()/countScenarioWorksheets() (core/scenario-loader.js) —
 * this dialog only renders them, no side effects of its own.
 */

import { createDialog } from '../../core/create-dialog.js';
import { Model } from './scenario-confirm-model.js';

/**
 * @param {{ i18n: object, eventBus: object }} ctx
 * @returns {{ prewarm: () => Promise<void>,
 *             open: (modal: object, init: object, opts?: object) => Promise<true|null> }}
 */
export function buildScenarioConfirmDialog(ctx) {
  return createDialog({
    id: 'scenario-confirm',
    i18nKey: 'scenarios',
    titleKey: 'confirmTitle',
    Model,
    ctx,
    // Line helpers return '' when the section does not apply (e.g. no module
    // is overwritten), so each <p> is bound via x-text (no rAF-gated x-show)
    // — content reflects immediately on the reactive pass. Mirrors
    // js/dialogs/cycle-switch-confirm/cycle-switch-confirm.js.
    data: (t) => ({
      overwriteLine() {
        return this.model.hasOverwrite
          ? t('confirmOverwrite', { module: this.model.overwriteModuleName }) : '';
      },
      newLine() { return t('confirmNew', { count: this.model.newCount }); },
      worksheetLine() { return t('confirmWorksheets', { count: this.model.worksheetCount }); },
    }),
  });
}
