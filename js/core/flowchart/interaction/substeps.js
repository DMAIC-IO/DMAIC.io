/**
 * D.Mike — Flowchart: Unterschritte umsortieren (Geste reorder).
 *
 * Eine Gruppe je Schritt (`data-reorder-group` = Schritt-id), darin die Unterschritte
 * mit `data-reorder-index` und `data-substep-id`. Verschoben wird nur innerhalb des
 * eigenen Schritts: ein Ziel in einem anderen Schritt begrenzt `clamp` zu
 * `null` — kein Kommando. Die Position trägt neben `{ group, index }` die id
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

    clamp(pos, ctx, from) {
      if (pos.group !== from.group) return null;
      const out = reorder.clamp(pos, ctx, from);
      return out && { ...out, id: from.id };
    },

    /** @param {{ group: string, index: number }|null} pos Vorschau, `null` räumt auf */
    preview(pos) {
      this.state.substepPreview = pos;
    },

    toCommand(from, to) {
      return ['moveSubstep', { stepId: from.group, substepId: from.id, index: to.index }];
    },
  });
}
