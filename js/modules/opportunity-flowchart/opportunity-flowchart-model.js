/**
 * D.Mike — Opportunity Flowchart Model (opportunity-flowchart-model.js)
 * Extends FlowchartState with a `side` field ('va' | 'nva'), which decides
 * the column a step is rendered in. The sequence order lives in `steps[]`
 * and is independent of the column — switching sides never reorders.
 * See spec §2 "Datenmodell" and §3.2 "Opportunity Flowchart".
 */

import { FlowchartState } from '../../core/flowchart/flowchart-model.js';
import { registerSourceMapper } from '../../core/flowchart/flowchart-import.js';

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

/**
 * Trimmed non-empty strings from an unknown array shape.
 * (mirrors `cleanStrings` in `modules/activity-flowchart/activity-flowchart-model.js`)
 * @param {*} raw - Raw value, expected to be an array of strings.
 * @returns {string[]} Trimmed, non-empty strings.
 */
function cleanStrings(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v) => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/**
 * Maps a Process Map `valueType` to an Opportunity column. PM distinguishes
 * three value types, Opportunity only two: business-necessary-but-non-value-
 * added (`bnva`) collapses into the rework/NVA column, everything unknown
 * defaults to value-added.
 * @param {*} vt - PM's `valueType` field.
 * @returns {'va'|'nva'} Opportunity column.
 */
function pmSideFromValueType(vt) {
  if (vt === 'nva' || vt === 'bnva') return 'nva';
  return 'va';
}

/**
 * Maps a Process Map instance's persisted state to seed steps for the
 * Opportunity Flowchart import registry. Keeps title/description, translates
 * valueType into `side`, drops PM-only extensions (inputs, outputs, loop).
 * @param {any} pmState - Process Map's persisted state, `{ steps: object[] }`.
 * @returns {Array<{title: string, description: string, side: 'va'|'nva'}>} Seed steps.
 */
function pmToOpportunity(pmState) {
  const steps = Array.isArray(pmState?.steps) ? pmState.steps : [];
  return steps.map((s) => ({
    title: typeof s?.title === 'string' ? s.title : '',
    description: typeof s?.description === 'string' ? s.description : '',
    side: pmSideFromValueType(s?.valueType),
  }));
}

/**
 * Maps a SIPOC instance's persisted state to seed steps. SIPOC has no
 * value-type information, so every process entry lands in the VA column and
 * the user re-classifies from there.
 * @param {any} sipocState - SIPOC's persisted state, `{ columns: { process: string[] } }`.
 * @returns {Array<{title: string, side: 'va'}>} Seed steps.
 */
function sipocToOpportunity(sipocState) {
  return cleanStrings(sipocState?.columns?.process).map((title) => ({ title, side: 'va' }));
}

registerSourceMapper('opportunity-flowchart', 'process-map', pmToOpportunity);
registerSourceMapper('opportunity-flowchart', 'sipoc', sipocToOpportunity);

/** Exposed for internal tests of the mappers in isolation. */
export const __pmMapper = pmToOpportunity;
/** Exposed for internal tests of the mappers in isolation. */
export const __sipocMapper = sipocToOpportunity;
