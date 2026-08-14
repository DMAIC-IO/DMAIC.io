/** Model for the cycle-picker dialog. cycles: pre-translated {id,name,short,description}. */
export class Model {
  /** @type {{id:string,name:string,short:string,description:string}[]} */
  cycles = [];
  /** @type {string} */
  selected = '';

  apply(init = {}) {
    this.cycles = Array.isArray(init.cycles) ? init.cycles : [];
    this.selected = init.preselected
      || (this.cycles.length ? this.cycles[0].id : '');
    return this;
  }

  validate() { return Boolean(this.selected); }

  /** @returns {string} chosen cycle id */
  result() { return this.selected; }
}

/**
 * Build a cycle-picker Model class bound to a `scenarioOptionsFor(cycleId)`
 * lookup — the scenario radio list ("empty project" + every scenario shipped
 * for that cycle). Kept as a factory (rather than a fixed dependency on
 * `Model`) so the base cycle-only Model above stays dependency-free and
 * unit-testable on its own; only the cycle-picker dialog needs the scenario
 * behaviour.
 * @param {(cycleId: string) => {id:string,title:string,description:string}[]} scenarioOptionsFor
 * @returns {typeof Model} a Model subclass with scenario support
 */
export function createScenarioModel(scenarioOptionsFor) {
  return class CyclePickerModel extends Model {
    /** @type {string} */
    scenarioId = '';
    /** @type {{id:string,title:string,description:string}[]} */
    scenarioOptions = [];
    /**
     * Whether the scenario section may render at all for this open() — false
     * for the cycle-SWITCH context, where a picked scenarioId would be
     * silently discarded by the caller (project-switcher.js only reads it
     * for `context: 'create'`). Kept as instance state (not a constructor
     * arg) so `selectCycle()`, called from the template on every cycle
     * change, can honour the same per-open restriction.
     * @type {boolean}
     */
    _allowScenarios = false;

    apply(init = {}) {
      super.apply(init);
      this._allowScenarios = init.allowScenarios === true;
      this.scenarioId = '';
      this.scenarioOptions = this._allowScenarios ? scenarioOptionsFor(this.selected) : [];
      return this;
    }

    /**
     * Re-fill the scenario list whenever the picked cycle changes.
     * @param {string} cycleId
     */
    selectCycle(cycleId) {
      this.selected = cycleId;
      this.scenarioId = '';
      this.scenarioOptions = this._allowScenarios ? scenarioOptionsFor(cycleId) : [];
    }

    /** @returns {boolean} true once more than the "empty project" entry exists */
    get hasScenarios() { return this.scenarioOptions.length > 1; }

    /** @returns {{cycleId: string, scenarioId: string|null}} */
    result() {
      return { cycleId: this.selected, scenarioId: this.scenarioId || null };
    }
  };
}
