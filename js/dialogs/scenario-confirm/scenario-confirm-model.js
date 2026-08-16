/**
 * D.Mike — Scenario confirm dialog model (dialogs/scenario-confirm)
 * No input fields — confirm/cancel only. Holds the numbers describeScenario()
 * and countScenarioWorksheets() (core/scenario-loader.js) computed ahead of
 * time, so the dialog only renders a truthful summary — no side effects.
 */
export class Model {
  scenarioTitle = '';
  newCount = 0;
  worksheetCount = 0;

  apply(init = {}) {
    this.scenarioTitle = init.scenarioTitle ?? '';
    this.newCount = init.newCount ?? 0;
    this.worksheetCount = init.worksheetCount ?? 0;
    return this;
  }

  validate() { return true; }

  /** @returns {true} confirmed (cancel resolves null at the factory level) */
  result() { return true; }
}
