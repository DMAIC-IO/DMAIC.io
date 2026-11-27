/**
 * D.Mike — Process Map: Model.
 *
 * Eine Kette von Schritten von links nach rechts; jeder Schritt trägt
 * Inputs, Outputs, eine Wertart, Unterschritte und höchstens einen Loop
 * (Rücksprung zu einem früheren Schritt mit Bedingung und Rework-Schritten).
 * Gespeichert: `{ _schema, steps, expanded }`; `expanded` nennt die ids der
 * Schritte mit aufgeklappten Unterschritten. Indizes der Kommandos sind
 * Endindizes; die Listenarbeit der Kette leistet `core/flowchart/chain.js`.
 */
import {
  defineModel, command, list, object, text, oneOf, boolean, index, idOf, number, cloneJSON,
} from '../../../core/model.js';
import { requireForm, requireKnownId } from '../../../core/validate.js';
import { uid } from '../../../core/uid.js';
import {
  insertStep, removeStep, moveStep, addSubstep, removeSubstep, moveSubstep,
} from '../../../core/flowchart/chain.js';
import { isTargetBefore } from './loops.js';
import { from0 } from './migrations.js';

/** @typedef {import('./model.types.js').StateFields['steps']} Steps */
/** @typedef {Steps[number]} Step */

/** Reihenfolge der Wertarten beim Weiterschalten. */
const VALUE_CYCLE = [null, 'va', 'bnva', 'nva'];
/** Reihenfolge der Input-Typen beim Weiterschalten. */
const INPUT_TYPE_CYCLE = [null, 'param', 'noise'];

/** Tiefe Kopie der Schrittliste, mit ihrem Typ. @param {Steps} steps @returns {Steps} */
const copySteps = (steps) => cloneJSON(steps);

/** @param {string[]} ids @returns {boolean} keine id kommt doppelt vor */
function distinct(ids) {
  return new Set(ids).size === ids.length;
}

/**
 * Spätere Einträge mit schon gesehener id entfallen.
 * @template {{ id: string }} T
 * @param {T[]} items @returns {T[]}
 */
function firstById(items) {
  const seen = new Set();
  return items.filter((x) => {
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

/**
 * Lehnt ab, mit dem Hinweis `hintKey` für die Oberfläche.
 * @param {string} name @param {unknown} value @param {string} allowed @param {string} hintKey
 * @returns {never}
 */
function reject(name, value, allowed, hintKey) {
  try {
    requireForm(name, value, false, allowed);
  } catch (err) {
    throw Object.assign(/** @type {Error} */ (err), { hintKey });
  }
  throw new Error('unreachable');
}

/**
 * Den Schritt `stepId` einer Kopie durch `fn(schritt)` verändern lassen.
 * @param {Steps} steps @param {string} stepId @param {(s: Step) => void} fn
 * @returns {Steps} die geänderte Kopie
 */
function editStep(steps, stepId, fn) {
  const out = copySteps(steps);
  const at = out.findIndex((s) => s.id === stepId);
  requireKnownId('stepId', stepId, out.map((s) => s.id));
  fn(out[at]);
  return out;
}

/**
 * Der Loop eines Schritts, sonst Ablehnung „kein Loop“.
 * @param {Step} step @returns {NonNullable<Step['loop']>}
 */
function loopOf(step) {
  if (!step.loop) reject('stepId', step.id, 'a step that has a loop', 'noLoop');
  return /** @type {NonNullable<Step['loop']>} */ (step.loop);
}

/**
 * Loop-Ziele, die nicht (mehr) vor ihrer Quelle liegen, werden `null`.
 * @param {Steps} steps @returns {Steps} dieselbe Liste, bereinigt
 */
function clearForwardTargets(steps) {
  steps.forEach((s, i) => {
    if (s.loop && s.loop.targetStepId !== null && !isTargetBefore(steps, i, s.loop.targetStepId)) {
      s.loop.targetStepId = null;
    }
  });
  return steps;
}

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    steps: list(object({
      id: text(),
      title: text(),
      description: text(),
      valueType: oneOf(['va', 'bnva', 'nva'], { nullable: true }),
      inputs: list(object({ id: text(), name: text(), inputType: oneOf(['param', 'noise'], { nullable: true }) })),
      outputs: list(object({ id: text(), name: text() })),
      substeps: list(object({ id: text(), title: text() })),
      loop: object({
        targetStepId: text({ nullable: true }),
        condition: text(),
        steps: list(object({ id: text(), title: text() })),
      }, { nullable: true }),
    })),
  },
  view: {
    expanded: list(text(), { unique: true }),
  },
  invariants: {
    uniqueStepIds: {
      fields: ['steps'],
      test(m) { return distinct(m.steps.map((s) => s.id)); },
      repair(m) { m._v.steps = firstById(m._v.steps); },
    },
    uniqueSubstepIds: {
      fields: ['steps'],
      test(m) { return m.steps.every((s) => distinct(s.substeps.map((x) => x.id))); },
      repair(m) {
        for (const s of m._v.steps) s.substeps = firstById(s.substeps);
      },
    },
    uniqueIoIds: {
      fields: ['steps'],
      test(m) { return m.steps.every((s) => distinct(s.inputs.map((x) => x.id)) && distinct(s.outputs.map((x) => x.id))); },
      repair(m) {
        for (const s of m._v.steps) {
          s.inputs = firstById(s.inputs);
          s.outputs = firstById(s.outputs);
        }
      },
    },
    uniqueLoopStepIds: {
      fields: ['steps'],
      test(m) { return m.steps.every((s) => !s.loop || distinct(s.loop.steps.map((x) => x.id))); },
      repair(m) {
        for (const s of m._v.steps) if (s.loop) s.loop.steps = firstById(s.loop.steps);
      },
    },
    validExpanded: {
      fields: ['expanded'],
      test(m) {
        const ids = new Set(m.steps.map((s) => s.id));
        return m.expanded.every((id) => ids.has(id));
      },
      repair(m) {
        const ids = new Set(m._v.steps.map((s) => s.id));
        m._v.expanded = m._v.expanded.filter((id) => ids.has(id));
      },
    },
    loopTargetBefore: {
      fields: ['steps'],
      test(m) {
        return m.steps.every((s, i) => !s.loop || s.loop.targetStepId === null
          || isTargetBefore(m.steps, i, s.loop.targetStepId));
      },
      repair(m) { clearForwardTargets(m._v.steps); },
    },
  },
  commands: {
    addStep: command({
      params: { atIndex: index('steps', { optional: true }) },
      returns: text(),
      run({ atIndex }) {
        const id = `s${uid()}`;
        const step = {
          id, title: '', description: '', valueType: null, inputs: [], outputs: [], substeps: [], loop: null,
        };
        this.steps = insertStep(copySteps(this.steps), step, atIndex);
        return id;
      },
    }),
    removeStep: command({
      params: { id: idOf('steps') },
      run({ id }) {
        const steps = removeStep(copySteps(this.steps), id);
        for (const s of steps) if (s.loop && s.loop.targetStepId === id) s.loop = null;
        this.steps = steps;
        this.expanded = this.expanded.filter((e) => e !== id);
      },
    }),
    moveStep: command({
      params: { id: idOf('steps'), index: index('steps', { existing: true }) },
      run({ id, index: at }) {
        this.steps = clearForwardTargets(moveStep(copySteps(this.steps), id, at));
      },
    }),
    appendSteps: command({
      params: { steps: list(object({ title: text() })) },
      returns: number(),
      run({ steps }) {
        const added = steps.map((s) => ({
          id: `s${uid()}`, title: s.title, description: '', valueType: null,
          inputs: [], outputs: [], substeps: [], loop: null,
        }));
        this.steps = [...copySteps(this.steps), ...added];
        return added.length;
      },
    }),
    cycleValueType: command({
      params: { stepId: idOf('steps') },
      run({ stepId }) {
        this.steps = editStep(this.steps, stepId, (s) => {
          s.valueType = /** @type {Step['valueType']} */ (VALUE_CYCLE[(VALUE_CYCLE.indexOf(s.valueType) + 1) % VALUE_CYCLE.length]);
        });
      },
    }),
    addIO: command({
      params: { stepId: idOf('steps'), type: oneOf(['inputs', 'outputs']) },
      returns: text(),
      run({ stepId, type }) {
        const id = `io${uid()}`;
        this.steps = editStep(this.steps, stepId, (s) => {
          if (type === 'inputs') s.inputs.push({ id, name: '', inputType: null });
          else s.outputs.push({ id, name: '' });
        });
        return id;
      },
    }),
    removeIO: command({
      params: { stepId: idOf('steps'), type: oneOf(['inputs', 'outputs']), ioId: text() },
      run({ stepId, type, ioId }) {
        this.steps = editStep(this.steps, stepId, (s) => {
          const items = /** @type {Array<{ id: string }>} */ (s[type]);
          requireKnownId('ioId', ioId, items.map((x) => x.id));
          if (type === 'inputs') s.inputs = s.inputs.filter((x) => x.id !== ioId);
          else s.outputs = s.outputs.filter((x) => x.id !== ioId);
        });
      },
    }),
    moveIO: command({
      params: { stepId: idOf('steps'), type: oneOf(['inputs', 'outputs']), ioId: text(), targetIoId: text() },
      run({ stepId, type, ioId, targetIoId }) {
        this.steps = editStep(this.steps, stepId, (s) => {
          const items = /** @type {Array<{ id: string }>} */ (s[type]);
          const ids = items.map((x) => x.id);
          requireKnownId('ioId', ioId, ids);
          requireKnownId('targetIoId', targetIoId, ids.filter((x) => x !== ioId));
          const [moved] = items.splice(ids.indexOf(ioId), 1);
          items.splice(ids.indexOf(targetIoId), 0, moved);
        });
      },
    }),
    cycleInputType: command({
      params: { stepId: idOf('steps'), ioId: text() },
      run({ stepId, ioId }) {
        this.steps = editStep(this.steps, stepId, (s) => {
          requireKnownId('ioId', ioId, s.inputs.map((x) => x.id));
          const io = /** @type {Step['inputs'][number]} */ (s.inputs.find((x) => x.id === ioId));
          io.inputType = /** @type {Step['inputs'][number]['inputType']} */ (
            INPUT_TYPE_CYCLE[(INPUT_TYPE_CYCLE.indexOf(io.inputType) + 1) % INPUT_TYPE_CYCLE.length]);
        });
      },
    }),
    addSubstep: command({
      params: { stepId: idOf('steps') },
      returns: text(),
      run({ stepId }) {
        const id = `ss${uid()}`;
        const substep = { id, title: '' };
        this.steps = addSubstep(copySteps(this.steps), stepId, substep);
        return id;
      },
    }),
    removeSubstep: command({
      params: { stepId: idOf('steps'), substepId: text() },
      run({ stepId, substepId }) {
        const steps = removeSubstep(copySteps(this.steps), stepId, substepId);
        this.steps = steps;
        if (steps.find((s) => s.id === stepId)?.substeps.length === 0) {
          this.expanded = this.expanded.filter((e) => e !== stepId);
        }
      },
    }),
    moveSubstep: command({
      params: { stepId: idOf('steps'), substepId: text(), index: number({ integer: true, min: 0 }) },
      run({ stepId, substepId, index: at }) {
        this.steps = moveSubstep(copySteps(this.steps), stepId, substepId, at);
      },
    }),
    setExpanded: command({
      params: { id: idOf('steps'), expanded: boolean() },
      run({ id, expanded }) {
        const rest = this.expanded.filter((e) => e !== id);
        this.expanded = expanded ? [...rest, id] : rest;
      },
    }),
    setLoop: command({
      params: { stepId: idOf('steps'), on: boolean() },
      run({ stepId, on }) {
        this.steps = editStep(this.steps, stepId, (s) => {
          s.loop = on ? (s.loop ?? { targetStepId: null, condition: '', steps: [] }) : null;
        });
      },
    }),
    removeLoop: command({
      params: { stepId: idOf('steps') },
      run({ stepId }) {
        this.steps = editStep(this.steps, stepId, (s) => { s.loop = null; });
      },
    }),
    setLoopTarget: command({
      params: { stepId: idOf('steps'), targetStepId: text({ nullable: true }) },
      run({ stepId, targetStepId }) {
        this.steps = editStep(this.steps, stepId, (s) => {
          const loop = loopOf(s);
          if (!targetStepId) {
            loop.targetStepId = null;
            return;
          }
          requireKnownId('targetStepId', targetStepId, this.steps.map((x) => x.id));
          const at = this.steps.findIndex((x) => x.id === stepId);
          if (!isTargetBefore(this.steps, at, targetStepId)) {
            reject('targetStepId', targetStepId, 'the id of a step before the step with the loop', 'loopTargetNotBefore');
          }
          loop.targetStepId = targetStepId;
        });
      },
    }),
    addLoopStep: command({
      params: { stepId: idOf('steps') },
      returns: text(),
      run({ stepId }) {
        const id = `ls${uid()}`;
        this.steps = editStep(this.steps, stepId, (s) => { loopOf(s).steps.push({ id, title: '' }); });
        return id;
      },
    }),
    removeLoopStep: command({
      params: { stepId: idOf('steps'), loopStepId: text() },
      run({ stepId, loopStepId }) {
        this.steps = editStep(this.steps, stepId, (s) => {
          const loop = loopOf(s);
          requireKnownId('loopStepId', loopStepId, loop.steps.map((x) => x.id));
          loop.steps = loop.steps.filter((x) => x.id !== loopStepId);
        });
      },
    }),
  },
}) {
  /** @returns {boolean} wahr, sobald es einen Schritt gibt (steuert die Rückfrage vor dem Überschreiben) */
  hasContent() {
    return this.steps.length > 0;
  }
}
