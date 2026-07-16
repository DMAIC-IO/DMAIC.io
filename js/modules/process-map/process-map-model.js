/**
 * D.Mike — Process Map Model (process-map-model.js)
 *
 * Pure state + business logic for the vertical process-flow builder.
 * No DOM, no i18n, no CSS classes, no view getters — those live in the data-fn.
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

/** @returns {string} Unique id for steps and IO items (mirrors legacy generateId). */
function generateId() {
  return `s${  Date.now().toString(36)  }${Math.random().toString(36).slice(2, 6)}`;
}

const VALUE_CYCLE = [null, 'va', 'bnva', 'nva'];
const INPUT_TYPE_CYCLE = [null, 'param', 'noise'];

/** Normalize a raw IO entry (preserving inputType when present). */
function normalizeIO(raw) {
  const io = { id: typeof raw?.id === 'string' ? raw.id : generateId(), name: typeof raw?.name === 'string' ? raw.name : '' };
  if (raw && (raw.inputType === 'param' || raw.inputType === 'noise')) io.inputType = raw.inputType;
  return io;
}

/** Normalize a raw step entry to the canonical shape (mirrors legacy load/setState). */
function normalizeStep(raw) {
  return {
    id: typeof raw?.id === 'string' ? raw.id : generateId(),
    title: typeof raw?.title === 'string' ? raw.title : '',
    description: typeof raw?.description === 'string' ? raw.description : '',
    valueType: raw?.valueType || null,
    inputs: Array.isArray(raw?.inputs) ? raw.inputs.map(normalizeIO) : [],
    outputs: Array.isArray(raw?.outputs) ? raw.outputs.map(normalizeIO) : [],
    substeps: Array.isArray(raw?.substeps)
      ? raw.substeps.map((ss) => ({ id: typeof ss?.id === 'string' ? ss.id : generateId(), title: typeof ss?.title === 'string' ? ss.title : '' }))
      : [],
    expanded: typeof raw?.expanded === 'boolean' ? raw.expanded : false,
    loop: raw?.loop
      ? {
          targetStepId: typeof raw.loop.targetStepId === 'string' ? raw.loop.targetStepId : null,
          condition: typeof raw.loop.condition === 'string' ? raw.loop.condition : '',
          steps: Array.isArray(raw.loop.steps)
            ? raw.loop.steps.map((ls) => ({ id: typeof ls?.id === 'string' ? ls.id : generateId(), title: typeof ls?.title === 'string' ? ls.title : '' }))
            : [],
        }
      : null,
  };
}

export class State {
  /** @type {Array<object>} ordered process steps */
  steps = [];

  // ─── Lookup ─────────────────────────────────────────────────

  /** @returns {object|undefined} the step with the given id */
  findStep(id) {
    return this.steps.find((s) => s.id === id);
  }

  /** @returns {object|undefined} an input/output item */
  findIO(stepId, type, ioId) {
    const step = this.findStep(stepId);
    if (!step || !Array.isArray(step[type])) return undefined;
    return step[type].find((io) => io.id === ioId);
  }

  /** @returns {number} 0-based index of a step, or -1 */
  stepIndexById(id) {
    return this.steps.findIndex((s) => s.id === id);
  }

  // ─── Step CRUD ──────────────────────────────────────────────

  /**
   * Insert a new empty step at the given index.
   * @param {number} atIndex
   * @returns {string} the new step id
   */
  addStep(atIndex) {
    const step = {
      id: generateId(),
      title: '',
      description: '',
      valueType: null,
      inputs: [],
      outputs: [],
      substeps: [],
      expanded: false,
      loop: null,
    };
    this.steps.splice(atIndex, 0, step);
    return step.id;
  }

  /** Remove a step; clear any loop targeting it. */
  removeStep(id) {
    this.steps = this.steps.filter((s) => s.id !== id);
    this.steps.forEach((s) => {
      if (s.loop && s.loop.targetStepId === id) s.loop = null;
    });
  }

  /** Move a step from one id's slot to another id's slot, then revalidate loops. */
  moveStep(fromId, toId) {
    const from = this.stepIndexById(fromId);
    const to = this.stepIndexById(toId);
    if (from === -1 || to === -1 || fromId === toId) return;
    const [moved] = this.steps.splice(from, 1);
    this.steps.splice(to, 0, moved);
    this.validateLoopTargets();
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

  toggleSubsteps(stepId) {
    const step = this.findStep(stepId);
    if (!step) return;
    if (!Array.isArray(step.substeps)) step.substeps = [];
    step.expanded = !step.expanded;
  }

  addSubstep(stepId) {
    const step = this.findStep(stepId);
    if (!step) return null;
    if (!Array.isArray(step.substeps)) step.substeps = [];
    const ss = { id: generateId(), title: '' };
    step.substeps.push(ss);
    return ss.id;
  }

  removeSubstep(parentId, substepId) {
    const step = this.findStep(parentId);
    if (!step) return;
    step.substeps = step.substeps.filter((ss) => ss.id !== substepId);
    if (step.substeps.length === 0) step.expanded = false;
  }

  moveSubstep(parentId, fromId, toId) {
    const step = this.findStep(parentId);
    if (!step || !Array.isArray(step.substeps) || fromId === toId) return;
    const arr = step.substeps;
    const from = arr.findIndex((ss) => ss.id === fromId);
    const to = arr.findIndex((ss) => ss.id === toId);
    if (from === -1 || to === -1) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
  }

  // ─── Loops ──────────────────────────────────────────────────

  toggleLoop(stepId) {
    const step = this.findStep(stepId);
    if (!step) return;
    step.loop = step.loop ? null : { targetStepId: null, condition: '', steps: [] };
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

  toJSON() {
    return { steps: JSON.parse(JSON.stringify(this.steps)) };
  }

  /**
   * Deserialize, validating each field and always returning a usable default.
   * @param {object|null|undefined} d
   * @returns {State}
   */
  static fromJSON(d) {
    const s = new State();
    if (d && typeof d === 'object' && Array.isArray(d.steps)) {
      s.steps = d.steps.map(normalizeStep);
    }
    return s;
  }
}