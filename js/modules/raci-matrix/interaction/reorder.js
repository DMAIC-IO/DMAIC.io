/**
 * D.Mike — RACI-Matrix: Aktivitäten umsortieren (Geste reorder).
 *
 * Eine Gruppe `activities` (`tbody` mit `data-reorder-group` und
 * `data-reorder-closed`), darin jede Zeile mit `data-reorder-index` und
 * `data-id`. Gezogen wird nur am Griff `.raci__grip`. Die Position trägt neben
 * `{ group, index }` die id der gezogenen Zeile; das Kommando bekommt sie und
 * den Endindex ohne Umrechnung. Tastatur, Ansage, Abbruch und Ablehnung
 * liefert der Kern (core/interaction/).
 */
import { defineGesture } from '../../../core/interaction/define.js';
import { reorder as baseReorder } from '../../../core/interaction/gestures/reorder.js';

export const reorder = defineGesture({
  kind: 'reorder',
  axis: 'y',
  handle: '.raci__grip',

  /**
   * Position am Griff: Gruppe, Index und id der Zeile.
   * @param {HTMLElement} el Griff @returns {{ group: string, index: number, id: string }}
   */
  start(el) {
    const id = /** @type {HTMLElement} */ (el.closest('[data-id]')).dataset.id;
    return { ...baseReorder.start(el), id };
  },

  /** @param {{ group: string, index: number }|null} pos Vorschau, null = aufräumen */
  preview(pos) {
    this.state.dropPreview = pos ? { group: pos.group, index: pos.index } : null;
  },

  /**
   * @param {{ group: string, index: number, id: string }} from
   * @param {{ group: string, index: number }} to
   * @returns {[string, object]}
   */
  toCommand(from, to) {
    return ['moveActivity', { activityId: from.id, to: to.index }];
  },
});
