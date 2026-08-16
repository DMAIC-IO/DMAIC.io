/**
 * D.Mike — Opportunity Flowchart Model (opportunity-flowchart-model.js)
 * Extends FlowchartState with a `side` field ('va' | 'nva'), which decides
 * the column a step is rendered in. The sequence order lives in `steps[]`
 * and is independent of the column — switching sides never reorders.
 * See spec §2 "Datenmodell" and §3.2 "Opportunity Flowchart".
 */

import { FlowchartState } from '../../core/flowchart/flowchart-model.js';

const VALID_SIDES = new Set(['va', 'nva']);

/**
 * Extension normalizer passed to FlowchartState.normalizeStep.
 * Coerces `side` to `'va' | 'nva'` (default `'va'`).
 * @param {object} step - Raw step object (already Core-normalized).
 * @returns {object} Step with a normalized `side` field.
 */
export function opportunityNormalize(step) {
  const side = VALID_SIDES.has(step.side) ? step.side : 'va';
  return { ...step, side };
}

/**
 * Opportunity Flowchart state model — the Core chain plus a per-step
 * value-added / non-value-added column assignment.
 */
export class OpportunityModel extends FlowchartState {
  constructor() { super(); }

  /**
   * Adds a step at the given index, defaulting to the value-added column.
   * @param {number} atIndex - Insertion index.
   * @param {object} [seed] - Seed fields for the new step.
   * @returns {object} The newly created, normalized step.
   */
  addStep(atIndex, seed = {}) {
    return super.addStep(atIndex, { side: 'va', ...seed }, opportunityNormalize);
  }

  /**
   * Moves a step into the given column without changing its sequence index.
   * @param {string} stepId - Id of the step.
   * @param {'va'|'nva'} side - Target column.
   * @returns {boolean} True if the side was set, false otherwise.
   */
  setSide(stepId, side) {
    if (!VALID_SIDES.has(side)) return false;
    const s = this.steps.find((x) => x.id === stepId);
    if (!s) return false;
    s.side = side;
    return true;
  }

  /**
   * Rehydrates an OpportunityModel from serialized JSON data.
   * @param {object} data - Serialized flowchart data.
   * @returns {OpportunityModel} New OpportunityModel instance.
   */
  static fromJSON(data) {
    const base = FlowchartState.fromJSON(data, opportunityNormalize);
    const m = new OpportunityModel();
    m.steps = base.steps;
    return m;
  }
}
