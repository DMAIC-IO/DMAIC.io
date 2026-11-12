/**
 * Vorgaben für kind 'reorder' (Spec C §5). Position `{ group, index }`;
 * `index` ist der Endindex nach dem Verschieben. Markup-Vertrag: jede Gruppe
 * trägt `data-reorder-group` (und optional `data-reorder-group-label`),
 * jedes Element darin `data-reorder-index`. Eine Gruppe mit `data-reorder-closed`
 * nimmt keine fremden Elemente auf und gibt keine ab.
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

/**
 * Ist die Gruppe abgeschlossen (`data-reorder-closed`)?
 * @param {Element} group @returns {boolean}
 */
export function isClosed(group) {
  return group.hasAttribute('data-reorder-closed');
}

/** Darf ein Element von Gruppe `a` nach Gruppe `b` wechseln? */
function mayCross(root, a, b) {
  if (a === b) return true;
  const ga = groupByKey(root, a);
  const gb = groupByKey(root, b);
  return !(ga && isClosed(ga)) && !(gb && isClosed(gb));
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
    if (!mayCross(ctx.root, from.group, key)) return null;
    const at = listIndexAt(itemsOf(group), point, ctx.axis);
    return { group: key, index: key === from.group && at > from.index ? at - 1 : at };
  },

  /**
   * Entlang `ctx.axis` (Vorgabe `'y'`) Index ±1, quer dazu Nachbargruppe in
   * DOM-Reihenfolge (Index bleibt, `clamp` begrenzt); abgeschlossene Gruppen ergeben `null`.
   * @param {{ group: string, index: number }} pos @param {{ x: number, y: number }} dir @param {object} ctx
   * @returns {{ group: string, index: number }|null}
   */
  step(pos, dir, ctx) {
    const along = ctx.axis === 'x' ? dir.x : dir.y;
    const across = ctx.axis === 'x' ? dir.y : dir.x;
    if (along) return { group: pos.group, index: pos.index + along };
    if (!across) return null;
    const keys = groupsOf(ctx.root).map((g) => g.dataset.reorderGroup);
    const i = keys.indexOf(pos.group) + across;
    if (i < 0 || i >= keys.length || !mayCross(ctx.root, pos.group, keys[i])) return null;
    return { group: keys[i], index: pos.index };
  },

  /**
   * @param {{ group: string, index: number }} pos @param {object} ctx @param {{ group: string }} from
   * @returns {{ group: string, index: number }|null}
   */
  clamp(pos, ctx, from) {
    if (!mayCross(ctx.root, from.group, pos.group)) return null;
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
