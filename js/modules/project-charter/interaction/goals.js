/**
 * D.Mike — Project charter: Ziele umsortieren (Geste reorder).
 *
 * Eine abgeschlossene Gruppe (`data-reorder-group` mit `data-reorder-closed`),
 * darin jede Zeile mit `data-reorder-index` und `data-id`. Die Position trägt
 * neben `{ group, index }` die id der gezogenen Zeile und `beforeId`: die Zeile,
 * vor der sie landet (`null` am Ende; die eigene id am Ausgangsplatz).
 */
import { defineGesture } from '../../../core/interaction/define.js';
import { reorder, groupsOf, itemsOf } from '../../../core/interaction/gestures/reorder.js';

/**
 * @param {{ handle: string }} opts
 * @returns {Readonly<object>} Geste aus `defineGesture`
 */
export function goalRowGesture({ handle }) {
  return defineGesture({
    kind: 'reorder',
    axis: 'y',
    handle,

    /** @param {HTMLElement} el Griff @returns {{ group: string, index: number, id: string, beforeId: string }} */
    start(el) {
      const id = /** @type {HTMLElement} */ (el.closest('[data-id]')).dataset.id;
      return { ...reorder.start(el), id, beforeId: id };
    },

    /**
     * Begrenzt wie `reorder.clamp`; dazu die Zeile am Endindex in der Liste
     * ohne die gezogene Zeile.
     * @param {{ group: string, index: number }} pos @param {{ root: Element }} ctx
     * @param {{ group: string, index: number, id: string }} from
     * @returns {{ group: string, index: number, id: string, beforeId: string|null }|null}
     */
    clamp(pos, ctx, from) {
      const p = reorder.clamp(pos, ctx, from);
      if (!p) return null;
      if (p.index === from.index) return from;
      const group = groupsOf(ctx.root).find((g) => g.dataset.reorderGroup === String(p.group));
      const rest = (group ? itemsOf(group) : []).map((el) => el.dataset.id).filter((id) => id !== from.id);
      return { ...p, id: from.id, beforeId: rest[p.index] ?? null };
    },

    /** Die Zielmarke der Gruppe setzt der Gestenkern; kein eigener Zustand. */
    preview() {},

    toCommand(from, to) {
      return ['moveGoal', { id: from.id, beforeId: to.beforeId }];
    },
  });
}
