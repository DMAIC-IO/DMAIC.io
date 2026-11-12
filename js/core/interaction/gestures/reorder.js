/**
 * Vorgaben für kind 'reorder' (Spec C §5). Position `{ group, index }`;
 * `index` ist der Endindex nach dem Verschieben. Markup-Vertrag: jede Gruppe
 * trägt `data-reorder-group` (und optional `data-reorder-group-label`),
 * jedes Element darin `data-reorder-index`.
 */
import { inside, listIndexAt } from '../helpers.js';

/**
 * Gruppen des Containers in DOM-Reihenfolge.
 * @param {Element} root @returns {HTMLElement[]}
 */
export function groupsOf(root) {
  return [...root.querySelectorAll('[data-reorder-group]')];
}

/**
 * Elemente einer Gruppe, ohne die verschachtelter Gruppen.
 * @param {Element} group @returns {HTMLElement[]}
 */
export function itemsOf(group) {
  return [...group.querySelectorAll('[data-reorder-index]')].filter((el) => el.closest('[data-reorder-group]') === group);
}

/** @param {Element} root @param {string} key @returns {HTMLElement|null} */
function groupByKey(root, key) {
  return groupsOf(root).find((g) => g.dataset.reorderGroup === String(key)) ?? null;
}

/**
 * Höchster Endindex in einer Gruppe: eigene `länge − 1`, fremde `länge`.
 * @param {Element} root @param {string} key @param {{ group: string }} from
 * @returns {number} −1, wenn die Gruppe fehlt
 */
export function maxIndex(root, key, from) {
  const group = groupByKey(root, key);
  if (!group) return -1;
  const n = itemsOf(group).length;
  return key === from.group ? n - 1 : n;
}

export const reorder = Object.freeze({
  axis: 'y',

  /** @param {Element} el Griff @returns {{ group: string, index: number }} */
  start(el) {
    return { group: el.closest('[data-reorder-group]').dataset.reorderGroup, index: Number(el.closest('[data-reorder-index]').dataset.reorderIndex) };
  },

  /**
   * @param {{ x: number, y: number }} point @param {object} ctx @param {{ group: string, index: number }} from
   * @returns {{ group: string, index: number }|null}
   */
  locate(point, ctx, from) {
    const group = groupsOf(ctx.root).find((g) => inside(g.getBoundingClientRect(), point));
    if (!group) return null;
    const key = group.dataset.reorderGroup;
    const at = listIndexAt(itemsOf(group), point, ctx.axis);
    return { group: key, index: key === from.group && at > from.index ? at - 1 : at };
  },

  /**
   * ↑↓ Index ±1, ←→ Nachbargruppe in DOM-Reihenfolge (Index bleibt, `clamp` begrenzt).
   * @param {{ group: string, index: number }} pos @param {{ x: number, y: number }} dir @param {object} ctx
   * @returns {{ group: string, index: number }|null}
   */
  step(pos, dir, ctx) {
    if (dir.y) return { group: pos.group, index: pos.index + dir.y };
    if (!dir.x) return null;
    const keys = groupsOf(ctx.root).map((g) => g.dataset.reorderGroup);
    const i = keys.indexOf(pos.group) + dir.x;
    return i >= 0 && i < keys.length ? { group: keys[i], index: pos.index } : null;
  },

  /**
   * @param {{ group: string, index: number }} pos @param {object} ctx @param {{ group: string }} from
   * @returns {{ group: string, index: number }|null}
   */
  clamp(pos, ctx, from) {
    const max = maxIndex(ctx.root, pos.group, from);
    if (max < 0) return null;
    return { group: pos.group, index: Math.max(0, Math.min(pos.index, max)) };
  },

  /**
   * „Position {pos} von {total}“, beim Gruppenwechsel mit `data-reorder-group-label`.
   * @param {{ group: string, index: number }} pos @param {(key: string, params?: object) => string} t
   * @param {object} ctx @param {{ group: string }} from @returns {string}
   */
  announce(pos, t, ctx, from) {
    const total = maxIndex(ctx.root, pos.group, from) + 1;
    if (pos.group === from.group) return t('common.gesture.position', { pos: pos.index + 1, total });
    const label = groupByKey(ctx.root, pos.group)?.dataset.reorderGroupLabel ?? pos.group;
    return t('common.gesture.positionInGroup', { group: label, pos: pos.index + 1, total });
  },
});
