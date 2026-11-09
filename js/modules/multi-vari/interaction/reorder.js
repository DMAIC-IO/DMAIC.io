/**
 * D.Mike — Multi-Vari: Faktorzeilen umsortieren (Geste reorder).
 *
 * Geste und Kommando sprechen dieselbe Position mit Endindex: der Index ist
 * die Position nach dem Verschieben, ohne Umrechnung. Es gibt eine Gruppe
 * `factors`. Gezogen wird nur am Griff `.multi-vari__grip`. Tastatur, Ansage,
 * Abbruch und Ablehnung liefert der Kern (core/interaction/).
 */
import { defineGesture } from '../../../core/interaction/define.js';

export const reorder = defineGesture({
  kind: 'reorder',
  handle: '.multi-vari__grip',

  /** @param {{ group: string, index: number }|null} pos Vorschau, null = aufräumen */
  preview(pos) {
    this.state.dropPreview = pos;
  },

  /**
   * @param {{ group: string, index: number }} from
   * @param {{ group: string, index: number }} to
   * @returns {[string, object]}
   */
  toCommand(from, to) {
    return ['moveFactor', { fromIdx: from.index, toIdx: to.index }];
  },
});
