/**
 * D.Mike — RACI-Matrix: Model.
 *
 * Aktivitäten (Zeilen) und Beteiligte (Spalten) mit eigener id, dazu je Zelle
 * mit Rolle ein Eintrag unter `<aktivitäts-id>:<stakeholder-id>`. Verschieben
 * ändert nur die Reihenfolge, Entfernen löscht die Rollen der id; die Schlüssel
 * werden nie umgerechnet. Die Prüfung je Aktivität ist abgeleitet. Ohne DOM,
 * ohne i18n.
 *
 * Gespeichert: `{ _schema, activities, stakeholders, assignments }`. Dass ids
 * eindeutig sind und jede Rolle auf eine vorhandene Zeile und Spalte zeigt,
 * sichern die Invarianten — beim Laden repariert, beim Schreiben abgelehnt.
 * `moveActivity.to` ist der ENDINDEX.
 */
import {
  defineModel, command, list, object, map, text, idOf, index, oneOf,
} from '../../../core/model.js';
import { uid } from '../../../core/uid.js';
import { from0 } from './migrations.js';
import { ROLES, cellKey, nextRole, checkRows } from './check.js';

export { ROLES };

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
 * @param {{ activities: ReadonlyArray<{ id: string }>, stakeholders: ReadonlyArray<{ id: string }> }} m
 * @returns {Set<string>}
 */
function cellKeys(m) {
  const keys = new Set();
  for (const a of m.activities) for (const s of m.stakeholders) keys.add(cellKey(a.id, s.id));
  return keys;
}

/**
 * Die Rollen mit `role` unter `key`; der leere Text nimmt den Eintrag heraus.
 * Ein neuer Eintrag kommt ans Ende, ein vorhandener behält seinen Platz.
 * @param {Readonly<Record<string, string>>} assignments @param {string} key @param {string} role
 * @returns {Record<string, string>}
 */
function withRole(assignments, key, role) {
  const out = { ...assignments };
  if (role) out[key] = role;
  else delete out[key];
  return out;
}

/**
 * Die Befunde einer Aktivität.
 *
 * @typedef {object} RowWarning
 * @property {string} activityId  id of the activity
 * @property {string[]} issues  noR: no R in the row, noA: no A, multiA: more than one A; in this order
 */

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** die Aktivitäten (Zeilen) in Anzeigereihenfolge, je mit id und Namen */
    activities: list(object({ id: text(), name: text() })),
    /** die Beteiligten (Spalten) in Anzeigereihenfolge, je mit id und Namen */
    stakeholders: list(object({ id: text(), name: text() })),
    /** je Zelle mit Rolle ein Eintrag unter `<aktivitäts-id>:<stakeholder-id>`; eine Zelle ohne Rolle fehlt */
    assignments: map(text(), oneOf(['R', 'A', 'C', 'I'])),
  },
  invariants: {
    activityIds: {
      fields: ['activities'],
      test(m) { return validIds(m.activities); },
      repair(m) { m._v.activities = repairIds(m._v.activities); },
    },
    stakeholderIds: {
      fields: ['stakeholders'],
      test(m) { return validIds(m.stakeholders); },
      repair(m) { m._v.stakeholders = repairIds(m._v.stakeholders); },
    },
    knownCells: {
      fields: ['assignments', 'activities', 'stakeholders'],
      test(m) {
        const keys = cellKeys(m);
        return Object.keys(m.assignments).every((k) => keys.has(k));
      },
      repair(m) {
        const keys = cellKeys(m._v);
        m._v.assignments = Object.fromEntries(Object.entries(m._v.assignments).filter(([k]) => keys.has(k)));
      },
    },
  },
  commands: {
    addActivity: command({
      params: { text: text({ trim: true, nonEmpty: true }) },
      returns: text(),
      run({ text: name }) {
        const id = uid();
        this.activities.push({ id, name });
        return id;
      },
    }),
    addStakeholder: command({
      params: { text: text({ trim: true, nonEmpty: true }) },
      returns: text(),
      run({ text: name }) {
        const id = uid();
        this.stakeholders.push({ id, name });
        return id;
      },
    }),
    renameActivity: command({
      params: { activityId: idOf('activities'), value: text({ trim: true, nonEmpty: true }) },
      run({ activityId, value }) {
        this.activities.find((a) => a.id === activityId).name = value;
      },
    }),
    renameStakeholder: command({
      params: { stakeholderId: idOf('stakeholders'), value: text({ trim: true, nonEmpty: true }) },
      run({ stakeholderId, value }) {
        this.stakeholders.find((s) => s.id === stakeholderId).name = value;
      },
    }),
    removeActivity: command({
      params: { activityId: idOf('activities') },
      run({ activityId }) {
        const prefix = `${activityId}:`;
        this.assignments = Object.fromEntries(Object.entries(this.assignments).filter(([k]) => !k.startsWith(prefix)));
        this.activities = this.activities.filter((a) => a.id !== activityId);
      },
    }),
    removeStakeholder: command({
      params: { stakeholderId: idOf('stakeholders') },
      run({ stakeholderId }) {
        const suffix = `:${stakeholderId}`;
        this.assignments = Object.fromEntries(Object.entries(this.assignments).filter(([k]) => !k.endsWith(suffix)));
        this.stakeholders = this.stakeholders.filter((s) => s.id !== stakeholderId);
      },
    }),
    moveActivity: command({
      params: {
        activityId: idOf('activities'),
        to: index('activities', { afterRemovalFrom: 'activities' }),
      },
      run({ activityId, to }) {
        const from = this.activities.findIndex((a) => a.id === activityId);
        if (from === to) return;
        const [moved] = this.activities.splice(from, 1);
        this.activities.splice(to, 0, moved);
      },
    }),
    setRole: command({
      params: {
        activityId: idOf('activities'),
        stakeholderId: idOf('stakeholders'),
        role: oneOf(['', 'R', 'A', 'C', 'I']),
      },
      run({ activityId, stakeholderId, role }) {
        this.assignments = withRole(this.assignments, cellKey(activityId, stakeholderId), role);
      },
    }),
    cycleRole: command({
      params: { activityId: idOf('activities'), stakeholderId: idOf('stakeholders') },
      run({ activityId, stakeholderId }) {
        const key = cellKey(activityId, stakeholderId);
        this.assignments = withRole(this.assignments, key, nextRole(this.assignments[key] ?? ''));
      },
    }),
  },
  derived: {
    /**
     * Die Befunde je Aktivität mit Befund, in Zeilenreihenfolge. Ohne
     * Beteiligte hat jede Aktivität noR und noA.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {RowWarning[]}
     */
    warnings() {
      return checkRows(this);
    },
  },
});
