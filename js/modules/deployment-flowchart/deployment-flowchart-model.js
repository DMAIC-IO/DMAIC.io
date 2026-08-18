/**
 * D.Mike — Deployment Flowchart Model (deployment-flowchart-model.js)
 * Extends FlowchartState with a state-level `lanes[]` list (roles /
 * departments) and a `laneId` per step. The chain order lives in `steps[]`
 * as everywhere else; the lane only decides which horizontal band a step is
 * rendered in, which is what makes hand-offs visible.
 * See spec §2 "Datenmodell" and §3.3 "Deployment Flowchart".
 */

import { FlowchartState } from '../../core/flowchart/flowchart-model.js';
import { registerSourceMapper } from '../../core/flowchart/flowchart-import.js';

/**
 * Reserved id of the fallback lane. It is never deletable and never
 * renameable — its label comes from i18n (`modules.deployment-flowchart.
 * unassigned`), so the stored `name` deliberately stays empty and the
 * rendered label follows the UI language.
 */
const UNASSIGNED_ID = 'unassigned';

/**
 * Generate a unique lane ID.
 * @returns {string}
 */
function genLaneId() {
  return 'lane-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Extension normalizer passed to FlowchartState.normalizeStep.
 * Coerces `laneId` to a non-empty string (default `'unassigned'`).
 * @param {object} step - Raw step object (already Core-normalized).
 * @returns {object} Step with a normalized `laneId` field.
 */
export function deploymentNormalize(step) {
  const laneId = typeof step.laneId === 'string' && step.laneId.length > 0
    ? step.laneId : UNASSIGNED_ID;
  return { ...step, laneId };
}

/**
 * Normalize a raw lane entry.
 * @param {any} raw - Raw lane value.
 * @param {number} i - Index, used as the `order` fallback.
 * @returns {{id: string, name: string, order: number}} Normalized lane.
 */
function normalizeLane(raw, i) {
  return {
    id: typeof raw?.id === 'string' && raw.id.length > 0 ? raw.id : genLaneId(),
    name: typeof raw?.name === 'string' ? raw.name : '',
    order: typeof raw?.order === 'number' ? raw.order : i,
  };
}

/**
 * Deployment Flowchart state model — the Core chain plus lanes and a
 * per-step lane assignment.
 */
export class DeploymentModel extends FlowchartState {
  constructor() {
    super();
    /** @type {Array<{id:string, name:string, order:number}>} */
    this.lanes = [];
  }

  /**
   * Adds a step at the given index, defaulting to the Unassigned lane. The
   * referenced lane is created lazily when it is the reserved one.
   * @param {number} atIndex - Insertion index.
   * @param {object} [seed] - Seed fields for the new step.
   * @returns {object} The newly created, normalized step.
   */
  addStep(atIndex, seed = {}) {
    const step = super.addStep(atIndex, { laneId: UNASSIGNED_ID, ...seed }, deploymentNormalize);
    this._ensureLaneExists(step.laneId);
    return step;
  }

  /**
   * Appends a new lane.
   * @param {string} name - Lane name (role / department).
   * @returns {{id:string, name:string, order:number}} The new lane.
   */
  addLane(name) {
    const lane = { id: genLaneId(), name: String(name || ''), order: this.lanes.length };
    this.lanes.push(lane);
    return lane;
  }

  /**
   * Removes a lane and migrates its steps to Unassigned — steps are never
   * deleted along with their lane.
   * @param {string} laneId - Id of the lane to remove.
   * @returns {boolean} True if the lane was removed.
   */
  removeLane(laneId) {
    if (laneId === UNASSIGNED_ID) return false;   // reserved
    const i = this.lanes.findIndex((l) => l.id === laneId);
    if (i === -1) return false;
    this.lanes.splice(i, 1);
    this._ensureLaneExists(UNASSIGNED_ID);
    this.steps.forEach((s) => { if (s.laneId === laneId) s.laneId = UNASSIGNED_ID; });
    this._reindexLanes();
    return true;
  }

  /**
   * Renames a lane. The reserved Unassigned lane is not renameable.
   * @param {string} laneId - Id of the lane.
   * @param {string} name - New name.
   * @returns {boolean} True if the lane was renamed.
   */
  renameLane(laneId, name) {
    if (laneId === UNASSIGNED_ID) return false;   // reserved
    const l = this.lanes.find((x) => x.id === laneId);
    if (!l) return false;
    l.name = String(name || '');
    return true;
  }

  /**
   * Reorders lanes by item-on-item drop (the chain reorders via gaps
   * instead — see `FlowchartState#moveStepToGap`): the moved lane lands
   * in the target's original slot. The reserved Unassigned lane never moves.
   * @param {string} fromId - Lane being moved.
   * @param {string} toId - Lane whose slot it should take.
   * @returns {boolean} True if the lane was moved.
   */
  moveLane(fromId, toId) {
    if (fromId === UNASSIGNED_ID || toId === UNASSIGNED_ID) return false;
    if (fromId === toId) return false;
    const fi = this.lanes.findIndex((l) => l.id === fromId);
    const ti = this.lanes.findIndex((l) => l.id === toId);
    if (fi === -1 || ti === -1) return false;
    const [moved] = this.lanes.splice(fi, 1);
    this.lanes.splice(ti, 0, moved);
    this._reindexLanes();
    return true;
  }

  /**
   * Assigns a step to a lane without touching its chain position.
   * @param {string} stepId - Id of the step.
   * @param {string} laneId - Id of the target lane.
   * @returns {boolean} True if the assignment was made.
   */
  setLaneForStep(stepId, laneId) {
    const s = this.steps.find((x) => x.id === stepId);
    if (!s) return false;
    this._ensureLaneExists(laneId);
    s.laneId = laneId;
    return true;
  }

  /**
   * Creates the reserved Unassigned lane on demand. Unknown non-reserved
   * lane ids are NOT auto-created — the caller is expected to `addLane` first.
   * @param {string} laneId - Lane id being referenced.
   * @returns {void}
   */
  _ensureLaneExists(laneId) {
    if (this.lanes.some((l) => l.id === laneId)) return;
    if (laneId !== UNASSIGNED_ID) return;
    // Name stays empty on purpose — the view renders the i18n label instead.
    this.lanes.push({ id: UNASSIGNED_ID, name: '', order: this.lanes.length });
  }

  /**
   * Refresh the `order` fields after a structural change.
   * @returns {void}
   */
  _reindexLanes() {
    this.lanes.forEach((l, i) => { l.order = i; });
  }

  /**
   * Serialize chain + lanes. Deep-cloned for the same reasons as the Core's
   * toJSON (detached snapshot + Alpine deep-dependency tracking).
   * @returns {{steps: object[], lanes: object[]}}
   */
  toJSON() {
    return {
      steps: JSON.parse(JSON.stringify(this.steps)),
      lanes: JSON.parse(JSON.stringify(this.lanes)),
    };
  }

  /**
   * Rehydrates a DeploymentModel from serialized JSON data.
   * @param {object} data - Serialized flowchart data.
   * @returns {DeploymentModel} New DeploymentModel instance.
   */
  static fromJSON(data) {
    const base = FlowchartState.fromJSON(data, deploymentNormalize);
    const m = new DeploymentModel();
    m.steps = base.steps;
    const rawLanes = Array.isArray(data?.lanes) ? data.lanes : [];
    m.lanes = rawLanes.map(normalizeLane);
    if (m.steps.some((s) => s.laneId === UNASSIGNED_ID)) {
      m._ensureLaneExists(UNASSIGNED_ID);
    }
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
 * Maps a Process Map instance's persisted state to seed steps. PM has no
 * role information, so every step lands in the Unassigned lane and the user
 * distributes them afterwards.
 * @param {any} pmState - Process Map's persisted state, `{ steps: object[] }`.
 * @returns {Array<{title: string, description: string, laneId: string}>} Seed steps.
 */
function pmToDeployment(pmState) {
  const steps = Array.isArray(pmState?.steps) ? pmState.steps : [];
  return steps.map((s) => ({
    title: typeof s?.title === 'string' ? s.title : '',
    description: typeof s?.description === 'string' ? s.description : '',
    laneId: UNASSIGNED_ID,
  }));
}

/**
 * Maps a SIPOC instance's persisted state to seed steps — all Unassigned.
 * @param {any} sipocState - SIPOC's persisted state, `{ columns: { process: string[] } }`.
 * @returns {Array<{title: string, laneId: string}>} Seed steps.
 */
function sipocToDeployment(sipocState) {
  return cleanStrings(sipocState?.columns?.process)
    .map((title) => ({ title, laneId: UNASSIGNED_ID }));
}

registerSourceMapper('deployment-flowchart', 'process-map', pmToDeployment);
registerSourceMapper('deployment-flowchart', 'sipoc', sipocToDeployment);

/** Exposed for internal tests of the mappers in isolation. */
export const __pmMapper = pmToDeployment;
/** Exposed for internal tests of the mappers in isolation. */
export const __sipocMapper = sipocToDeployment;

export { UNASSIGNED_ID };
