/**
 * D.Mike — Activity-Flowchart: Model.
 *
 * Eine Kette aus Aktivitäten und Entscheidungen (Rauten), jeder Schritt mit
 * Unterschritten. Gespeichert: `{ _schema, steps, expanded }`. Eine Raute
 * öffnet ein Band für ihren Nein-Zweig (`branchId` = `no:<id>`), ihr `noTarget`
 * nennt den Wiedereinstieg (`end` = keiner). Die Bandzeilen sind abgeleitet
 * (`derived bands`), `expanded` nennt die ids der aufgeklappten Schritte.
 * Indizes der Kommandos sind Endindizes (Position nach der Änderung).
 */
import {
  defineModel, command, list, object, text, oneOf, boolean, index, idOf, number, cloneJSON,
} from '../../../core/model.js';
import { uid } from '../../../core/uid.js';
import { requireForm, requireIndex, requireKnownId } from '../../../core/validate.js';
import {
  insertStep, removeStep, addSubstep, removeSubstep, moveSubstep,
} from '../../../core/flowchart/chain.js';
import {
  MAIN_BRANCH, BRANCH_PREFIX, branchOwnerId, memberIndices, blockIndices, reconcile, branchesValid,
  knownBands, moveBlock,
} from './branches.js';
import { bandRows, bandLabel } from './layout.js';
import { from0 } from './migrations.js';

/** @typedef {import('./model.types.js').StateFields['steps']} Steps */
/**
 * Ein Band, von oben nach unten.
 * @typedef {object} BandRow
 * @property {string} id  Band-id: `main` oder `no:<id der Raute>`
 * @property {string|null} ownerId  die Raute, die das Band öffnet; beim Hauptpfad keine
 * @property {string} label  Beschriftung in der App-Sprache
 * @property {number} depth  Schachtelungstiefe, Hauptpfad 0
 */

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
 * Eine Ablehnung mit `param` und einem Hinweis der Oberfläche (`hintKey`).
 * @param {string} param @param {unknown} value @param {string} allowed @param {string} hintKey
 * @returns {never}
 */
function reject(param, value, allowed, hintKey) {
  try {
    requireForm(param, value, false, allowed);
  } catch (err) {
    throw Object.assign(err, { hintKey });
  }
  throw new Error('unreachable');
}

/**
 * Ist das Ziel gültig gespeichert: `end` oder die id eines anderen Schritts?
 * @param {Steps} steps @param {{ id: string, decision: { noTarget: string }|null }} s
 * @returns {boolean}
 */
function knownTarget(steps, s) {
  const t = s.decision?.noTarget;
  return t === undefined || t === 'end' || (t !== s.id && steps.some((x) => x.id === t));
}

export class State extends defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    steps: list(object({
      id: text(),
      title: text(),
      description: text(),
      kind: oneOf(['activity', 'decision']),
      branchId: text(),
      decision: object({ label: text(), noTarget: text() }, { nullable: true }),
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
    decisionShape: {
      fields: ['steps'],
      test(m) { return m.steps.every((s) => (s.kind === 'decision') === (s.decision !== null)); },
      repair(m) {
        for (const s of m._v.steps) {
          if (s.kind !== 'decision') s.decision = null;
          else if (s.decision === null) s.decision = { label: '', noTarget: 'end' };
        }
      },
    },
    knownBranch: {
      fields: ['steps'],
      test(m) { return branchesValid(m.steps); },
      repair(m) { m._v.steps = reconcile(m._v.steps); },
    },
    knownNoTarget: {
      fields: ['steps'],
      test(m) { return m.steps.every((s) => knownTarget(m.steps, s)); },
      repair(m) {
        for (const s of m._v.steps) if (!knownTarget(m._v.steps, s)) s.decision.noTarget = 'end';
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
  derived: {
    /**
     * Die Bänder von oben nach unten, der Hauptpfad zuerst — genau die
     * Band-ids, die die Kommandos annehmen. Beschriftung in der App-Sprache.
     * @param {object} _src Leser fremder Instanzen
     * @param {object} _d andere Ableitungen
     * @param {(key: string, params?: object) => string} t Übersetzer des Moduls
     * @this {import('./model.types.js').StateModel}
     * @returns {BandRow[]}
     */
    bands(_src, _d, t) {
      return bandRows(this.steps, (owner) => bandLabel(owner, t));
    },
  },
  commands: {
    addStep: command({
      params: {
        kind: oneOf(['activity', 'decision'], { optional: true }),
        bandId: text({ optional: true }),
        index: index('steps', { optional: true }),
      },
      returns: text(),
      run({ kind = 'activity', bandId = MAIN_BRANCH, index: at }) {
        requireKnownId('bandId', bandId, knownBands(this.steps));
        let where = at;
        if (where === undefined) {
          const ownerAt = this.steps.findIndex((s) => s.id === branchOwnerId(bandId));
          const members = memberIndices(this.steps, bandId);
          where = bandId === MAIN_BRANCH ? this.steps.length
            : (members.length > 0 ? members[members.length - 1] : ownerAt) + 1;
        }
        const id = `s${uid()}`;
        const decision = kind === 'decision' ? { label: '', noTarget: 'end' } : null;
        this.steps = insertStep(copySteps(this.steps), {
          id, title: '', description: '', kind, branchId: bandId, decision, substeps: [],
        }, where);
        return id;
      },
    }),
    removeStep: command({
      params: { id: idOf('steps') },
      run({ id }) {
        const gone = this.steps.find((s) => s.id === id);
        const dissolved = gone?.kind === 'decision' ? BRANCH_PREFIX + id : null;
        this.steps = removeStep(copySteps(this.steps), id).map((s) => ({
          ...s,
          branchId: s.branchId === dissolved ? gone.branchId : s.branchId,
          decision: s.decision && s.decision.noTarget === id ? { ...s.decision, noTarget: 'end' } : s.decision,
        }));
        this.expanded = this.expanded.filter((e) => e !== id);
      },
    }),
    moveStep: command({
      params: { id: idOf('steps'), index: number({ integer: true, min: 0 }) },
      run({ id, index: at }) {
        requireIndex('index', at, this.steps.length - blockIndices(this.steps, id).length);
        this.steps = reconcile(moveBlock(copySteps(this.steps), id, at));
      },
    }),
    setStepBand: command({
      params: { stepId: idOf('steps'), bandId: text() },
      run({ stepId, bandId }) {
        requireKnownId('bandId', bandId, knownBands(this.steps));
        const at = this.steps.findIndex((s) => s.id === stepId);
        const ownerAt = this.steps.findIndex((s) => s.id === branchOwnerId(bandId));
        if (bandId !== MAIN_BRANCH && ownerAt >= at) {
          reject('bandId', bandId, 'the band of a decision that stands before the step', 'bandNotBefore');
        }
        this.steps = copySteps(this.steps).map((s) => (s.id === stepId ? { ...s, branchId: bandId } : s));
      },
    }),
    setDecisionTarget: command({
      params: { stepId: idOf('steps'), target: text() },
      run({ stepId, target }) {
        const step = this.steps.find((s) => s.id === stepId);
        if (step?.kind !== 'decision') reject('stepId', stepId, 'the id of a decision', 'notDecision');
        const sameBand = this.steps.filter((s) => s.id !== stepId && s.branchId === step.branchId).map((s) => s.id);
        if (target !== 'end' && !sameBand.includes(target)) {
          reject('target', target, `'end' or the id of another step in the band of the decision: ${sameBand.join(', ')}`, 'targetNotInBand');
        }
        this.steps = copySteps(this.steps).map((s) => (s.id === stepId
          ? { ...s, decision: { label: s.decision?.label ?? '', noTarget: target } }
          : s));
      },
    }),
    addSubstep: command({
      params: { stepId: idOf('steps') },
      returns: text(),
      run({ stepId }) {
        const id = `ss${uid()}`;
        this.steps = addSubstep(copySteps(this.steps), stepId, { id, title: '' });
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
          id: `s${uid()}`, title: s.title, description: s.description, kind: 'activity', branchId: MAIN_BRANCH,
          decision: null, substeps: [],
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
