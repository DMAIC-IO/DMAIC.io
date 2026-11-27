/**
 * D.Mike — Process Map: Gesten.
 *
 * Kette: ein Schritt wandert an seiner Schrittnummer (`.pmap__step-number`)
 * an eine andere Stelle; ohne Bänder, nur die Index-Achse. Unterschritte:
 * Umsortieren innerhalb ihres Schritts am Griff `.fc-substep-grip`.
 * IO: ein Input oder Output wandert an seinem Punkt (`.pmap__io-dot`)
 * innerhalb seiner Liste. Tastatur, Ansage, Abbruch und Ablehnung liefert
 * der Kern.
 */
import { chainGesture } from '../../../core/flowchart/interaction/chain.js';
import { substepGesture } from '../../../core/flowchart/interaction/substeps.js';
import { defineGesture } from '../../../core/interaction/define.js';
import { reorder, groupsOf, itemsOf } from '../../../core/interaction/gestures/reorder.js';

export const chain = chainGesture({ handle: '.pmap__step-number' });
export const substeps = substepGesture({ handle: '.fc-substep-grip' });

/**
 * @typedef {{ group: string, index: number }} Pos
 * @typedef {Pos & { id: string, stepId: string, type: 'inputs'|'outputs' }} IoFrom
 * @typedef {Pos & { targetId?: string }} IoTo
 */

/**
 * id des Eintrags, der vor dem Verschieben an `index` der Gruppe steht.
 * @param {Element} root @param {string} group @param {number} index @returns {string|undefined}
 */
function ioIdAt(root, group, index) {
  const g = groupsOf(root).find((el) => el.dataset.reorderGroup === group);
  const item = g && itemsOf(g).find((el) => Number(el.dataset.reorderIndex) === index);
  return item?.dataset.ioId;
}

/**
 * Markup-Vertrag: je Schritt und Liste eine abgeschlossene Gruppe
 * (`data-reorder-group="<stepId>:<type>"`, `data-reorder-closed`, dazu
 * `data-io-step` und `data-io-type`), darin jeder Eintrag mit
 * `data-reorder-index` und `data-io-id`. Das Kommando `moveIO` bekommt die id
 * des Eintrags, der am Zielplatz steht.
 */
export const io = defineGesture({
  kind: 'reorder',
  axis: 'y',
  handle: '.pmap__io-dot',

  /**
   * Position am Griff: Gruppe, Index, id des Eintrags, Schritt und Liste.
   * @param {HTMLElement} el Griff @returns {IoFrom}
   */
  start(el) {
    const item = /** @type {HTMLElement} */ (el.closest('[data-io-id]'));
    const group = /** @type {HTMLElement} */ (el.closest('[data-reorder-group]'));
    return {
      ...reorder.start(el),
      id: /** @type {string} */ (item.dataset.ioId),
      stepId: /** @type {string} */ (group.dataset.ioStep),
      type: /** @type {'inputs'|'outputs'} */ (group.dataset.ioType),
    };
  },

  /**
   * Bereich wie `reorder`; am Ausgangsplatz die Startposition selbst (kein
   * Kommando), sonst mit der id des Eintrags am Zielplatz.
   * @param {Pos} pos @param {{ root: Element }} ctx @param {IoFrom} from
   * @returns {IoTo|IoFrom|null}
   */
  clamp(pos, ctx, from) {
    const p = reorder.clamp(pos, ctx, from);
    if (!p) return null;
    if (p.group === from.group && p.index === from.index) return from;
    return { ...p, targetId: ioIdAt(ctx.root, p.group, p.index) };
  },

  /** @param {Pos|null} pos Vorschau, `null` räumt auf */
  preview(pos) {
    this.state.ioPreview = pos ? { group: pos.group, index: pos.index } : null;
  },

  /**
   * @param {IoFrom} from @param {IoTo} to
   * @returns {[string, object]}
   */
  toCommand(from, to) {
    return ['moveIO', { stepId: from.stepId, type: from.type, ioId: from.id, targetIoId: to.targetId }];
  },
});
