/**
 * D.Mike — Ishikawa: Fakten und Experimente umsortieren (Geste reorder).
 *
 * Eine Gruppe je Tabelle (`tbody` mit `data-reorder-group` und
 * `data-reorder-closed`), darin jede Zeile mit `data-reorder-index` und
 * `data-id`. Die Position trägt neben `{ group, index }` die id der
 * gezogenen Zeile und `beforeId`: die Zeile, vor der sie landet (`null` am
 * Ende; die eigene id am Ausgangsplatz). Das Kommando ist „vor Zeile X“ wie
 * die Agentenaktion.
 */
import { defineGesture } from '../../../core/interaction/define.js';
import { reorder, groupsOf, itemsOf } from '../../../core/interaction/gestures/reorder.js';

/** Kommando → Art der Vorschau und Parameternamen der Agentenaktion. */
const COMMANDS = Object.freeze({
  moveFactBefore: Object.freeze({ kind: 'facts', id: 'factId', target: 'targetFactId' }),
  moveExperimentBefore: Object.freeze({ kind: 'experiments', id: 'experimentId', target: 'targetExperimentId' }),
});

/**
 * ids der Zeilen einer Gruppe in DOM-Reihenfolge.
 * @param {Element} root Container @param {string} key `data-reorder-group`
 * @returns {number[]} `[]`, wenn die Gruppe fehlt
 */
export function groupIds(root, key) {
  const group = groupsOf(root).find((g) => g.dataset.reorderGroup === String(key));
  return group ? itemsOf(group).map((el) => Number(el.dataset.id)) : [];
}

/**
 * Position am Griff: Gruppe, Index, id der Zeile; am Ausgangsplatz ist
 * `beforeId` die eigene id.
 * @param {HTMLElement} el Griff @returns {{ group: string, index: number, id: number, beforeId: number }}
 */
export function startAt(el) {
  const id = Number(/** @type {HTMLElement} */ (el.closest('[data-id]')).dataset.id);
  return { ...reorder.start(el), id, beforeId: id };
}

/**
 * @param {{ handle: string, command: 'moveFactBefore'|'moveExperimentBefore' }} opts
 * @returns {Readonly<object>} Geste aus `defineGesture`
 */
export function rowGesture({ handle, command }) {
  const spec = COMMANDS[command];
  if (!spec) throw new Error(`invalid command ${JSON.stringify(command)} of rowGesture; allowed: ${Object.keys(COMMANDS).join(', ')}`);
  return defineGesture({
    kind: 'reorder',
    axis: 'y',
    handle,

    start: startAt,

    /**
     * Gruppe und Bereich wie `reorder`; dazu die Zeile am Endindex in der
     * Liste ohne die gezogene Zeile.
     * @param {{ group: string, index: number }} pos @param {object} ctx @param {{ group: string, index: number, id: number, beforeId: number|null }} from
     * @returns {{ group: string, index: number, id: number, beforeId: number|null }|null}
     */
    clamp(pos, ctx, from) {
      const p = reorder.clamp(pos, ctx, from);
      if (!p) return null;
      if (p.index === from.index) return from;
      const rest = groupIds(ctx.root, p.group).filter((id) => id !== from.id);
      return { ...p, id: from.id, beforeId: rest[p.index] ?? null };
    },

    /** @param {{ index: number, id: number }|null} pos Vorschau, `null` räumt auf */
    preview(pos) {
      this.state.dragPreview = pos ? { kind: spec.kind, index: pos.index, ids: [pos.id] } : null;
    },

    toCommand(from, to) {
      return [command, { [spec.id]: from.id, [spec.target]: to.beforeId }];
    },
  });
}
