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
 * lookup — every scenario shipped for that cycle (the empty-project choice
 * is not part of this list; it is its own step-2 row, see pickScenario()).
 * Kept as a factory (rather than a fixed dependency on `Model`) so the base
 * cycle-only Model above stays dependency-free and unit-testable on its
 * own; only the cycle-picker dialog needs the scenario behaviour.
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
     * Current step of the two-step flow: 'cycle' (step 1, pick a cycle) or
     * 'start' (step 2, pick a scenario / empty project). Always 'cycle'
     * right after apply() — see apply() below for why that matters.
     * @type {'cycle'|'start'}
     */
    step = 'cycle';
    /**
     * Name for a new empty project. Only meaningful for the empty-project
     * choice — a picked scenario supplies its own name, which always wins
     * (see result()).
     * @type {string}
     */
    projectName = '';
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

    /**
     * Reset all state for a fresh open() — `createDialog.open()` calls
     * apply() on every open, on the SAME model instance, so this is the
     * only place stale step/scenario/name state (e.g. from a cancelled
     * mid-flow session) gets wiped.
     */
    apply(init = {}) {
      super.apply(init);
      this._allowScenarios = init.allowScenarios === true;
      this.step = 'cycle';
      this.scenarioId = '';
      this.projectName = init.defaultProjectName ?? '';
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

    /**
     * Handle a cycle pick from step 1. In the create context this advances
     * to step 2 (scenario / empty-project choice); in the switch context
     * (scenarios disallowed) there is nothing to pick next, so the caller
     * must submit immediately.
     * @param {string} cycleId
     * @returns {boolean} true when the caller should submit right away
     */
    chooseCycle(cycleId) {
      this.selectCycle(cycleId);
      if (!this._allowScenarios) return true;
      this.step = 'start';
      return false;
    }

    /** Return from step 2 to step 1, keeping the picked cycle. */
    back() { this.step = 'cycle'; }

    /**
     * Record the step-2 choice: a scenario id, or null/falsy for "empty
     * project".
     * @param {string|null} id
     */
    pickScenario(id) { this.scenarioId = id || ''; }

    /**
     * @returns {boolean} true once at least one REAL scenario exists.
     * Deliberately ignores entries with an empty id: today's producer
     * (`cycle-picker.js`'s `buildScenarioOptionsFor`) still prepends a
     * synthetic `{ id: '', title: emptyProject }` row, which is not a
     * scenario to submit but the step-2 "empty project" affordance. This
     * predicate stays correct once that synthetic entry is removed too.
     */
    get hasScenarios() { return this.scenarioOptions.some((o) => o.id); }

    /** @returns {{cycleId: string, scenarioId: string|null, projectName: string|null}} */
    result() {
      return {
        cycleId: this.selected,
        scenarioId: this.scenarioId || null,
        projectName: (this.projectName || '').trim() || null,
      };
    }
  };
}
