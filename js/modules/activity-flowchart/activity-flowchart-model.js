/**
 * D.Mike — Activity Flowchart Model (activity-flowchart-model.js)
 * Extends FlowchartState with `kind` (activity|decision) and `decision`
 * target fields. See spec §2 "Datenmodell" and §3.1 "Activity Flowchart".
 */

import { FlowchartState } from '../../core/flowchart/flowchart-model.js';
import { registerSourceMapper } from '../../core/flowchart/flowchart-import.js';

const VALID_KINDS = new Set(['activity', 'decision']);

/** Das Band des Hauptpfads. Jeder Schritt ohne eigene Abzweigung liegt hier. */
export const MAIN_BRANCH = 'main';

/** Präfix der Band-Id einer Raute: `no:<stepId>`. */
export const BRANCH_PREFIX = 'no:';

/**
 * Die Raute, der ein Band gehört.
 * @param {string} branchId - `'main'` oder `no:<stepId>`.
 * @returns {string|null} Step-Id der Raute, oder `null` beim Hauptpfad.
 */
export function branchOwnerId(branchId) {
  return typeof branchId === 'string' && branchId.startsWith(BRANCH_PREFIX)
    ? branchId.slice(BRANCH_PREFIX.length)
    : null;
}

/**
 * Form-Prüfung einer Band-Id. Ob die referenzierte Raute existiert und früh
 * genug steht, kann ein Schritt allein nicht wissen — das prüft
 * `_reconcileBranches()` über die ganze Kette.
 * @param {*} raw - Rohwert.
 * @returns {string} `'main'` oder eine wohlgeformte `no:`-Id.
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
   * Erzwingt die Band-Invariante über die ganze Kette: ein Schritt darf nur in
   * dem Band einer Raute liegen, die im Array VOR ihm steht. Damit sind
   * Zyklen strukturell unmöglich — die Spaltenordnung ist die Kettenordnung.
   * Ungültige Zuordnungen fallen auf den Hauptpfad zurück.
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
