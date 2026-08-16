/**
 * D.Mike — Activity Flowchart Model (activity-flowchart-model.js)
 * Extends FlowchartState with `kind` (activity|decision) and `decision`
 * target fields. See spec §2 "Datenmodell" and §3.1 "Activity Flowchart".
 */

import { FlowchartState } from '../../core/flowchart/flowchart-model.js';
import { registerSourceMapper } from '../../core/flowchart/flowchart-import.js';

const VALID_KINDS = new Set(['activity', 'decision']);

/**
 * Normalizes a decision branch target to one of `'next' | 'end' | <stepId>`.
 * @param {*} t - Raw target value.
 * @returns {string} Normalized target, defaulting to `'next'`.
 */
function normalizeTarget(t) {
  if (t === 'next' || t === 'end') return t;
  if (typeof t === 'string' && t.length > 0) return t;   // treat as stepId
  return 'next';
}

/**
 * Normalizes a raw decision object into the canonical shape.
 * @param {*} raw - Raw decision value (may be missing/malformed).
 * @returns {{label: string, yesTarget: string, noTarget: string}} Normalized decision.
 */
function normalizeDecision(raw) {
  if (!raw || typeof raw !== 'object') return { label: '', yesTarget: 'next', noTarget: 'next' };
  return {
    label: typeof raw.label === 'string' ? raw.label : '',
    yesTarget: normalizeTarget(raw.yesTarget),
    noTarget: normalizeTarget(raw.noTarget),
  };
}

/**
 * Extension normalizer passed to FlowchartState.normalizeStep.
 * Sets `kind` (default `'activity'`) and normalizes/forces `decision`.
 * @param {object} step - Raw step object (already Core-normalized).
 * @returns {object} Step with normalized `kind` and `decision` fields.
 */
export function activityNormalize(step) {
  const kind = VALID_KINDS.has(step.kind) ? step.kind : 'activity';
  const decision = kind === 'decision' ? normalizeDecision(step.decision) : null;
  return { ...step, kind, decision };
}

/**
 * Activity Flowchart state model — extends the Core FlowchartState with
 * `kind` (activity|decision) and decision-branch targets.
 */
export class ActivityModel extends FlowchartState {
  constructor() { super(); }

  /**
   * Adds a new activity step at the given index.
   * @param {number} atIndex - Insertion index.
   * @param {object} [seed] - Seed fields for the new step.
   * @returns {object} The newly created, normalized step.
   */
  addStep(atIndex, seed = {}) {
    return super.addStep(atIndex, { kind: 'activity', ...seed }, activityNormalize);
  }

  /**
   * Adds a new decision step (kind='decision') at the given index.
   * @param {number} atIndex - Insertion index.
   * @param {object} [seed] - Seed fields for the new step.
   * @returns {object} The newly created, normalized decision step.
   */
  addDecision(atIndex, seed = {}) {
    return super.addStep(atIndex, {
      kind: 'decision',
      decision: { label: '', yesTarget: 'next', noTarget: 'next' },
      ...seed,
    }, activityNormalize);
  }

  /**
   * Sets a decision branch target on the given step.
   * @param {string} stepId - Id of the decision step.
   * @param {'yes'|'no'} branch - Which branch to set.
   * @param {string} target - New target (`'next' | 'end' | <stepId>`).
   * @returns {boolean} True if the target was set, false otherwise.
   */
  setDecisionTarget(stepId, branch, target) {
    const s = this.steps.find((x) => x.id === stepId);
    if (!s || s.kind !== 'decision' || !s.decision) return false;
    if (branch !== 'yes' && branch !== 'no') return false;
    s.decision[branch === 'yes' ? 'yesTarget' : 'noTarget'] = normalizeTarget(target);
    return true;
  }

  /**
   * Rehydrates an ActivityModel from serialized JSON data.
   * @param {object} data - Serialized flowchart data.
   * @returns {ActivityModel} New ActivityModel instance.
   */
  static fromJSON(data) {
    const base = FlowchartState.fromJSON(data, activityNormalize);
    const m = new ActivityModel();
    m.steps = base.steps;
    return m;
  }
}

/**
 * Trimmed non-empty strings from an unknown array shape.
 * (mirrors `cleanStrings` in `modules/process-map/process-map-sipoc-import.js`)
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
 * Maps a SIPOC instance's persisted state to seed steps for the Activity
 * Flowchart import registry. SIPOC's process-column entries become Activity
 * steps (one per non-empty entry).
 * @param {any} sipocState - SIPOC's persisted state, `{ columns: { process: string[] } }`.
 * @returns {Array<{title: string, kind: 'activity'}>} Seed steps for `ActivityModel.addStep`.
 */
function sipocToActivity(sipocState) {
  return cleanStrings(sipocState?.columns?.process).map((title) => ({ title, kind: 'activity' }));
}

/**
 * Maps a Process Map instance's persisted state to seed steps for the
 * Activity Flowchart import registry. Keeps title/description, drops
 * PM-only extensions (valueType, inputs, outputs, loop).
 * @param {any} pmState - Process Map's persisted state, `{ steps: object[] }`.
 * @returns {Array<{title: string, description: string, kind: 'activity'}>} Seed steps for `ActivityModel.addStep`.
 */
function pmToActivity(pmState) {
  const steps = Array.isArray(pmState?.steps) ? pmState.steps : [];
  return steps.map((s) => ({
    title: typeof s?.title === 'string' ? s.title : '',
    description: typeof s?.description === 'string' ? s.description : '',
    kind: 'activity',
  }));
}

registerSourceMapper('activity-flowchart', 'sipoc', sipocToActivity);
registerSourceMapper('activity-flowchart', 'process-map', pmToActivity);

/** Exposed for internal tests of the mappers in isolation. */
export const __sipocMapper = sipocToActivity;
/** Exposed for internal tests of the mappers in isolation. */
export const __pmMapper = pmToActivity;
