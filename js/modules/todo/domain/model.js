/**
 * D.Mike — Aufgabenliste: Model.
 *
 * Die Aufgaben (`items`) sind Inhalt; Status- und Verantwortlichenfilter,
 * Suche und Sortierung sind Ansichtsfelder — gespeichert, aber nicht im
 * Lesezustand der Agentenfläche. `time` und `duration` eines Eintrags setzt
 * nur der Kalender (Beginn und Dauer des Aufgabentermins); fehlen sie, nimmt
 * er 09:00 und 30 Minuten. Ohne DOM, ohne i18n.
 *
 * Gespeichert: `{ _schema, items, filterStatus, filterOwner, search, sortCol,
 * sortAsc }`. Dass jede id nichtleer und eindeutig ist, sichert die
 * Invariante `itemIds` — beim Laden repariert, beim Schreiben abgelehnt.
 * `moveTodo.to` ist der ENDINDEX.
 */
import { defineModel, command, list, object, text, oneOf, boolean, number, time, date, idOf, index } from '../../../core/model.js';
import { uid } from '../../../core/uid.js';
import { requireForm } from '../../../core/validate.js';
import { from0, fillItemIds } from './migrations.js';

export { STATUSES, SORT_COLUMNS } from './list.js';

/**
 * Der Eintrag zu einer id; `idOf` hat sie schon geprüft.
 * @param {{ items: Array<{ id: string }> }} m @param {string} id
 * @returns {any}
 */
const itemOf = (m, id) => m.items.find((i) => i.id === id);

export const State = defineModel({
  version: '1.0',
  migrations: { '0→1.0': from0 },
  fields: {
    /** die Aufgaben in gespeicherter Reihenfolge */
    items: list(object({
      id: text(),
      text: text(),
      owner: text(),
      due: text(),
      status: oneOf(['open', 'in-progress', 'done', 'blocked']),
      cal: boolean(),
      time: time({ step: 5, optional: true }),
      duration: number({ integer: true, min: 5, optional: true }),
    }), { bulk: true }),
  },
  view: {
    filterStatus: oneOf(['all', 'open', 'in-progress', 'done', 'blocked']),
    filterOwner: text({ default: 'all' }),
    search: text(),
    sortCol: oneOf(['text', 'owner', 'due', 'status', 'manual'], { default: 'due' }),
    sortAsc: boolean({ default: true }),
  },
  invariants: {
    itemIds: {
      fields: ['items'],
      test(m) {
        const ids = m.items.map((i) => i.id);
        return ids.every((id) => id !== '') && new Set(ids).size === ids.length;
      },
      repair(m) { fillItemIds(m._v.items); },
    },
  },
  commands: {
    addTodo: command({
      returns: text(),
      run() {
        const id = uid();
        this.items.push({ id, text: '', owner: '', due: '', status: 'open', cal: false });
        return id;
      },
    }),
    setTodoText: command({
      params: { itemId: idOf('items'), text: text() },
      run({ itemId, text: value }) { itemOf(this, itemId).text = value; },
    }),
    setTodoOwner: command({
      params: { itemId: idOf('items'), owner: text() },
      run({ itemId, owner }) { itemOf(this, itemId).owner = owner; },
    }),
    setTodoDue: command({
      params: { itemId: idOf('items'), isoDate: date({ empty: true }) },
      run({ itemId, isoDate }) { itemOf(this, itemId).due = isoDate; },
    }),
    setTodoStatus: command({
      params: { itemId: idOf('items'), status: oneOf(['open', 'in-progress', 'done', 'blocked']) },
      run({ itemId, status }) { itemOf(this, itemId).status = status; },
    }),
    setTodoCalendar: command({
      params: { itemId: idOf('items'), inCalendar: boolean() },
      run({ itemId, inCalendar }) { itemOf(this, itemId).cal = inCalendar; },
    }),
    removeTodo: command({
      params: { itemId: idOf('items') },
      run({ itemId }) {
        this.items.splice(this.items.findIndex((i) => i.id === itemId), 1);
      },
    }),
    moveTodo: command({
      params: {
        itemId: idOf('items'),
        to: index('items', { afterRemovalFrom: 'items' }),
        shownIds: list(text(), { optional: true }),
      },
      run({ itemId, to, shownIds }) {
        // Mit `shownIds` (die angezeigte Folge) wird sie zuerst die
        // gespeicherte; Ausgeblendete folgen in ihrer bisherigen Folge.
        let order = this.items.slice();
        if (shownIds) {
          const byId = new Map(order.map((i) => [i.id, i]));
          const shown = [...new Set(shownIds)].filter((id) => byId.has(id)).map((id) => byId.get(id));
          requireForm('to', to, to < Math.max(shown.length, 1), 'a position among the shown tasks');
          const shownSet = new Set(shown);
          order = [...shown, ...order.filter((i) => !shownSet.has(i))];
        }
        const from = order.findIndex((i) => i.id === itemId);
        if (from === to) return;
        const [moved] = order.splice(from, 1);
        order.splice(to, 0, moved);
        this.items = order;
        this.sortCol = 'manual';
      },
    }),
    // Spaltenkopf: dieselbe Spalte dreht die Richtung, eine andere beginnt
    // aufsteigend. Nur Ansicht; nicht im Agentenkatalog.
    sortBy: command({
      params: { column: oneOf(['text', 'owner', 'due', 'status'], { agentWrite: false }) },
      run({ column }) {
        if (this.sortCol === column) {
          this.sortAsc = !this.sortAsc;
        } else {
          this.sortCol = column;
          this.sortAsc = true;
        }
      },
    }),
    updateTodo: command({
      params: {
        itemId: idOf('items'),
        text: text({ optional: true }),
        due: date({ empty: true, optional: true }),
        time: time({ step: 5, optional: true }),
        duration: number({ integer: true, min: 5, optional: true }),
      },
      run({ itemId, ...changes }) {
        Object.assign(itemOf(this, itemId), changes);
      },
    }),
  },
});
