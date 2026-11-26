/**
 * D.Mike — Stakeholder-Analyse: Model.
 *
 * Die Beteiligten in Anlegereihenfolge, je mit Einfluss und Interesse (1–5),
 * Haltung und Kategorie. Der Quadrant der Einfluss-Interesse-Matrix ist
 * abgeleitet und wird nicht gespeichert. Ohne DOM, ohne i18n.
 *
 * Gespeichert: `{ _schema, stakeholders }`. Haltung und Kategorie sind Text:
 * importierte Projekte tragen auch Werte außerhalb der Wertemengen
 * (`resistor`, `Sponsor`), die bleiben; die Kommandos schreiben nur Werte aus
 * den Wertemengen. Dass ids nichtleer und eindeutig sind, sichert die
 * Invariante `uniqueIds`.
 */
import {
  defineModel, command, list, object, number, text, idOf, oneOf,
} from '../../../core/model.js';
import { requireForm } from '../../../core/validate.js';
import { uid } from '../../../core/uid.js';
import { from0, from1_0 } from './migrations.js';
import {
  SUPPORT_VALUES, CATEGORY_VALUES, QUAD_ORDER, quadrantOf,
} from './quadrant.js';

export { SUPPORT_VALUES, CATEGORY_VALUES, QUAD_ORDER };

/** Die Angaben eines Beteiligten neben der id. */
const ENTRY_KEYS = ['name', 'role', 'power', 'interest', 'support', 'category', 'notes'];

/**
 * True, wenn jede id nichtleer ist und nur einmal vorkommt.
 * @param {ReadonlyArray<{ id: string }>} items @returns {boolean}
 */
function validIds(items) {
  const ids = items.map((x) => x.id);
  return ids.every((id) => id !== '') && new Set(ids).size === ids.length;
}

/**
 * Der Beteiligte mit dieser id; eine unbekannte id lehnt ab (`param` `id`).
 * @param {{ stakeholders: import('./model.types.js').StateFields['stakeholders'] }} m
 * @param {string|undefined} id
 * @returns {import('./model.types.js').StateFields['stakeholders'][number]}
 */
function entryOf(m, id) {
  const s = m.stakeholders.find((x) => x.id === id);
  requireForm('id', id, s !== undefined, 'the id of a stakeholder');
  return /** @type {import('./model.types.js').StateFields['stakeholders'][number]} */ (s);
}

/**
 * Der Quadrant eines Beteiligten.
 *
 * @typedef {object} QuadrantEntry
 * @property {string} id  id of the stakeholder
 * @property {string} quadrant  manage-closely, keep-satisfied, keep-informed or monitor
 */

export const State = defineModel({
  version: '1.1',
  migrations: { '0→1.0': from0, '1.0→1.1': from1_0 },
  fields: {
    /** die Beteiligten in Anlegereihenfolge, je mit id, Name, Rolle, Einfluss, Interesse, Haltung, Kategorie und Notizen */
    stakeholders: list(object({
      id: text(),
      name: text(),
      role: text(),
      power: number({ integer: true, min: 1, max: 5, default: 3 }),
      interest: number({ integer: true, min: 1, max: 5, default: 3 }),
      support: text(),
      category: text(),
      notes: text(),
    }), { bulk: true, agentWrite: false }),
  },
  view: {},
  invariants: {
    uniqueIds: {
      fields: ['stakeholders'],
      test(m) { return validIds(m.stakeholders); },
      repair(m) {
        const seen = new Set();
        m._v.stakeholders = m._v.stakeholders.filter((s) => {
          if (s.id === '' || seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });
      },
    },
  },
  commands: {
    addStakeholder: command({
      params: {
        name: text({ trim: true, nonEmpty: true }),
        role: text({ trim: true, optional: true }),
        power: number({ integer: true, min: 1, max: 5, default: 3, optional: true }),
        interest: number({ integer: true, min: 1, max: 5, default: 3, optional: true }),
        support: oneOf(['supporter', 'neutral', 'critic'], { default: 'neutral', optional: true }),
        category: oneOf(['intern', 'extern', 'kunde', 'lieferant', 'behoerde'], { default: 'intern', optional: true }),
        notes: text({ trim: true, optional: true }),
      },
      returns: text(),
      run({ name, role = '', power = 3, interest = 3, support = 'neutral', category = 'intern', notes = '' }) {
        const id = `s${uid()}`;
        this.stakeholders.push({ id, name, role, power, interest, support, category, notes });
        return id;
      },
    }),
    updateStakeholder: command({
      params: {
        id: idOf('stakeholders'),
        name: text({ trim: true, nonEmpty: true, optional: true }),
        role: text({ trim: true, optional: true }),
        power: number({ integer: true, min: 1, max: 5, optional: true }),
        interest: number({ integer: true, min: 1, max: 5, optional: true }),
        support: oneOf(['supporter', 'neutral', 'critic'], { optional: true }),
        category: oneOf(['intern', 'extern', 'kunde', 'lieferant', 'behoerde'], { optional: true }),
        notes: text({ trim: true, optional: true }),
      },
      /** @type {import('./model.types.js').UpdateStakeholderCurrent} */
      current({ id }) {
        const s = entryOf(this, id);
        return {
          name: s.name,
          role: s.role,
          power: s.power,
          interest: s.interest,
          support: /** @type {any} */ (SUPPORT_VALUES.includes(s.support) ? s.support : 'neutral'),
          category: /** @type {any} */ (CATEGORY_VALUES.includes(s.category) ? s.category : 'intern'),
          notes: s.notes,
        };
      },
      run({ id, ...changes }) {
        const given = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined));
        requireForm('command', 'updateStakeholder', ENTRY_KEYS.some((k) => k in given),
          `an object with id and at least one of ${ENTRY_KEYS.join(', ')}`);
        Object.assign(entryOf(this, id), given);
      },
    }),
    removeStakeholder: command({
      params: { id: idOf('stakeholders') },
      /** @type {import('./model.types.js').RemoveStakeholderConfirm} */
      confirm({ id }) {
        return { key: 'confirm.removeStakeholder', params: { name: entryOf(this, id).name } };
      },
      run({ id }) {
        this.stakeholders.splice(this.stakeholders.findIndex((s) => s.id === id), 1);
      },
    }),
  },
  derived: {
    /**
     * Der Quadrant je Beteiligtem, in der Reihenfolge der Liste.
     *
     * @this {import('./model.types.js').StateModel}
     * @returns {QuadrantEntry[]}
     */
    quadrants() {
      return this.stakeholders.map((s) => ({ id: s.id, quadrant: quadrantOf(s) }));
    },
  },
  derivedBulk: ['quadrants'],
});
