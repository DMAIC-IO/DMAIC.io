/**
 * D.Mike — Flowchart Chain-Core (flowchart-model.js)
 *
 * Shared linear-chain model consumed by the four flowchart modules:
 * Process Map, Activity, Opportunity, Deployment. Module-specific step
 * fields (inputs/outputs, decision, side, laneId, ...) are passed through
 * unchanged — see docs/superpowers/specs/2026-08-15-flowchart-family-design.md
 * §2 "Datenmodell".
 */

/**
 * Generate a unique step ID.
 * @returns {string}
 */
function genStepId() {
  return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Normalize a substep object (just id and title).
 * @param {any} raw
 * @returns {object}
 */
function normalizeSubstep(raw) {
  return {
    id: typeof raw?.id === 'string' ? raw.id : genStepId(),
    title: typeof raw?.title === 'string' ? raw.title : '',
  };
}

/**
 * Core-only field coercion. Called by normalizeStep before moduleNormalize.
 * @param {any} raw
 * @returns {object}
 */
function coerceCoreFields(raw) {
  return {
    id: typeof raw?.id === 'string' && raw.id.length > 0 ? raw.id : genStepId(),
    title: typeof raw?.title === 'string' ? raw.title : '',
    description: typeof raw?.description === 'string' ? raw.description : '',
    expanded: raw?.expanded === true,
    substeps: Array.isArray(raw?.substeps) ? raw.substeps.map(normalizeSubstep) : [],
  };
}

export class FlowchartState {
  constructor() {
    /** @type {Array<object>} ordered chain of steps */
    this.steps = [];
  }

  /**
   * Normalize a raw step object. Core fields are coerced; unknown fields are
   * preserved verbatim ("pass-through extension model"). moduleNormalize (if
   * provided) runs LAST and can adjust extension fields.
   * @param {any} raw
   * @param {(step: object) => object} [moduleNormalize]
   * @returns {object}
   */
  normalizeStep(raw, moduleNormalize) {
    const src = (raw && typeof raw === 'object') ? raw : {};
    const core = coerceCoreFields(src);
    // raw first, core second → core wins, but extension fields survive.
    const merged = { ...src, ...core };
    return moduleNormalize ? moduleNormalize(merged) : merged;
  }

  /**
   * Add a step at index (default = end). seed is normalized.
   * @param {number} [atIndex]
   * @param {object} [seed]
   * @param {(step: object) => object} [moduleNormalize]
   * @returns {object} inserted step
   */
  addStep(atIndex = this.steps.length, seed = {}, moduleNormalize) {
    const step = this.normalizeStep(seed, moduleNormalize);
    const i = Math.max(0, Math.min(atIndex, this.steps.length));
    this.steps.splice(i, 0, step);
    return step;
  }

  /**
   * Alias for addStep with explicit index.
   * @param {number} atIndex
   * @param {object} [seed]
   * @param {(step: object) => object} [moduleNormalize]
   * @returns {object} inserted step
   */
  insertStep(atIndex, seed = {}, moduleNormalize) {
    return this.addStep(atIndex, seed, moduleNormalize);
  }

  /**
   * Remove a step by id.
   * @param {string} id
   * @returns {boolean} true if removed
   */
  removeStep(id) {
    const i = this.steps.findIndex((s) => s.id === id);
    if (i === -1) return false;
    this.steps.splice(i, 1);
    return true;
  }

  /**
   * Move a step from one position to another.
   * @param {string} fromId
   * @param {string} toId
   * @returns {boolean} true if moved
   */
  moveStep(fromId, toId) {
    if (fromId === toId) return false;
    const fi = this.steps.findIndex((s) => s.id === fromId);
    const ti = this.steps.findIndex((s) => s.id === toId);
    if (fi === -1 || ti === -1) return false;
    const [moved] = this.steps.splice(fi, 1);
    // Insert at the original target position (after removal, ti indices stay valid)
    this.steps.splice(ti, 0, moved);
    return true;
  }

  /**
   * Add a substep to a parent step. seed is normalized via normalizeSubstep.
   * @param {string} parentId
   * @param {object} [seed]
   * @returns {object|null} inserted substep, or null if parent not found
   */
  addSubstep(parentId, seed = {}) {
    const p = this.steps.find((s) => s.id === parentId);
    if (!p) return null;
    const ss = normalizeSubstep(seed);
    if (!Array.isArray(p.substeps)) p.substeps = [];
    p.substeps.push(ss);
    return ss;
  }

  /**
   * Remove a substep from a parent step by id.
   * @param {string} parentId
   * @param {string} substepId
   * @returns {boolean} true if removed
   */
  removeSubstep(parentId, substepId) {
    const p = this.steps.find((s) => s.id === parentId);
    if (!p || !Array.isArray(p.substeps)) return false;
    const i = p.substeps.findIndex((x) => x.id === substepId);
    if (i === -1) return false;
    p.substeps.splice(i, 1);
    return true;
  }

  /**
   * Move a substep from one position to another within the same parent.
   * Mirrors moveStep's semantics: the moved substep lands in toId's
   * original slot (siblings between shift to fill the gap).
   * @param {string} parentId
   * @param {string} fromId
   * @param {string} toId
   * @returns {boolean} true if moved
   */
  moveSubstep(parentId, fromId, toId) {
    if (fromId === toId) return false;
    const p = this.steps.find((s) => s.id === parentId);
    if (!p || !Array.isArray(p.substeps)) return false;
    const fi = p.substeps.findIndex((x) => x.id === fromId);
    const ti = p.substeps.findIndex((x) => x.id === toId);
    if (fi === -1 || ti === -1) return false;
    const [moved] = p.substeps.splice(fi, 1);
    // Insert at the original target position (after removal, ti indices stay valid)
    p.substeps.splice(ti, 0, moved);
    return true;
  }

  /**
   * Serialize the chain to a plain-object persistence payload.
   * Deep-clone via JSON round-trip. Two reasons:
   *   1. Detaches nested arrays/objects (substeps, inputs, outputs, loop, ...)
   *      from the live model, so the persisted snapshot is a true copy.
   *   2. Alpine's fine-grained reactivity ($watch on toJSON) tracks the
   *      (target, key) pairs actually read during the getter. A shallow
   *      `{...s}` reads only top-level keys, so nested-in-place mutations
   *      (push/splice on substeps/inputs/loop.steps, or setting a key on
   *      a nested object) would NOT re-fire the watch. The recursive JSON
   *      traversal reads every nested property, establishing dependencies
   *      at every depth — which is what auto-persist relies on.
   * @returns {{ steps: object[] }}
   */
  toJSON() {
    return { steps: JSON.parse(JSON.stringify(this.steps)) };
  }

  /**
   * Rehydrate a FlowchartState from a persisted payload. Every step is run
   * through normalizeStep (core coercion + extension pass-through).
   * @param {any} data
   * @param {(step: object) => object} [moduleNormalize]
   * @returns {FlowchartState}
   */
  static fromJSON(data, moduleNormalize) {
    const state = new FlowchartState();
    const rawSteps = Array.isArray(data?.steps) ? data.steps : [];
    state.steps = rawSteps.map((raw) => state.normalizeStep(raw, moduleNormalize));
    return state;
  }
}
