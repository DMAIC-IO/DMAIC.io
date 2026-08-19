/**
 * D.Mike — Activity Flowchart Model (activity-flowchart-model.js)
 * Extends FlowchartState with `kind` (activity|decision) and `decision`
 * target fields. See spec §2 "Datenmodell" and §3.1 "Activity Flowchart".
 */

import { FlowchartState } from '../../core/flowchart/flowchart-model.js';
import { registerSourceMapper } from '../../core/flowchart/flowchart-import.js';

const VALID_KINDS = new Set(['activity', 'decision']);

/** The main path's band. Every step that is not on a detour lives here. */
export const MAIN_BRANCH = 'main';

/** Prefix of a decision's band id: `no:<stepId>`. */
export const BRANCH_PREFIX = 'no:';

/**
 * The decision a band belongs to.
 * @param {string} branchId - `'main'` or `no:<stepId>`.
 * @returns {string|null} The decision's step id, or `null` for the main path.
 */
export function branchOwnerId(branchId) {
  return typeof branchId === 'string' && branchId.startsWith(BRANCH_PREFIX)
    ? branchId.slice(BRANCH_PREFIX.length)
    : null;
}

/**
 * Shape check for a band id. Whether the referenced decision exists and
 * stands early enough is nothing a single step can know — `_reconcileBranches()`
 * settles that across the whole chain.
 * @param {*} raw - Raw value.
 * @returns {string} `'main'` or a well-formed `no:` id.
 */
function normalizeBranchId(raw) {
  const owner = branchOwnerId(raw);
  return owner && owner.length > 0 ? String(raw) : MAIN_BRANCH;
}

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
 *
 * Only the NO branch carries a target. Yes means "the value stream simply
 * continues to the right", so it has nothing to point at — the chain arrow
 * to the next step already says where it goes. A `yesTarget` from a project
 * saved before that rule is dropped here rather than kept as dead state; the
 * project itself keeps loading.
 *
 * @param {*} raw - Raw decision value (may be missing/malformed).
 * @returns {{label: string, noTarget: string}} Normalized decision.
 */
function normalizeDecision(raw) {
  if (!raw || typeof raw !== 'object') return { label: '', noTarget: 'next' };
  return {
    label: typeof raw.label === 'string' ? raw.label : '',
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
  return { ...step, kind, decision, branchId: normalizeBranchId(step.branchId) };
}

/**
 * Activity Flowchart state model — extends the Core FlowchartState with
 * `kind` (activity|decision) and decision-branch targets.
 */
export class ActivityModel extends FlowchartState {
  constructor() { super(); }

  /**
   * Removes a step. If it is a decision, its band DISSOLVES: the steps in it
   * inherit the decision's own band instead of being deleted with it. Nested
   * bands travel up automatically, because their owning decisions are among
   * those very steps.
   * @param {string} id
   * @returns {boolean} True if removed.
   */
  removeStep(id) {
    const step = this.steps.find((s) => s.id === id);
    if (!step) return false;
    const ownBranch = step.branchId;
    const dissolved = step.kind === 'decision' ? BRANCH_PREFIX + step.id : null;
    if (!super.removeStep(id)) return false;
    if (dissolved) {
      this.steps.forEach((s) => { if (s.branchId === dissolved) s.branchId = ownBranch; });
    }
    return true;
  }

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
      decision: { label: '', noTarget: 'next' },
      ...seed,
    }, activityNormalize);
  }

  /**
   * Sets the target of a decision's NO branch. The yes branch has no target
   * to set — it is the flow on to the next step (see `normalizeDecision`).
   * @param {string} stepId - Id of the decision step.
   * @param {string} target - New target (`'next' | 'end' | <stepId>`).
   * @returns {boolean} True if the target was set, false otherwise.
   */
  setDecisionTarget(stepId, target) {
    const s = this.steps.find((x) => x.id === stepId);
    if (!s || s.kind !== 'decision' || !s.decision) return false;
    s.decision.noTarget = normalizeTarget(target);
    return true;
  }

  /**
   * Ascending indices of every step belonging to `branchId` — including the
   * steps of nested sub-bands, excluding the owning decision itself. A
   * sub-band joins as soon as its decision shows up in the band (or in a
   * sub-band already counted).
   * @param {string} branchId
   * @returns {number[]}
   */
  _branchMemberIndices(branchId) {
    const ownerId = branchOwnerId(branchId);
    const start = ownerId === null ? -1 : this.steps.findIndex((s) => s.id === ownerId);
    if (ownerId !== null && start === -1) return [];
    const members = new Set([branchId]);
    const out = [];
    for (let i = start + 1; i < this.steps.length; i++) {
      const s = this.steps[i];
      if (!members.has(s.branchId)) continue;
      out.push(i);
      if (s.kind === 'decision') members.add(BRANCH_PREFIX + s.id);
    }
    return out;
  }

  /**
   * Assigns a step to a band. `'main'` always works; a decision band only if
   * the decision exists, IS a decision, and stands before the step.
   * @param {string} stepId
   * @param {string} branchId - `'main'` or `no:<decisionStepId>`.
   * @returns {boolean} True if assigned.
   */
  setStepBranch(stepId, branchId) {
    const i = this.steps.findIndex((s) => s.id === stepId);
    if (i === -1) return false;
    if (branchId === MAIN_BRANCH) { this.steps[i].branchId = MAIN_BRANCH; return true; }
    const ownerId = branchOwnerId(branchId);
    const oi = this.steps.findIndex((s) => s.id === ownerId);
    if (oi === -1 || oi >= i || this.steps[oi].kind !== 'decision') return false;
    this.steps[i].branchId = branchId;
    return true;
  }

  /**
   * Creates a step at the END of a band — behind its last step and any nested
   * sub-bands, or directly behind the decision when the band is empty.
   * @param {string} branchId
   * @param {object} [seed] - Seed fields, e.g. `{ kind: 'decision' }`.
   * @returns {object|null} The new step, or `null` for an unknown band.
   */
  addStepToBranch(branchId, seed = {}) {
    // ALWAYS branch on `kind`, main path included: `addStep` creates no
    // `decision` object, so a diamond born that way would be silent bad data.
    const create = (at) => (seed.kind === 'decision'
      ? this.addDecision(at, { ...seed, branchId })
      : this.addStep(at, { ...seed, branchId }));

    if (branchId === MAIN_BRANCH) return create(this.steps.length);

    const ownerId = branchOwnerId(branchId);
    const oi = this.steps.findIndex((s) => s.id === ownerId);
    if (oi === -1 || this.steps[oi].kind !== 'decision') return null;
    const members = this._branchMemberIndices(branchId);
    return create((members.length > 0 ? members[members.length - 1] : oi) + 1);
  }

  /**
   * Enforces the band invariant across the whole chain: a step may only live
   * in the band of a decision that stands BEFORE it in the array. That makes
   * cycles structurally impossible — column order IS chain order. Invalid
   * assignments fall back to the main path.
   * @returns {void}
   */
  _reconcileBranches() {
    const openBranches = new Set([MAIN_BRANCH]);
    this.steps.forEach((s) => {
      if (!openBranches.has(s.branchId)) s.branchId = MAIN_BRANCH;
      if (s.kind === 'decision') openBranches.add(BRANCH_PREFIX + s.id);
    });
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
    m._reconcileBranches();
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
