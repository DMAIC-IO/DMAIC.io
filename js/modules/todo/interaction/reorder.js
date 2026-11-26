/**
 * D.Mike — Aufgabenliste: Zeilen umsortieren (Geste reorder).
 *
 * Eine Gruppe `todos` (`tbody` mit `data-reorder-group` und
 * `data-reorder-closed`), darin jede angezeigte Zeile mit
 * `data-reorder-index` und `data-id`. Gezogen wird nur am Griff
 * `.todo__grip`. Die Position trägt die id der gezogenen Zeile und die
 * angezeigte Folge beim Start; das Kommando bekommt beides und den Endindex.
 * So wird eine gefilterte oder sortierte Liste in der Folge gespeichert, die
 * man sieht. Tastatur, Ansage, Abbruch und Ablehnung liefert der Kern.
 */
import { defineGesture } from '../../../core/interaction/define.js';
import { reorder as baseReorder } from '../../../core/interaction/gestures/reorder.js';

export const reorder = defineGesture({
  kind: 'reorder',
  axis: 'y',
  handle: '.todo__grip',

  /**
   * Position am Griff: Gruppe, Index, id der Zeile und angezeigte Folge.
   * @param {HTMLElement} el Griff
   * @returns {{ group: string, index: number, id: string, shownIds: string[] }}
   */
  start(el) {
    const row = /** @type {HTMLElement} */ (el.closest('[data-id]'));
    const group = /** @type {HTMLElement} */ (row.closest('[data-reorder-group]'));
    const shownIds = Array.from(group.querySelectorAll(':scope > [data-id]')).map((r) => /** @type {HTMLElement} */ (r).dataset.id ?? '');
    return { ...baseReorder.start(el), id: row.dataset.id ?? '', shownIds };
  },

  /**
   * Bereich wie `reorder`; am Ausgangsplatz die Startposition selbst, damit
   * der Kern „nicht bewegt“ erkennt und kein Kommando schickt.
   * @param {{ group: string, index: number }} pos @param {object} ctx
   * @param {{ group: string, index: number, id: string, shownIds: string[] }} from
   * @returns {{ group: string, index: number }|null}
   */
  clamp(pos, ctx, from) {
    const p = baseReorder.clamp(pos, ctx, from);
    if (!p) return null;
    return p.group === from.group && p.index === from.index ? from : p;
  },

  /** @param {{ group: string, index: number }|null} pos Vorschau, null = aufräumen */
  preview(pos) {
    this.state.dropPreview = pos ? { group: 'todos', index: pos.index } : null;
  },

  /**
   * @param {{ group: string, index: number, id: string, shownIds: string[] }} from
   * @param {{ group: string, index: number }} to
   * @returns {[string, object]}
   */
  toCommand(from, to) {
    return ['moveTodo', { itemId: from.id, to: to.index, shownIds: from.shownIds }];
  },
});
