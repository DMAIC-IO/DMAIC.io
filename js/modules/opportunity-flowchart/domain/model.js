/**
 * D.Mike — Opportunity-Flowchart: Model.
 *
 * Eine Kette von Schritten, jeder wertschöpfend (`va`) oder nicht
 * wertschöpfend (`nva`), mit Unterschritten. Gespeichert:
 * `{ _schema, steps, expanded }`; `expanded` nennt die ids der aufgeklappten
 * Schritte. Indizes der Kommandos sind Endindizes (Position nach der
 * Änderung); die Listenarbeit leistet `core/flowchart/chain.js`.
 */
import {
  defineModel, command, list, object, text, oneOf, boolean, index, idOf, number, cloneJSON,
} from '../../../core/model.js';
import { uid } from '../../../core/uid.js';
import {
  insertStep, removeStep, moveStep, addSubstep, removeSubstep, moveSubstep,
} from '../../../core/flowchart/chain.js';
import { from0 } from './migrations.js';

/** @typedef {import('./model.types.js').StateFields['steps']} Steps */

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

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    steps: list(object({
      id: text(),
      title: text(),
      description: text(),
      side: oneOf(['va', 'nva']),
      substeps: list(object({ id: text(), title: text() })),
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
  },
  commands: {
    addStep: command({
      params: { side: oneOf(['va', 'nva']), index: index('steps', { optional: true }) },
      returns: text(),
      run({ side, index: at }) {
        const id = `s${uid()}`;
        this.steps = insertStep(copySteps(this.steps), { id, title: '', description: '', side, substeps: [] }, at);
        return id;
      },
    }),
    removeStep: command({
      params: { id: idOf('steps') },
      run({ id }) {
        this.steps = removeStep(copySteps(this.steps), id);
        this.expanded = this.expanded.filter((e) => e !== id);
      },
    }),
    moveStep: command({
      params: {
        id: idOf('steps'),
        index: index('steps', { existing: true }),
        side: oneOf(['va', 'nva'], { optional: true }),
      },
      run({ id, index: at, side }) {
        const steps = moveStep(copySteps(this.steps), id, at);
        if (side !== undefined) steps[at].side = side;
        this.steps = steps;
      },
    }),
    setSide: command({
      params: { id: idOf('steps'), side: oneOf(['va', 'nva']) },
      run({ id, side }) {
        this.steps = copySteps(this.steps).map((s) => (s.id === id ? { ...s, side } : s));
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
        this.steps = removeSubstep(copySteps(this.steps), stepId, substepId);
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
    appendSteps: command({
      params: {
        steps: list(object({ title: text(), description: text(), side: oneOf(['va', 'nva']) })),
      },
      returns: number(),
      run({ steps }) {
        const added = steps.map((s) => ({
          id: `s${uid()}`, title: s.title, description: s.description, side: s.side, substeps: [],
        }));
        this.steps = [...copySteps(this.steps), ...added];
        return added.length;
      },
    }),
  },
}) {
  /** @returns {boolean} wahr, sobald es einen Schritt gibt (steuert die Rückfrage vor dem Überschreiben) */
  hasContent() {
    return this.steps.length > 0;
  }
}
