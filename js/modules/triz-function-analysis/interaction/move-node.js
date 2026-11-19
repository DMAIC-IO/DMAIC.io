/**
 * D.Mike — TRIZ function analysis: Kästen im Funktionsmodell verschieben
 * (Geste move).
 *
 * Position `{ id, x, y }` in Modell-Pixeln. Markup-Vertrag: jeder Kasten ist
 * ein Griff `.tfa__node` mit `data-id`, `data-tfa-x` und `data-tfa-y` (aktuelle
 * Lage). Ein Ablegen ergibt genau ein Kommando `moveComponent { id, x, y }`;
 * Pfeiltasten verschieben in 10-px-Schritten, Koordinaten sind gerundet und ≥ 0.
 */
import { defineGesture } from '../../../core/interaction/define.js';

/** Pfeiltasten-Schritt in Modell-Pixeln. */
const KEY_STEP = 10;

export const moveNode = defineGesture({
  kind: 'move',
  handle: '.tfa__node',

  /** @param {HTMLElement} el Kasten @returns {{ id: string, x: number, y: number }} */
  start(el) {
    return { id: el.dataset.id, x: Number(el.dataset.tfaX), y: Number(el.dataset.tfaY) };
  },

  /**
   * @param {{ x: number, y: number }} point @param {{ origin: { x: number, y: number } }} ctx
   * @param {{ id: string, x: number, y: number }} from
   * @returns {{ id: string, x: number, y: number }}
   */
  locate(point, ctx, from) {
    return { id: from.id, x: from.x + point.x - ctx.origin.x, y: from.y + point.y - ctx.origin.y };
  },

  /** @param {{ id: string, x: number, y: number }} pos @param {{ x: number, y: number }} dir */
  step(pos, dir) {
    return { ...pos, x: pos.x + dir.x * KEY_STEP, y: pos.y + dir.y * KEY_STEP };
  },

  /** @param {{ id: string, x: number, y: number }} pos Lage gerundet und ≥ 0 */
  clamp(pos) {
    return { ...pos, x: Math.max(0, Math.round(pos.x)), y: Math.max(0, Math.round(pos.y)) };
  },

  /** @param {{ id: string, x: number, y: number }|null} pos Vorschau, `null` räumt auf */
  preview(pos) {
    this.state.dragPreview = pos ? { id: pos.id, x: pos.x, y: pos.y } : null;
  },

  /**
   * @param {{ id: string, x: number, y: number }} pos
   * @param {(key: string, params?: object) => string} t @returns {string}
   */
  announce(pos, t) {
    const found = (this.model.components ?? []).find((c) => c.id === pos.id);
    const name = found?.name?.trim() || t('modules.triz-function-analysis.unnamed');
    return t('modules.triz-function-analysis.announce.move', { name, x: pos.x, y: pos.y });
  },

  toCommand(from, to) {
    return ['moveComponent', { id: from.id, x: to.x, y: to.y }];
  },
});
