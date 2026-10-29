/**
 * D.Mike — Process Map Model (process-map-model.js)
 *
 * Pure state + business logic for the vertical process-flow builder.
 * No DOM, no i18n, no CSS classes, no view getters — those live in the data-fn.
 *
 * Chain CRUD (add/remove/move step, add/remove/move substep, JSON round-trip)
 * is inherited from `FlowchartState` (see `core/flowchart/flowchart-model.js`).
 * This module only supplies PM-specific extension normalization and the
 * PM-only business logic (IO, value type, loops).
 *
 * Persisted shape (toJSON / fromJSON), unchanged from the legacy module:
 *   { steps: Step[] }
 *
 * Step shape (persisted):
 *   Step  { id, title, description, valueType: null|'va'|'bnva'|'nva',
 *           inputs: IO[], outputs: IO[], substeps: Substep[],
 *           expanded: boolean, loop: null|Loop }
 *   IO        { id, name, inputType?: 'param'|'noise'|null }   (inputType only on inputs)
 *   Substep   { id, title }
 *   Loop      { targetStepId: string|null, condition: string, steps: { id, title }[] }
 */

import { uid } from '../../core/uid.js';
import { FlowchartState } from '../../core/flowchart/flowchart-model.js';

/** @returns {string} Unique id for steps and IO items (mirrors legacy generateId). */
function generateId() {
  return `s${uid()}`;
}

const VALUE_CYCLE = [null, 'va', 'bnva', 'nva'];
const INPUT_TYPE_CYCLE = [null, 'param', 'noise'];

/** Normalize a raw IO entry (preserving inputType when present). */
function normalizeIO(raw) {
  const io = { id: typeof raw?.id === 'string' ? raw.id : generateId(), name: typeof raw?.name === 'string' ? raw.name : '' };
  if (raw && (raw.inputType === 'param' || raw.inputType === 'noise')) io.inputType = raw.inputType;
  return io;
}

/** Normalize a raw loop entry to the canonical shape. */
function normalizeLoop(raw) {
  return {
    targetStepId: typeof raw?.targetStepId === 'string' ? raw.targetStepId : null,
    condition: typeof raw?.condition === 'string' ? raw.condition : '',
    steps: Array.isArray(raw?.steps)
      ? raw.steps.map((ls) => ({ id: typeof ls?.id === 'string' ? ls.id : generateId(), title: typeof ls?.title === 'string' ? ls.title : '' }))
      : [],
  };
}

/**
 * PM-specific extension normalizer, passed as `moduleNormalize` to
 * `FlowchartState#normalizeStep` / `.addStep` / `.fromJSON`. Core fields
 * (id, title, description, expanded, substeps) are already coerced by the
 * base class by the time this runs.
 * @param {object} step
 * @returns {object}
 */
function pmNormalize(step) {
  return {
    ...step,
    valueType: (step.valueType === 'va' || step.valueType === 'bnva' || step.valueType === 'nva')
      ? step.valueType : null,
    inputs: Array.isArray(step.inputs) ? step.inputs.map(normalizeIO) : [],
    outputs: Array.isArray(step.outputs) ? step.outputs.map(normalizeIO) : [],
    loop: step.loop ? normalizeLoop(step.loop) : null,
  };
}

/**
 * Je Datei einzeln erklärt: der Abgleich der Hilfetexte liest die Typedefs
 * je Moduldatei, ein gemeinsamer Typedef wäre dort nicht auffindbar. Die
 * Schlüssel beschreiben neue Daten; FlowchartState reicht importiertes
 * Alt-JSON unverändert durch.
 * @typedef {object} FlowSubstep
 * @property {string} id  Kennung
 * @property {string} title  Titel
 */

/**
 * @typedef {object} PmIO
 * @property {string} id  Kennung
 * @property {string} name  Bezeichnung
 * @property {'param'|'noise'} [inputType]  Art eines Inputs; nur bei Inputs
 */

/**
 * @typedef {object} PmLoop
 * @property {string|null} targetStepId  Schritt, zu dem die Schleife zurückführt
 * @property {string} condition  Bedingung der Schleife
 * @property {FlowSubstep[]} steps  Schritte innerhalb der Schleife
 */

/**
 * Ein Schritt, wie `read().steps` ihn zeigt.
 * @typedef {object} PmStep
 * @property {string} id  Kennung
 * @property {string} title  Titel
 * @property {string} description  Beschreibung
 * @property {'va'|'bnva'|'nva'|null} valueType  Wertart, null solange keine gewählt ist
 * @property {PmIO[]} inputs  Inputs
 * @property {PmIO[]} outputs  Outputs
 * @property {boolean} expanded  Unter-Schritte aufgeklappt
 * @property {FlowSubstep[]} substeps  Unter-Schritte
 * @property {PmLoop|null} loop  die Schleife des Schritts, oder null
 */

export class State extends FlowchartState {
  constructor() {
    super();
    /** @type {PmStep[]} die Kette in Reihenfolge, jede Angabe unter keys beschrieben */
    this.steps = [];
  }

  // ─── Lookup ─────────────────────────────────────────────────

  /** @returns {object|undefined} the step with the given id */
  findStep(id) {
    return this.steps.find((s) => s.id === id);
  }

  /** @returns {number} 0-based index of a step, or -1 */
  stepIndexById(id) {
    return this.steps.findIndex((s) => s.id === id);
  }

  /** @returns {object|undefined} an input/output item */
  findIO(stepId, type, ioId) {
    const step = this.findStep(stepId);
    if (!step || !Array.isArray(step[type])) return undefined;
    return step[type].find((io) => io.id === ioId);
  }

  // ─── Step CRUD (chain-core overrides) ────────────────────────

  /**
   * Insert a new empty, PM-normalized step at the given index.
   * @param {number} atIndex
   * @returns {string} the new step id
   */
  addStep(atIndex) {
    const step = super.addStep(atIndex, {}, pmNormalize);
    return step.id;
  }

  /**
   * Remove a step; clear the loop of any step that was targeting it
   * (preserves legacy behavior: the whole loop is cleared, not just the
   * target reference).
   * @param {string} id
   * @returns {boolean} true if removed
   */
  removeStep(id) {
    const ok = super.removeStep(id);
    if (ok) {
      this.steps.forEach((s) => {
        if (s.loop && s.loop.targetStepId === id) s.loop = null;
      });
    }
    return ok;
  }

  /**
   * Move a step to a chain gap, then revalidate loop targets that might now
   * point forward.
   * @param {string} fromId
   * @param {number} gapIndex
   * @returns {boolean} true if the chain order changed
   */
  moveStepToGap(fromId, gapIndex) {
    const ok = super.moveStepToGap(fromId, gapIndex);
    if (ok) this.validateLoopTargets();
    return ok;
  }

  // ─── IO CRUD ────────────────────────────────────────────────

  /** Append an input/output item; returns its id. */
  addIO(stepId, type) {
    const step = this.findStep(stepId);
    if (!step) return null;
    const io = { id: generateId(), name: '' };
    step[type].push(io);
    return io.id;
  }

  removeIO(stepId, type, ioId) {
    const step = this.findStep(stepId);
    if (!step) return;
    step[type] = step[type].filter((io) => io.id !== ioId);
  }

  /** Cycle an input's type null→param→noise→null. */
  cycleInputType(stepId, ioId) {
    const io = this.findIO(stepId, 'inputs', ioId);
    if (!io) return;
    const idx = INPUT_TYPE_CYCLE.indexOf(io.inputType || null);
    io.inputType = INPUT_TYPE_CYCLE[(idx + 1) % INPUT_TYPE_CYCLE.length];
  }

  /** Move an IO item within a step's input/output list. */
  moveIO(stepId, type, fromId, toId) {
    const step = this.findStep(stepId);
    if (!step || !Array.isArray(step[type]) || fromId === toId) return;
    const arr = step[type];
    const from = arr.findIndex((io) => io.id === fromId);
    const to = arr.findIndex((io) => io.id === toId);
    if (from === -1 || to === -1) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
  }

  // ─── Value type ─────────────────────────────────────────────

  /** Cycle a step's value type null→va→bnva→nva→null. */
  cycleValueType(stepId) {
    const step = this.findStep(stepId);
    if (!step) return;
    const idx = VALUE_CYCLE.indexOf(step.valueType);
    step.valueType = VALUE_CYCLE[(idx + 1) % VALUE_CYCLE.length];
  }

  // ─── Substeps ───────────────────────────────────────────────

  /**
   * Add an empty substep to a step.
   * @param {string} stepId
   * @returns {string|null} the new substep id, or null if the step doesn't exist
   */
  addSubstep(stepId) {
    const ss = super.addSubstep(stepId, {});
    return ss ? ss.id : null;
  }

  /**
   * Remove a substep; collapse the parent (`expanded = false`) once its
   * substeps list becomes empty.
   * @param {string} parentId
   * @param {string} substepId
   * @returns {boolean} true if removed
   */
  removeSubstep(parentId, substepId) {
    const ok = super.removeSubstep(parentId, substepId);
    if (ok) {
      const parent = this.findStep(parentId);
      if (parent && parent.substeps.length === 0) parent.expanded = false;
    }
    return ok;
  }

  // ─── Loops ──────────────────────────────────────────────────

  toggleLoop(stepId) {
    const step = this.findStep(stepId);
    if (!step) return;
    this.setLoop(stepId, !step.loop);
  }

  /**
   * Set a step's loop absolutely — the counterpart `toggleLoop` is UI-only
   * (W1-3: a toggle whose outcome depends only on prior state is not its own
   * capability for an agent). Switching the loop on creates an empty one;
   * switching it off drops it with its condition, target and rework steps.
   * @param {string} stepId
   * @param {boolean} on
   * @returns {boolean} true if the step was found and set
   */
  setLoop(stepId, on) {
    const step = this.findStep(stepId);
    if (!step) return false;
    step.loop = on === true ? (step.loop || { targetStepId: null, condition: '', steps: [] }) : null;
    return true;
  }

  removeLoop(stepId) {
    const step = this.findStep(stepId);
    if (!step) return;
    step.loop = null;
  }

  addLoopStep(stepId) {
    const step = this.findStep(stepId);
    if (!step || !step.loop) return null;
    if (!Array.isArray(step.loop.steps)) step.loop.steps = [];
    const ls = { id: generateId(), title: '' };
    step.loop.steps.push(ls);
    return ls.id;
  }

  removeLoopStep(parentId, loopStepId) {
    const step = this.findStep(parentId);
    if (!step || !step.loop) return;
    step.loop.steps = step.loop.steps.filter((ls) => ls.id !== loopStepId);
  }

  /** Clear any loop target that no longer points to an earlier step. */
  validateLoopTargets() {
    this.steps.forEach((step, idx) => {
      if (!step.loop || !step.loop.targetStepId) return;
      const targetIdx = this.stepIndexById(step.loop.targetStepId);
      if (targetIdx === -1 || targetIdx >= idx) step.loop.targetStepId = null;
    });
  }

  // ─── loadExample guard ──────────────────────────────────────

  /** @returns {boolean} true when at least one step exists */
  hasContent() {
    return (this.steps?.length || 0) > 0;
  }

  // ─── Export ─────────────────────────────────────────────────

  /**
   * Build the structured JSON export (mirrors legacy `_exportJSON`). Pure — no i18n.
   * @returns {object}
   */
  toExportJSON() {
    return {
      tool: 'ProcessMap',
      timestamp: new Date().toISOString(),
      steps: this.steps.map((s, i) => ({
        step: i + 1,
        title: s.title,
        description: s.description,
        valueType: s.valueType || null,
        inputs: s.inputs.filter((io) => io.name).map((io) => ({
          name: io.name,
          ...(io.inputType ? { type: io.inputType } : {}),
        })),
        outputs: s.outputs.map((io) => io.name).filter(Boolean),
        substeps: (s.substeps || []).map((ss, si) => ({
          step: `${i + 1}.${si + 1}`,
          title: ss.title,
        })),
        ...(s.loop ? {
          loop: {
            condition: s.loop.condition || '',
            targetStep: s.loop.targetStepId
              ? this.stepIndexById(s.loop.targetStepId) + 1
              : null,
            steps: (s.loop.steps || []).map((ls) => ls.title),
          },
        } : {}),
      })),
    };
  }

  // ─── Serialization ──────────────────────────────────────────

  /**
   * Deserialize, validating each field and always returning a usable default.
   * @param {object|null|undefined} d
   * @returns {State}
   */
  static fromJSON(d) {
    const base = FlowchartState.fromJSON(d, pmNormalize);
    const s = new State();
    s.steps = base.steps;
    return s;
  }
}

/**
 * Rail cell modifiers for one loop band — one entry per step column. The view
 * turns each entry into a `pmap__loop-rail-cell--<modifier>` class; CSS draws
 * the return path from them.
 * A target that is unset, missing or not before the source leaves the rail
 * open at the source.
 * @param {number} stepCount number of step columns
 * @param {number} sourceIdx index of the step that owns the loop
 * @param {number} targetIdx index of the target step, -1 when unset
 * @returns {Array<''|'target'|'span'|'source'|'source-open'>}
 */
export function loopRailCells(stepCount, sourceIdx, targetIdx) {
  const cells = new Array(stepCount).fill('');
  if (sourceIdx < 0 || sourceIdx >= stepCount) return cells;
  if (targetIdx < 0 || targetIdx >= sourceIdx) {
    cells[sourceIdx] = 'source-open';
    return cells;
  }
  cells[targetIdx] = 'target';
  for (let i = targetIdx + 1; i < sourceIdx; i++) cells[i] = 'span';
  cells[sourceIdx] = 'source';
  return cells;
}

/** Columns where a loop's rail rises to the cards: its valid target and its source. */
function loopVerticals(stepCount, { sourceIdx, targetIdx }) {
  if (sourceIdx < 0 || sourceIdx >= stepCount) return [];
  return targetIdx >= 0 && targetIdx < sourceIdx ? [targetIdx, sourceIdx] : [sourceIdx];
}

/**
 * Columns each loop band must let a lower band's rail pass through. Bands
 * stack below the outputs row in the given order, so the rail of band k
 * rises through every band above it; band j gets the verticals of all bands
 * k > j. The view draws them as full-height lines in rail and body rows.
 * @param {number} stepCount number of step columns
 * @param {Array<{sourceIdx:number, targetIdx:number}>} lanes bands, top to bottom
 * @returns {number[][]} per band, the sorted pass-through columns
 */
export function loopPassColumns(stepCount, lanes) {
  const verticals = lanes.map((lane) => loopVerticals(stepCount, lane));
  return lanes.map((_, j) => [...new Set(verticals.slice(j + 1).flat())].sort((a, b) => a - b));
}

/**
 * Columns that get an arrowhead into the card above. Every rail ends at the
 * outputs row, so all arrowheads sit in the topmost band — one per distinct
 * valid loop target.
 * @param {number} stepCount number of step columns
 * @param {Array<{sourceIdx:number, targetIdx:number}>} lanes bands, top to bottom
 * @returns {number[]} sorted target columns
 */
export function loopArrowColumns(stepCount, lanes) {
  const targets = lanes
    .filter(({ sourceIdx, targetIdx }) => sourceIdx < stepCount && targetIdx >= 0 && targetIdx < sourceIdx)
    .map(({ targetIdx }) => targetIdx);
  return [...new Set(targets)].sort((a, b) => a - b);
}
