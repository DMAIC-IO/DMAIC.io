/**
 * D.Mike — Activity-Flowchart: Gesten.
 *
 * `flow` (Geste `move`, Griff `.af__grip`): ein Schritt hat zwei getrennte
 * Ziele. Auf einem Verbinder `[data-gap]` abgelegt, wechselt er die Stelle in
 * der Kette und behält sein Band (`moveStep`); auf einer Bandzeile
 * `.af__lane[data-band-id]` abgelegt — auch über einer Karte —, wechselt er das
 * Band und behält seine Stelle (`setStepBand`). Eine Raute nimmt ihr Band als
 * Block mit. Ungültige Bänder (Raute nicht davor) sind kein Ziel.
 * Tastatur: ←/→ Stelle ±1, ↑/↓ nächstes gültiges Band.
 *
 * Position `{ id, index, band }`: `index` ist der Endindex des Schritts bzw.
 * der Raute, `band` die Band-id. Ausgang ist die eigene Stelle (`data-step-index`,
 * `data-band-id` an der Karte); genau einer der beiden Werte weicht ab.
 *
 * `substeps`: Unterschritte umsortieren am Griff `.fc-substep-grip` (Kern).
 */
import { defineGesture } from '../../../core/interaction/define.js';
import { substepGesture } from '../../../core/flowchart/interaction/substeps.js';
import { blockIndices, gapToIndex, validBands } from '../domain/branches.js';
import { bandRows, bandLabel } from '../domain/layout.js';

/** @typedef {{ id: string, index: number, band: string }} FlowPosition */

/**
 * @param {Element} el @param {{ x: number, y: number }} p
 * @returns {boolean} liegt der Punkt im Rechteck des Elements?
 */
function contains(el, p) {
  const r = el.getBoundingClientRect();
  return p.x >= r.left && p.x < r.right && p.y >= r.top && p.y < r.bottom;
}

/**
 * Höchster Endindex des Schritts `id`: Kettenlänge ohne seinen Block.
 * @param {any[]} steps @param {string} id @returns {number}
 */
function maxIndex(steps, id) {
  return steps.length - blockIndices(steps, id).length;
}

/**
 * Die Band-ids von oben nach unten (ohne Beschriftung).
 * @param {any[]} steps @returns {string[]}
 */
function bandOrder(steps) {
  return bandRows(steps, () => '').map((b) => b.id);
}

export const flow = defineGesture({
  kind: 'move',
  handle: '.af__grip',

  /** @param {HTMLElement} el Griff @returns {FlowPosition} */
  start(el) {
    const card = /** @type {HTMLElement} */ (el.closest('[data-step-id]'));
    return { id: card.dataset.stepId, index: Number(card.dataset.stepIndex), band: card.dataset.bandId };
  },

  /**
   * Verbinder unter dem Zeiger → Stelle, sonst Bandzeile → Band, sonst kein Ziel.
   * @param {{ x: number, y: number }} point @param {{ root: Element }} ctx @param {FlowPosition} from
   * @returns {FlowPosition|null}
   */
  locate(point, ctx, from) {
    for (const gap of Array.from(ctx.root.querySelectorAll('[data-gap]'))) {
      if (!contains(gap, point)) continue;
      const at = gapToIndex(this.model.steps, from.id, Number(/** @type {HTMLElement} */ (gap).dataset.gap));
      return { id: from.id, index: at, band: from.band };
    }
    for (const lane of Array.from(ctx.root.querySelectorAll('.af__lane[data-band-id]'))) {
      if (contains(lane, point)) return { id: from.id, index: from.index, band: /** @type {HTMLElement} */ (lane).dataset.bandId };
    }
    return null;
  },

  /**
   * ←/→ Stelle ±1 (Band zurück auf den Ausgang), ↑/↓ nächstes gültiges Band
   * (Stelle zurück auf den Ausgang); am Rand kein Ziel.
   * @param {FlowPosition} pos @param {{ x: number, y: number }} dir @param {object} _ctx @param {FlowPosition} from
   * @returns {FlowPosition|null}
   */
  step(pos, dir, _ctx, from) {
    const steps = this.model.steps;
    if (dir.x) {
      const index = pos.index + dir.x;
      return index >= 0 && index <= maxIndex(steps, from.id) ? { id: from.id, index, band: from.band } : null;
    }
    if (!dir.y) return null;
    const order = bandOrder(steps);
    const valid = new Set(validBands(steps, from.id));
    for (let i = order.indexOf(pos.band) + dir.y; i >= 0 && i < order.length; i += dir.y) {
      if (valid.has(order[i])) return { id: from.id, index: from.index, band: order[i] };
    }
    return null;
  },

  /**
   * Stelle auf `0…länge − Blockgröße`; ein ungültiges Band ist kein Ziel.
   * @param {FlowPosition} pos @param {object} _ctx @param {FlowPosition} from
   * @returns {FlowPosition|null}
   */
  clamp(pos, _ctx, from) {
    const steps = this.model.steps;
    if (pos.band !== from.band && !validBands(steps, from.id).includes(pos.band)) return null;
    return { id: from.id, index: Math.max(0, Math.min(pos.index, maxIndex(steps, from.id))), band: pos.band };
  },

  /** @param {FlowPosition|null} pos Vorschau, `null` räumt auf */
  preview(pos) {
    this.state.flowPreview = pos;
  },

  /**
   * Stelle geändert → `moveStep`, sonst Band geändert → `setStepBand`.
   * @param {FlowPosition} from @param {FlowPosition} to
   * @returns {[string, object]}
   */
  toCommand(from, to) {
    return to.index !== from.index
      ? ['moveStep', { id: from.id, index: to.index }]
      : ['setStepBand', { stepId: from.id, bandId: to.band }];
  },

  /**
   * Bandziel: der Name des Bands; Stellenziel: Position unter den möglichen.
   * @param {FlowPosition} pos @param {(key: string, params?: object) => string} t
   * @param {object} _ctx @param {FlowPosition} from @returns {string}
   */
  announce(pos, t, _ctx, from) {
    const steps = this.model.steps;
    if (pos.band !== from.band) {
      const row = bandRows(steps, (owner) => bandLabel(owner, t)).find((b) => b.id === pos.band);
      return t('gestureBand', { band: row ? row.label : pos.band });
    }
    return t('common.gesture.position', { pos: pos.index + 1, total: maxIndex(steps, from.id) + 1 });
  },
});

export const substeps = substepGesture({ handle: '.fc-substep-grip' });
