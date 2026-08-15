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
}
