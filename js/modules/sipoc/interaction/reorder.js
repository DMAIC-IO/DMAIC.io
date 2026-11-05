/**
 * D.Mike — SIPOC: Einträge umsortieren (Geste reorder, Spec E1 §5.3).
 *
 * Geste und Kommando sprechen dieselbe Position `{ group, index }` mit
 * Endindex: Gruppe = Spaltenschlüssel, Index = Position nach dem
 * Verschieben. Keine Umrechnung. Gezogen wird nur am Griff `.sipoc__grip`.
 * Tastatur, Ansage („<Spalte>, Position n von m“), Abbruch und Ablehnung
 * liefert der Kern (core/interaction/).
 */
import { defineGesture } from '../../../core/interaction/define.js';

export const reorder = defineGesture({
  kind: 'reorder',
  handle: '.sipoc__grip',

  /** @param {{ group: string, index: number }|null} pos Vorschau, null = aufräumen */
  preview(pos) {
    this.dropPreview = pos;
  },

  /**
   * @param {{ group: string, index: number }} from
   * @param {{ group: string, index: number }} to
   * @returns {[string, object]}
   */
  toCommand(from, to) {
    return ['moveItem', { fromCol: from.group, fromIdx: from.index, toCol: to.group, toIdx: to.index }];
  },
});
