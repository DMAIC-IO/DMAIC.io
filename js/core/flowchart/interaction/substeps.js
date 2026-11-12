/**
 * D.Mike — Flowchart: Unterschritte umsortieren (Geste reorder).
 *
 * Eine Gruppe je Schritt (`data-reorder-group` = Schritt-id), darin die Unterschritte
 * mit `data-reorder-index` und `data-substep-id`. Verschoben wird nur innerhalb des
 * eigenen Schritts: die Gruppe trägt `data-reorder-closed`, ein Ziel in einem
 * anderen Schritt ergibt also kein Kommando. Die Position trägt neben `{ group, index }` die id
 * des gezogenen Unterschritts für das Kommando.
 */
import { defineGesture } from '../../interaction/define.js';
import { reorder } from '../../interaction/gestures/reorder.js';

/**
 * @param {{ handle: string }} opts
 * @returns {Readonly<object>} Geste aus `defineGesture`
 */
export function substepGesture({ handle }) {
  return defineGesture({
    kind: 'reorder',
    axis: 'y',
    handle,

    /** @param {HTMLElement} el Griff @returns {{ group: string, index: number, id: string }} */
    start(el) {
      const item = /** @type {HTMLElement} */ (el.closest('[data-substep-id]'));
      return { ...reorder.start(el), id: item.dataset.substepId };
    },

    /**
     * Begrenzt wie `reorder.clamp` und trägt die id des gezogenen Unterschritts
     * weiter — `substepItemClass` braucht sie für die Zielmarke.
     * @param {{ group: string, index: number }} pos @param {object} ctx @param {{ group: string, index: number, id: string }} from
     * @returns {{ group: string, index: number, id: string }|null}
     */
    clamp(pos, ctx, from) {
      const out = reorder.clamp(pos, ctx, from);
      return out && { ...out, id: from.id };
    },

    /** @param {{ group: string, index: number, id: string }|null} pos Vorschau, `null` räumt auf */
    preview(pos) {
      this.state.substepPreview = pos;
    },

    toCommand(from, to) {
      return ['moveSubstep', { stepId: from.group, substepId: from.id, index: to.index }];
    },
  });
}
