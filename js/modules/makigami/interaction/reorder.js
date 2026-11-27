/**
 * D.Mike — Makigami: Schritte und Rollen umsortieren (zwei Gesten reorder).
 *
 * Schritte: Gruppe `steps` an der Kopfzeile der Matrix (`thead tr` mit
 * `data-reorder-group` und `data-reorder-closed`), je Schrittkopf ein `th`
 * mit `data-reorder-index` und `data-id`, gezogen am Griff
 * `.makigami__drag-handle--step`, waagrecht (`axis: 'x'`). Rollen: Gruppe
 * `roles` am `tbody` (ebenfalls abgeschlossen), je Rolle eine Zeile mit
 * Index und id, Griff `.makigami__drag-handle--role`, senkrecht. Die Zeile
 * „+ Rolle“ trägt keinen Index. Abgeschlossene Gruppen tauschen nichts aus:
 * eine Rolle auf dem Schrittkopf hat kein Ziel.
 *
 * Die Position trägt neben `{ group, index }` die id des gezogenen
 * Elements; das Kommando bekommt sie und den Endindex ohne Umrechnung.
 * Tastatur, Ansage, Abbruch und Ablehnung liefert der Kern
 * (core/interaction/).
 */
import { defineGesture } from '../../../core/interaction/define.js';
import { reorder as baseReorder } from '../../../core/interaction/gestures/reorder.js';

/**
 * @typedef {{ group: string, index: number, id: string }} Pick
 * @typedef {{ group: string, index: number }} Pos
 */

/**
 * Eine Geste reorder für eine Liste der Matrix.
 * @param {{ axis: 'x'|'y', handle: string, command: 'moveStep'|'moveRole', idParam: 'stepId'|'roleId' }} opts
 * @returns {Readonly<object>} Geste aus `defineGesture`
 */
function listGesture({ axis, handle, command, idParam }) {
  return defineGesture({
    kind: 'reorder',
    axis,
    handle,

    /**
     * Position am Griff: Gruppe, Index und id des Elements.
     * @param {HTMLElement} el Griff @returns {Pick}
     */
    start(el) {
      const id = /** @type {HTMLElement} */ (el.closest('[data-id]')).dataset.id ?? '';
      return { ...baseReorder.start(el), id };
    },

    /**
     * Bereich wie `reorder`, dazu die id des gezogenen Elements; am
     * Ausgangsplatz die Startposition selbst, damit der Kern „nicht bewegt“
     * erkennt und kein Kommando schickt.
     * @param {Pos} pos @param {object} ctx @param {Pick} from @returns {Pick|null}
     */
    clamp(pos, ctx, from) {
      const p = baseReorder.clamp(pos, ctx, from);
      if (!p) return null;
      return p.group === from.group && p.index === from.index ? from : { ...p, id: from.id };
    },

    /** @param {Pick|null} pos Vorschau, `null` räumt auf */
    preview(pos) {
      this.state.dropPreview = pos ? { group: pos.group, index: pos.index, id: pos.id } : null;
    },

    /**
     * @param {Pick} from @param {Pos} to @returns {[string, object]}
     */
    toCommand(from, to) {
      return [command, { [idParam]: from.id, to: to.index }];
    },
  });
}

/** Schrittkopf waagrecht ziehen → `moveStep({ stepId, to })`. */
export const stepReorder = listGesture({
  axis: 'x', handle: '.makigami__drag-handle--step', command: 'moveStep', idParam: 'stepId',
});

/** Rollenkopf senkrecht ziehen → `moveRole({ roleId, to })`. */
export const roleReorder = listGesture({
  axis: 'y', handle: '.makigami__drag-handle--role', command: 'moveRole', idParam: 'roleId',
});
