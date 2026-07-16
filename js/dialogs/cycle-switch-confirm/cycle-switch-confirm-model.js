/** Model for the cycle-switch-confirm preview dialog (no input — confirm/cancel only). */
export class Model {
  lostPhasesText = '';
  newAddedText = '';
  mapped = 0;
  fallback = 0;
  firstNewPhaseLabel = '';

  get hasLost() { return Boolean(this.lostPhasesText); }
  get hasNewAdded() { return Boolean(this.newAddedText); }
  get hasMapped() { return this.mapped > 0; }
  get hasFallback() { return this.fallback > 0; }

  apply(init = {}) {
    this.lostPhasesText = init.lostPhasesText ?? '';
    this.newAddedText = init.newAddedText ?? '';
    this.mapped = init.mapped ?? 0;
    this.fallback = init.fallback ?? 0;
    this.firstNewPhaseLabel = init.firstNewPhaseLabel ?? '';
    return this;
  }

  validate() { return true; }

  /** @returns {true} confirmed (cancel resolves null at the factory level) */
  result() { return true; }
}
