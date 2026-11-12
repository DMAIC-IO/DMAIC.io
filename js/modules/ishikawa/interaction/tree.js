/**
 * D.Mike — Ishikawa: Ursachen im Baum umsortieren (Geste reorder).
 *
 * Eine abgeschlossene Gruppe über die sichtbaren Zeilen (`data-reorder-group`,
 * `data-reorder-closed`), jede Zeile mit `data-reorder-index` und `data-id`.
 * Gezogen wird die Zeile mit ihrem Teilbaum; das Kommando heißt „vor Zeile X“,
 * die Zeile übernimmt dabei den Elternknoten von X.
 *
 * Zeiger: der Endindex wird zur Zielzeile in der Liste ohne die gezogene
 * Zeile, höchstens die letzte Zeile (hinter die letzte Zeile geht nicht). Ein
 * Ziel im eigenen Teilbaum ergibt kein Kommando.
 *
 * Tastatur: ↑/↓ bleibt unter den Geschwistern — ↑ vor die vorige
 * Geschwisterzeile, ↓ hinter die nächste samt deren Teilbaum. Hinter der
 * letzten Geschwisterzeile ist `beforeId` `null` (Elternknoten bleibt).
 *
 * Position `{ group, index, id, beforeId }`: `id` ist die gezogene Zeile,
 * `beforeId` die Zielzeile (`null` hinter der letzten Geschwisterzeile, die
 * eigene id am Ausgangsplatz). Der Host liefert die Zeilen über `this.model.rows`.
 */
import { defineGesture } from '../../../core/interaction/define.js';
import { reorder } from '../../../core/interaction/gestures/reorder.js';
import { subtreeIds, siblingsOf } from '../domain/tree.js';
import { groupIds, startAt } from './rows.js';

/**
 * Sichtbarer Index der Einfügestelle in der Liste ohne die gezogene Zeile.
 * @param {number[]} rest sichtbare ids ohne die gezogene Zeile
 * @param {object[]} rows Zeilen des Models
 * @param {number|null} beforeId Zielzeile
 * @param {number} lastSibling letzte Geschwisterzeile (für `beforeId` `null`)
 * @returns {number}
 */
function indexOf(rest, rows, beforeId, lastSibling) {
  if (beforeId !== null) return rest.indexOf(beforeId);
  const sub = new Set(subtreeIds(rows, lastSibling));
  let k = rest.indexOf(lastSibling) + 1;
  while (k < rest.length && sub.has(rest[k])) k++;
  return k;
}

/**
 * @param {{ handle: string }} opts
 * @returns {Readonly<object>} Geste aus `defineGesture`
 */
export function treeGesture({ handle }) {
  return defineGesture({
    kind: 'reorder',
    axis: 'y',
    handle,

    start: startAt,

    /**
     * ↑/↓ zur vorigen bzw. hinter die nächste Geschwisterzeile; → und ← nichts.
     * @param {{ group: string, index: number, id: number, beforeId: number|null }} pos
     * @param {{ x: number, y: number }} dir @param {object} ctx @param {{ index: number, id: number }} from
     */
    step(pos, dir, ctx, from) {
      if (!dir.y) return null;
      const rows = this.model.rows;
      const siblings = siblingsOf(rows, from.id);
      const home = siblings.indexOf(from.id);
      const others = siblings.filter((id) => id !== from.id);
      let slot = home;
      if (pos.beforeId === null) slot = others.length;
      else if (pos.beforeId !== from.id) slot = others.indexOf(pos.beforeId);
      if (slot < 0) return null;
      const next = slot + dir.y;
      if (next < 0 || next > others.length) return null;
      if (next === home) return from;
      const beforeId = next < others.length ? others[next] : null;
      const rest = groupIds(ctx.root, from.group).filter((id) => id !== from.id);
      return { group: from.group, index: indexOf(rest, rows, beforeId, others[others.length - 1]), id: from.id, beforeId };
    },

    /**
     * Tastaturpositionen (mit `beforeId`) bleiben; Zeigerpositionen werden zur
     * Zielzeile, höchstens die letzte Zeile. Ziel im eigenen Teilbaum → `null`.
     * @param {{ group: string, index: number, beforeId?: number|null }} pos @param {object} ctx
     * @param {{ group: string, index: number, id: number }} from
     */
    clamp(pos, ctx, from) {
      const p = reorder.clamp(pos, ctx, from);
      if (!p) return null;
      if (pos.beforeId !== undefined) return { ...p, id: from.id, beforeId: pos.beforeId };
      if (p.index === from.index) return from;
      const rest = groupIds(ctx.root, p.group).filter((id) => id !== from.id);
      if (!rest.length) return null;
      const index = Math.min(p.index, rest.length - 1);
      const beforeId = rest[index];
      if (subtreeIds(this.model.rows, from.id).includes(beforeId)) return null;
      return { group: p.group, index, id: from.id, beforeId };
    },

    /** @param {{ index: number, id: number }|null} pos Vorschau, `null` räumt auf; der Teilbaum als Block */
    preview(pos) {
      this.state.dragPreview = pos
        ? { kind: 'tree', index: pos.index, ids: [pos.id, ...subtreeIds(this.model.rows, pos.id)] }
        : null;
    },

    toCommand(from, to) {
      return ['moveRowBefore', { rowId: from.id, targetRowId: to.beforeId }];
    },
  });
}
