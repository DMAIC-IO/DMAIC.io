/**
 * D.Mike — Aufgabenliste: Migrationen des gespeicherten Zustands.
 *
 * Reine Funktionen; jede beschreibt einen FESTEN Formatstand und importiert
 * darum nichts aus model.js.
 */
import { isIsoDate } from '../../../core/local-date.js';

/** Die vier Status im Formatstand 1.0. */
const STATUSES_1_0 = ['open', 'in-progress', 'done', 'blocked'];
/** Die Sortierwerte im Formatstand 1.0 (`manual` setzt nur das Umsortieren). */
const SORT_1_0 = ['text', 'owner', 'due', 'status', 'manual'];

/** @param {unknown} v @returns {string} der Text oder leer */
const textOr = (v) => (typeof v === 'string' ? v : '');

/**
 * Ein Zieldatum wie `TT.MM.JJJJ` (auch einstellige Tage und Monate) wird
 * `JJJJ-MM-TT`, wenn es ein gültiges Datum ergibt; alles andere bleibt.
 * @param {unknown} v @returns {string}
 */
function dueOf(v) {
  const s = textOr(v);
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s.trim());
  if (!m) return s;
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : s;
}

/**
 * Leere und doppelte ids bekommen einen Ersatz aus der Position
 * (`t1`, `t2`, …), bei Kollision mit angehängtem `_`; vorhandene ids
 * bleiben, auch die erste von zwei gleichen.
 * @template {{ id: string }} T
 * @param {T[]} items @returns {T[]} dieselben Objekte, ids ergänzt
 */
export function fillItemIds(items) {
  const taken = new Set(items.map((x) => x.id).filter((id) => id !== ''));
  const seen = new Set();
  items.forEach((x, i) => {
    if (x.id !== '' && !seen.has(x.id)) {
      seen.add(x.id);
      return;
    }
    let id = `t${i + 1}`;
    while (taken.has(id)) id = `${id}_`;
    taken.add(id);
    seen.add(id);
    x.id = id;
  });
  return items;
}

/**
 * Ein Eintrag wie das alte `Item.fromJSON`: Nicht-Texte werden leer, ein
 * fremder Status `open`, `cal` nur bei `true`. Fehlende id bleibt leer und
 * bekommt danach einen Ersatz aus der Position.
 * @param {unknown} v
 * @returns {{ id: string, text: string, owner: string, due: string, status: string, cal: boolean }}
 */
function itemOf(v) {
  const o = /** @type {Record<string, any>} */ (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  return {
    id: textOr(o.id),
    text: textOr(o.text),
    owner: textOr(o.owner),
    due: dueOf(o.due),
    status: STATUSES_1_0.includes(o.status) ? o.status : 'open',
    cal: o.cal === true,
  };
}

/**
 * '0→1.0': Stände ohne `_schema` (alte Exporte, Beispieldateien). Wie das
 * alte `State.fromJSON`: jeder Listeneintrag wird ein Eintrag, Filter und
 * Sortierung nur aus ihren Wertemengen, sonst die Vorgabe. `due` im Muster
 * `TT.MM.JJJJ` wird ISO, jeder andere Text bleibt. Fremde Schlüssel
 * entfallen.
 * @param {unknown} old gespeicherter Zustand der Altform
 * @returns {{ items: object[], filterStatus: string, filterOwner: string, search: string, sortCol: string, sortAsc: boolean }}
 */
export function from0(old) {
  const o = /** @type {Record<string, any>} */ (old && typeof old === 'object' && !Array.isArray(old) ? old : {});
  const items = Array.isArray(o.items) ? fillItemIds(o.items.map(itemOf)) : [];
  return {
    items,
    filterStatus: o.filterStatus === 'all' || STATUSES_1_0.includes(o.filterStatus) ? o.filterStatus : 'all',
    filterOwner: typeof o.filterOwner === 'string' ? o.filterOwner : 'all',
    search: textOr(o.search),
    sortCol: SORT_1_0.includes(o.sortCol) ? o.sortCol : 'due',
    sortAsc: typeof o.sortAsc === 'boolean' ? o.sortAsc : true,
  };
}
