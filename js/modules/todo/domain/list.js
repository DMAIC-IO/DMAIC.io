/**
 * D.Mike — Aufgabenliste: reine Funktionen über die Einträge.
 *
 * Status, Sortierspalten, Überfälligkeit, Zählung je Status, die nächsten
 * fälligen Aufgaben und die angezeigte Folge (Filter, Suche, Sortierung).
 * Ansicht und Kachel lesen daraus. Ohne DOM, ohne i18n.
 */
import { isIsoDate } from '../../../core/local-date.js';

/** Die vier Status in Listenreihenfolge (auch Sortierreihenfolge). */
export const STATUSES = Object.freeze(['open', 'in-progress', 'done', 'blocked']);

/** Die Spalten, nach denen die Liste sortiert werden kann. */
export const SORT_COLUMNS = Object.freeze(['text', 'owner', 'due', 'status']);

/**
 * @typedef {{ id: string, text: string, owner: string, due: string, status: string, cal: boolean }} TodoItem
 * @typedef {{ filterStatus: string, filterOwner: string, search: string, sortCol: string, sortAsc: boolean }} TodoView
 */

/**
 * Überfällig: nicht erledigt und ein gültiges Zieldatum vor `today`.
 * @param {Pick<TodoItem, 'status'|'due'>} item
 * @param {string} today `JJJJ-MM-TT`
 * @returns {boolean}
 */
export function isOverdue(item, today) {
  return item.status !== 'done' && isIsoDate(item.due) && item.due < today;
}

/**
 * Zahl der Einträge je Status.
 * @param {ReadonlyArray<Pick<TodoItem, 'status'>>} items
 * @returns {Record<string, number>}
 */
export function statusCounts(items) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const item of items) if (item.status in counts) counts[item.status] += 1;
  return counts;
}

/**
 * Die nächsten `n` nicht erledigten Einträge nach Zieldatum; ohne oder mit
 * unlesbarem Datum zuletzt, in gespeicherter Folge.
 * @template {Pick<TodoItem, 'status'|'due'>} T
 * @param {ReadonlyArray<T>} items
 * @param {number} n
 * @returns {T[]}
 */
export function nextDueItems(items, n) {
  const open = items.filter((i) => i.status !== 'done');
  const dated = open.filter((i) => isIsoDate(i.due)).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
  return [...dated, ...open.filter((i) => !isIsoDate(i.due))].slice(0, n);
}

/**
 * Die Verantwortlichen der Liste, ohne Leere und Doppelte, sortiert.
 * @param {ReadonlyArray<Pick<TodoItem, 'owner'>>} items
 * @returns {string[]}
 */
export function owners(items) {
  const set = new Set();
  for (const i of items) {
    const o = (i.owner || '').trim();
    if (o) set.add(o);
  }
  return [...set].sort();
}

/**
 * Der Sortierschlüssel einer Spalte; leeres Zieldatum zuletzt.
 * @param {TodoItem} item @param {string} col @returns {string|number}
 */
function sortKey(item, col) {
  switch (col) {
    case 'text': return item.text.toLowerCase();
    case 'owner': return (item.owner || '').toLowerCase();
    case 'due': return item.due || '9999';
    case 'status': return STATUSES.indexOf(item.status);
    default: return 0;
  }
}

/**
 * Die angezeigten Einträge: Statusfilter, Filter auf den Verantwortlichen,
 * Suche in Text und Verantwortlichem (ohne Groß-/Kleinschreibung), dann
 * sortiert. `manual` behält die gespeicherte Folge. Liefert dieselben
 * Objekte, keine Kopien.
 * @template {TodoItem} T
 * @param {ReadonlyArray<T>} items
 * @param {TodoView} view
 * @returns {T[]}
 */
export function visibleItems(items, view) {
  const q = (view.search || '').toLowerCase();
  const shown = items.filter((i) => {
    if (view.filterStatus !== 'all' && i.status !== view.filterStatus) return false;
    if (view.filterOwner !== 'all' && (i.owner || '').trim() !== view.filterOwner) return false;
    if (q && !i.text.toLowerCase().includes(q) && !(i.owner || '').toLowerCase().includes(q)) return false;
    return true;
  });
  if (!SORT_COLUMNS.includes(view.sortCol)) return shown;
  const dir = view.sortAsc ? 1 : -1;
  return shown.sort((a, b) => {
    const va = sortKey(a, view.sortCol);
    const vb = sortKey(b, view.sortCol);
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return 0;
  });
}
