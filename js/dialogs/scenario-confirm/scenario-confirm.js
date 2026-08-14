/**
 * D.Mike — Scenario confirm dialog (dialogs/scenario-confirm)
 * Asks before loading a scenario into the running project: states how many
 * modules and data collections will be created. Loading is purely additive —
 * nothing already open is overwritten. Numbers are computed by the caller via
 * describeScenario()/countScenarioWorksheets() (core/scenario-loader.js) —
 * this dialog only renders them, no side effects of its own.
 */

import { createDialog } from '../../core/create-dialog.js';
import { Model } from './scenario-confirm-model.js';

/**
 * Line helpers for the dialog template. Each <p> is bound via x-text (no
 * rAF-gated x-show) — content reflects immediately on the reactive pass.
 * Mirrors js/dialogs/cycle-switch-confirm/cycle-switch-confirm.js.
 *
 * Exported separately (rather than inlined in createDialog's `data` option)
 * so it is unit-testable without mounting Alpine — see
 * tests/dialogs/scenario-confirm-model.test.js.
 * @param {(key: string, params?: object) => string} t
 * @returns {{ newLine: (this: {model: Model}) => string,
 *             worksheetLine: (this: {model: Model}) => string }}
 */
export function scenarioConfirmData(t) {
  return {
    newLine() { return t('confirmNew', { count: this.model.newCount }); },
    worksheetLine() { return t('confirmWorksheets', { count: this.model.worksheetCount }); },
  };
}

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
    data: scenarioConfirmData,
  });
}
