/**
 * D.Mike — VoC → CTx-Baum: Geschwisterknoten umsortieren (Geste reorder).
 *
 * Je Geschwisterliste eine abgeschlossene Gruppe (`data-reorder-group` mit
 * `data-reorder-closed`): die Bedürfnisse einer Stimme, die Treiber eines
 * Bedürfnisses, die Anforderungen eines Treibers. Jedes Element trägt
 * `data-reorder-index` und `data-id`; gezogen wird am Abzeichen (`.vct__drag-handle`; das Abzeichen der Stimme ist keins). Die
 * Gruppen liegen ineinander (die Treiber eines Bedürfnisses stehen im
 * Element des Bedürfnisses). Darum sucht `locate` nur in der Ausgangsgruppe:
 * die Vorgabe nähme die erste Gruppe unter dem Zeiger, also die äußere.
 *
 * Die Position trägt neben `{ group, index }` die Art, die Elternkette und
 * die ids der Geschwister in Anzeigereihenfolge; das Kommando bekommt die id
 * des Geschwisters am Endindex („an die Stelle von“). Tastatur, Ansage,
 * Abbruch und Ablehnung liefert der Kern (core/interaction/).
 */
import { defineGesture } from '../../../core/interaction/define.js';
import { reorder, groupsOf, itemsOf } from '../../../core/interaction/gestures/reorder.js';

/**
 * @typedef {object} SiblingPos
 * @property {string} group Schlüssel der Geschwisterliste
 * @property {number} index Endindex
 * @property {'need'|'driver'|'req'} kind Ebene
 * @property {string} id id des gezogenen Knotens
 * @property {string} vocId
 * @property {string} [needId]
 * @property {string} [drvId]
 * @property {string[]} ids ids der Geschwister in Anzeigereihenfolge
 */

/**
 * Die Gruppe mit diesem Schlüssel.
 * @param {Element} root @param {string} key @returns {HTMLElement|null}
 */
function groupOf(root, key) {
  return groupsOf(root).find((g) => g.dataset.reorderGroup === key) ?? null;
}

/**
 * Position am Abzeichen: Gruppe, Index, Art und Elternkette des Knotens, ids
 * der Geschwister.
 * @param {HTMLElement} el Griff @returns {SiblingPos}
 */
export function startAt(el) {
  const item = /** @type {HTMLElement} */ (el.closest('[data-id]'));
  const node = /** @type {HTMLElement} */ (el.closest('[data-drag-type]'));
  const base = reorder.start(el);
  const group = /** @type {HTMLElement} */ (el.closest('[data-reorder-group]'));
  /** @type {SiblingPos} */
  const pos = {
    ...base,
    kind: /** @type {'need'|'driver'|'req'} */ (node.dataset.dragType),
    id: item.dataset.id,
    vocId: node.dataset.vocId,
    ids: itemsOf(group).map((x) => x.dataset.id),
  };
  if (pos.kind !== 'need') pos.needId = node.dataset.needId;
  if (pos.kind === 'req') pos.drvId = node.dataset.drvId;
  return pos;
}

export const siblingsGesture = defineGesture({
  kind: 'reorder',
  axis: 'y',
  handle: '.vct__drag-handle',

  start: startAt,

  /**
   * Nur in der Ausgangsgruppe: außerhalb ihrer Fläche keine Position.
   * @param {{ x: number, y: number }} point @param {any} ctx @param {SiblingPos} from
   * @returns {{ group: string, index: number }|null}
   */
  locate(point, ctx, from) {
    const group = groupOf(ctx.root, from.group);
    if (!group) return null;
    const r = group.getBoundingClientRect();
    if (point.x < r.left || point.x >= r.right || point.y < r.top || point.y >= r.bottom) return null;
    const at = ctx.listIndexAt(itemsOf(group), point);
    return { group: from.group, index: at > from.index ? at - 1 : at };
  },

  /**
   * Bereich wie `reorder`; am Ausgangsplatz die Startposition selbst (der
   * Kern erkennt „nicht bewegt“ und schickt kein Kommando), sonst die
   * Startposition mit dem neuen Index.
   * @param {{ group: string, index: number }} pos @param {any} ctx @param {SiblingPos} from
   * @returns {SiblingPos|null}
   */
  clamp(pos, ctx, from) {
    const p = reorder.clamp(pos, ctx, from);
    if (!p || p.group !== from.group) return null;
    return p.index === from.index ? from : { ...from, index: p.index };
  },

  /**
   * Vorschau: der Geschwisterknoten, an dessen Stelle der gezogene rückt.
   * @param {SiblingPos|null} pos `null` räumt auf
   */
  preview(pos) {
    const targetId = pos ? pos.ids[pos.index] : null;
    this.state.dropTarget = targetId && targetId !== pos.id ? targetId : null;
  },

  /**
   * @param {SiblingPos} from @param {SiblingPos} to
   * @returns {[string, object]}
   */
  toCommand(from, to) {
    const args = { kind: from.kind, vocId: from.vocId, fromId: from.id, toId: from.ids[to.index] };
    if (from.needId !== undefined) args.needId = from.needId;
    if (from.drvId !== undefined) args.drvId = from.drvId;
    return ['reorderNodes', args];
  },
});
