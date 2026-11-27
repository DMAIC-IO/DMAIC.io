/**
 * D.Mike — Flowchart: Schritt in der Kette verschieben (Geste move).
 *
 * Position `{ id, index, band }`: `index` ist der Endindex in der Kette,
 * `band` das Band des Schritts (ohne Bänder `null`). Ein Ablegen ergibt genau
 * ein Kommando `moveStep { id, index, <bandParam>? }`; der Bandparameter
 * (Vorgabe `side`) nur bei Bandwechsel.
 *
 * Bänder: eine feste Liste in Anzeigereihenfolge oder `'dom'` — dann liest
 * jeder Aufruf die Bandfolge aus den `[data-band]`-Slots der gezogenen Spalte
 * (Bänder aus Nutzerdaten, die zwischen zwei Gesten entstehen können).
 *
 * Markup-Vertrag: jede Spalte trägt `data-step-id` und `data-step-index`, ein
 * Slot eines Bands `data-band`; der Griff liegt in Spalte und Slot seines
 * Schritts. Zeiger: Index aus den Spaltenmitten, Band aus dem Slot unter dem
 * Zeiger. Tastatur: ←/→ Index ±1, ↑/↓ Band ±1 (nur mit Bändern).
 */
import { defineGesture } from '../../interaction/define.js';

const COLUMN = '[data-step-index]';
const BAND = '[data-band]';

/** @param {Element} root @returns {HTMLElement[]} Spalten in DOM-Reihenfolge */
const columnsOf = (root) => [...root.querySelectorAll(COLUMN)];

/**
 * Band des Slots, dessen senkrechte Ausdehnung `y` enthält.
 * @param {Element} root @param {number} y @returns {string|null}
 */
function bandAt(root, y) {
  for (const slot of root.querySelectorAll(BAND)) {
    const r = slot.getBoundingClientRect();
    if (y >= r.top && y < r.bottom) return /** @type {HTMLElement} */ (slot).dataset.band;
  }
  return null;
}

/**
 * Bandfolge der Spalte des Schritts `id`, oben nach unten.
 * @param {Element} root @param {string} id @returns {string[]}
 */
function domBands(root, id) {
  const col = root.querySelector(`${COLUMN}[data-step-id="${CSS.escape(id)}"]`);
  return col ? [...col.querySelectorAll(BAND)].map((slot) => /** @type {HTMLElement} */ (slot).dataset.band) : [];
}

/**
 * @param {{ handle: string, bands?: string[]|'dom', bandParam?: string }} opts `bands` in
 *   Anzeigereihenfolge (oben nach unten) oder `'dom'` (aus den Slots der Spalte); ohne
 *   Bänder nur die Index-Achse. `bandParam`: Name des Bandparameters im Kommando.
 * @returns {Readonly<object>} Geste aus `defineGesture`
 */
export function chainGesture({ handle, bands = [], bandParam = 'side' }) {
  const fromDom = bands === 'dom';
  const fixed = Object.freeze(fromDom ? [] : [...bands]);
  /** @param {any} ctx @param {{ id: string }} from @returns {readonly string[]} */
  const orderOf = (ctx, from) => (fromDom ? domBands(ctx.root, from.id) : fixed);
  return defineGesture({
    kind: 'move',
    handle,

    /** @param {HTMLElement} el Griff @returns {{ id: string, index: number, band: string|null }} */
    start(el) {
      const col = /** @type {HTMLElement} */ (el.closest('[data-step-id]'));
      const slot = /** @type {HTMLElement|null} */ (el.closest(BAND));
      return { id: col.dataset.stepId, index: Number(col.dataset.stepIndex), band: slot ? slot.dataset.band : null };
    },

    locate(point, ctx, from) {
      const at = ctx.listIndexAt(columnsOf(ctx.root), point, 'x');
      const band = fromDom || fixed.length ? bandAt(ctx.root, point.y) ?? from.band : from.band;
      return { id: from.id, index: at > from.index ? at - 1 : at, band };
    },

    step(pos, dir, ctx, from) {
      if (dir.x) return { ...pos, index: pos.index + dir.x };
      if (!dir.y) return null;
      const order = orderOf(ctx, from);
      if (!order.length) return null;
      const at = order.indexOf(pos.band);
      if (at < 0) return null;
      const i = at + dir.y;
      return i >= 0 && i < order.length ? { ...pos, band: order[i] } : null;
    },

    clamp(pos, ctx, from) {
      const max = columnsOf(ctx.root).length - 1;
      return {
        id: pos.id,
        index: Math.max(0, Math.min(pos.index, max)),
        band: orderOf(ctx, from).includes(pos.band) ? pos.band : from.band,
      };
    },

    /** @param {{ id: string, index: number, band: string|null }|null} pos Vorschau, `null` räumt auf */
    preview(pos) {
      this.state.chainPreview = pos;
    },

    toCommand(from, to) {
      return ['moveStep', { id: from.id, index: to.index, ...(to.band !== from.band ? { [bandParam]: to.band } : {}) }];
    },

    announce(pos, t, ctx) {
      return t('common.gesture.position', { pos: pos.index + 1, total: columnsOf(ctx.root).length });
    },
  });
}
