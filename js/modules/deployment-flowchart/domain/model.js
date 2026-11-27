/**
 * D.Mike — Deployment-Flowchart: Model.
 *
 * Eine Kette von Schritten über Bahnen (Rollen, Abteilungen), jeder Schritt
 * mit Unterschritten. Gespeichert: `{ _schema, steps, lanes, expanded }`;
 * `laneId` am Schritt nennt seine Bahn, die Position in `lanes` ist die
 * Anzeigereihenfolge, `expanded` nennt die ids der aufgeklappten Schritte.
 * Die reservierte Bahn `unassigned` trägt einen leeren Namen (ihre
 * Beschriftung kommt aus der Oberfläche); sie entsteht, sobald ein Schritt
 * auf sie zeigt, und lässt sich weder umbenennen noch entfernen.
 * Indizes der Kommandos sind Endindizes; die Listenarbeit leistet
 * `core/flowchart/chain.js`.
 */
import {
  defineModel, command, list, object, text, boolean, index, idOf, number, cloneJSON,
} from '../../../core/model.js';
import { uid } from '../../../core/uid.js';
import { requireForm, requireKnownId } from '../../../core/validate.js';
import {
  insertStep, removeStep, moveStep, addSubstep, removeSubstep, moveSubstep,
} from '../../../core/flowchart/chain.js';
import { from0 } from './migrations.js';

/** id der reservierten Bahn „Nicht zugeordnet“. */
export const UNASSIGNED_ID = 'unassigned';

/** @typedef {import('./model.types.js').StateFields['steps']} Steps */
/** @typedef {import('./model.types.js').StateFields['lanes']} Lanes */

/** Tiefe Kopie der Schrittliste, mit ihrem Typ. @param {Steps} steps @returns {Steps} */
const copySteps = (steps) => cloneJSON(steps);

/** Tiefe Kopie der Bahnliste, mit ihrem Typ. @param {Lanes} lanes @returns {Lanes} */
const copyLanes = (lanes) => cloneJSON(lanes);

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
 * Die Bahnliste mit der reservierten Bahn, hinten angehängt, falls sie fehlt.
 * @param {Lanes} lanes @returns {Lanes}
 */
function withUnassigned(lanes) {
  return lanes.some((l) => l.id === UNASSIGNED_ID) ? lanes : [...lanes, { id: UNASSIGNED_ID, name: '' }];
}

/**
 * Ziel-Bahn eines Kommandos prüfen: eine vorhandene Bahn oder die reservierte.
 * @param {Lanes} lanes @param {unknown} laneId
 * @throws {Error} `param: 'laneId'` bei jeder anderen id
 * @returns {void}
 */
function requireLane(lanes, laneId) {
  const known = lanes.map((l) => l.id);
  if (!known.includes(UNASSIGNED_ID)) known.push(UNASSIGNED_ID);
  requireKnownId('laneId', laneId, known);
}

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    steps: list(object({
      id: text(),
      title: text(),
      description: text(),
      laneId: text(),
      substeps: list(object({ id: text(), title: text() })),
    })),
    lanes: list(object({ id: text(), name: text() })),
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
    uniqueLaneIds: {
      fields: ['lanes'],
      test(m) { return distinct(m.lanes.map((l) => l.id)); },
      repair(m) { m._v.lanes = firstById(m._v.lanes); },
    },
    reservedLane: {
      fields: ['lanes'],
      test(m) { return m.lanes.every((l) => l.id !== UNASSIGNED_ID || l.name === ''); },
      repair(m) {
        for (const l of m._v.lanes) if (l.id === UNASSIGNED_ID) l.name = '';
      },
    },
    knownLanes: {
      fields: ['steps', 'lanes'],
      test(m) {
        const ids = new Set(m.lanes.map((l) => l.id));
        return m.steps.every((s) => ids.has(s.laneId));
      },
      repair(m) {
        const ids = new Set(m._v.lanes.map((l) => l.id));
        let moved = false;
        for (const s of m._v.steps) {
          if (ids.has(s.laneId)) continue;
          s.laneId = UNASSIGNED_ID;
          moved = true;
        }
        if (moved) m._v.lanes = withUnassigned(m._v.lanes);
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
      params: { index: index('steps', { optional: true }), laneId: text({ optional: true }) },
      returns: text(),
      run({ index: at, laneId = UNASSIGNED_ID }) {
        requireLane(this.lanes, laneId);
        const id = `s${uid()}`;
        const steps = insertStep(copySteps(this.steps), { id, title: '', description: '', laneId, substeps: [] }, at);
        if (laneId === UNASSIGNED_ID) this.lanes = withUnassigned(copyLanes(this.lanes));
        this.steps = steps;
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
        laneId: text({ optional: true }),
      },
      run({ id, index: at, laneId }) {
        if (laneId !== undefined) requireLane(this.lanes, laneId);
        const steps = moveStep(copySteps(this.steps), id, at);
        if (laneId !== undefined) {
          steps[at].laneId = laneId;
          if (laneId === UNASSIGNED_ID) this.lanes = withUnassigned(copyLanes(this.lanes));
        }
        this.steps = steps;
      },
    }),
    setLaneForStep: command({
      params: { stepId: idOf('steps'), laneId: text() },
      run({ stepId, laneId }) {
        requireLane(this.lanes, laneId);
        if (laneId === UNASSIGNED_ID) this.lanes = withUnassigned(copyLanes(this.lanes));
        this.steps = copySteps(this.steps).map((s) => (s.id === stepId ? { ...s, laneId } : s));
      },
    }),
    addLane: command({
      params: {},
      returns: text(),
      run() {
        const id = `lane-${uid()}`;
        this.lanes = [...copyLanes(this.lanes), { id, name: '' }];
        return id;
      },
    }),
    removeLane: command({
      params: { laneId: idOf('lanes') },
      run({ laneId }) {
        requireForm('laneId', laneId, laneId !== UNASSIGNED_ID, 'a lane other than the reserved "unassigned"');
        this.lanes = withUnassigned(copyLanes(this.lanes).filter((l) => l.id !== laneId));
        this.steps = copySteps(this.steps).map((s) => (s.laneId === laneId ? { ...s, laneId: UNASSIGNED_ID } : s));
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
        steps: list(object({ title: text(), description: text() })),
      },
      returns: number(),
      run({ steps }) {
        const added = steps.map((s) => ({
          id: `s${uid()}`, title: s.title, description: s.description, laneId: UNASSIGNED_ID, substeps: [],
        }));
        if (added.length > 0) this.lanes = withUnassigned(copyLanes(this.lanes));
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
