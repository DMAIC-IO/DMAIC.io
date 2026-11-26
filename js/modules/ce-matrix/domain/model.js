/**
 * D.Mike — C&E-Matrix: Model.
 *
 * Eingangsgrößen (Zeilen) und Ergebnisgrößen (Spalten) mit eigener id, die
 * Kundenwichtigkeit an der Spalte, je bewerteter Kreuzung ein Eintrag unter
 * `<input-id>:<output-id>` und die aktive Bewertungsskala. Entfernen löscht
 * die Bewertungen der id; die Schlüssel werden nie umgerechnet. Zeilensummen
 * und erlaubte Bewertungen sind abgeleitet. Ohne DOM, ohne i18n.
 *
 * Gespeichert: `{ _schema, inputs, outputs, scores, scale, paretoEdits }`.
 * Dass ids eindeutig sind und jede Bewertung auf eine vorhandene Zeile und
 * Spalte zeigt, sichern die Invarianten — beim Laden repariert, beim
 * Schreiben abgelehnt. Bewertungen außerhalb der Skala bleiben stehen; nur
 * `setScore` lehnt sie ab.
 */
import {
  defineModel, command, list, object, map, text, number, idOf, oneOf,
} from '../../../core/model.js';
import { requireForm } from '../../../core/validate.js';
import { uid } from '../../../core/uid.js';
import paretoChart from '../../../widgets/pareto-chart/schema.js';
import { from0 } from './migrations.js';
import { cellKey, allowedScores, rowSum } from './matrix.js';

/**
 * True, wenn jede id nicht leer ist, keinen Doppelpunkt enthält und nur
 * einmal vorkommt.
 * @param {ReadonlyArray<{ id: string }>} items @returns {boolean}
 */
function validIds(items) {
  const ids = items.map((x) => x.id);
  return ids.every((id) => id !== '' && !id.includes(':')) && new Set(ids).size === ids.length;
}

/**
 * Einträge mit leerer id oder einer id mit Doppelpunkt bekommen eine neue,
 * spätere Doppelte entfallen.
 * @template {{ id: string }} T
 * @param {T[]} items @returns {T[]}
 */
function repairIds(items) {
  const taken = new Set(items.map((x) => x.id));
  const seen = new Set();
  return items.filter((x) => {
    if (x.id === '' || x.id.includes(':')) {
      let id = uid();
      while (taken.has(id)) id = uid();
      taken.add(id);
      x.id = id;
    }
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

/**
 * Die Schlüssel aller Zellen der Matrix.
 * @param {{ inputs: ReadonlyArray<{ id: string }>, outputs: ReadonlyArray<{ id: string }> }} m
 * @returns {Set<string>}
 */
function cellKeys(m) {
  const keys = new Set();
  for (const i of m.inputs) for (const o of m.outputs) keys.add(cellKey(i.id, o.id));
  return keys;
}

/**
 * Die Bewertungen ohne die Einträge, für die `drop(key)` gilt.
 * @param {Readonly<Record<string, number>>} scores @param {(key: string) => boolean} drop
 * @returns {Record<string, number>}
 */
function without(scores, drop) {
  return Object.fromEntries(Object.entries(scores).filter(([k]) => !drop(k)));
}

/**
 * Lehnt das Entfernen des letzten Eintrags einer Liste ab.
 * @param {string} param @param {string} id @param {number} length @param {string} hintKey
 * @throws {Error} mit `param` und dem Hinweis `hintKey` für die Oberfläche
 */
function requireNotLast(param, id, length, hintKey) {
  try {
    requireForm(param, id, length > 1, 'any but the last remaining one');
  } catch (err) {
    throw Object.assign(err, { hintKey });
  }
}

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** die Eingangsgrößen (Zeilen) in Anzeigereihenfolge, je mit id und Namen */
    inputs: list(object({ id: text(), name: text() }), {
      default: [{ id: 'i1', name: 'Input 1' }, { id: 'i2', name: 'Input 2' }, { id: 'i3', name: 'Input 3' }],
    }),
    /** die Ergebnisgrößen (Spalten) in Anzeigereihenfolge, je mit id, Namen und Kundenwichtigkeit 1..10 */
    outputs: list(object({ id: text(), name: text(), weight: number({ integer: true, min: 1, max: 10, default: 1 }) }), {
      default: [
        { id: 'o1', name: 'Output 1', weight: 1 },
        { id: 'o2', name: 'Output 2', weight: 1 },
        { id: 'o3', name: 'Output 3', weight: 1 },
      ],
    }),
    /** je bewerteter Kreuzung ein Eintrag unter `<input-id>:<output-id>`; eine Kreuzung ohne Eintrag zählt als 0 */
    scores: map(text(), number()),
    /** die aktive Bewertungsskala */
    scale: oneOf(['0-10', '0-1-3-9', '0-3-7-10'], { default: '0-10' }),
  },
  view: {
    paretoEdits: paretoChart.edits(),
  },
  invariants: {
    inputIds: {
      fields: ['inputs'],
      test(m) { return validIds(m.inputs); },
      repair(m) { m._v.inputs = repairIds(m._v.inputs); },
    },
    outputIds: {
      fields: ['outputs'],
      test(m) { return validIds(m.outputs); },
      repair(m) { m._v.outputs = repairIds(m._v.outputs); },
    },
    knownCells: {
      fields: ['scores', 'inputs', 'outputs'],
      test(m) {
        const keys = cellKeys(m);
        return Object.keys(m.scores).every((k) => keys.has(k));
      },
      repair(m) {
        const keys = cellKeys(m._v);
        m._v.scores = without(m._v.scores, (k) => !keys.has(k));
      },
    },
  },
  commands: {
    addInput: command({
      returns: text(),
      run() {
        const id = uid();
        this.inputs.push({ id, name: `Input ${this.inputs.length + 1}` });
        return id;
      },
    }),
    addOutput: command({
      returns: text(),
      run() {
        const id = uid();
        this.outputs.push({ id, name: `Output ${this.outputs.length + 1}`, weight: 1 });
        return id;
      },
    }),
    removeInput: command({
      params: { inputId: idOf('inputs') },
      run({ inputId }) {
        requireNotLast('inputId', inputId, this.inputs.length, 'lastInput');
        const prefix = `${inputId}:`;
        this.scores = without(this.scores, (k) => k.startsWith(prefix));
        this.inputs = this.inputs.filter((i) => i.id !== inputId);
      },
    }),
    removeOutput: command({
      params: { outputId: idOf('outputs') },
      run({ outputId }) {
        requireNotLast('outputId', outputId, this.outputs.length, 'lastOutput');
        const suffix = `:${outputId}`;
        this.scores = without(this.scores, (k) => k.endsWith(suffix));
        this.outputs = this.outputs.filter((o) => o.id !== outputId);
      },
    }),
    setScore: command({
      params: { inputId: idOf('inputs'), outputId: idOf('outputs'), value: number({ nullable: true }) },
      run({ inputId, outputId, value }) {
        const key = cellKey(inputId, outputId);
        if (value === null) {
          this.scores = without(this.scores, (k) => k === key);
          return;
        }
        const allowed = allowedScores(this.scale);
        requireForm('value', value, allowed.includes(value), allowed.join(', '));
        this.scores = { ...this.scores, [key]: value };
      },
    }),
    setWeight: command({
      params: { outputId: idOf('outputs'), value: number({ integer: true, min: 1, max: 10 }) },
      run({ outputId, value }) {
        this.outputs.find((o) => o.id === outputId).weight = value;
      },
    }),
    setInputName: command({
      params: { inputId: idOf('inputs'), text: text() },
      run({ inputId, text: name }) {
        this.inputs.find((i) => i.id === inputId).name = name;
      },
    }),
    setOutputName: command({
      params: { outputId: idOf('outputs'), text: text() },
      run({ outputId, text: name }) {
        this.outputs.find((o) => o.id === outputId).name = name;
      },
    }),
  },
  derived: {
    /**
     * Die Bewertungen, die `setScore` auf der aktiven Skala annimmt.
     * @this {import('./model.types.js').StateModel}
     * @returns {number[]}
     */
    allowedScores() {
      return [...allowedScores(this.scale)];
    },
    /**
     * Die Zeilensumme je Eingangsgröße, in der Reihenfolge von `inputs`.
     * @this {import('./model.types.js').StateModel}
     * @returns {number[]}
     */
    rowSums() {
      return this.inputs.map((i) => rowSum(this, i.id));
    },
  },
});
