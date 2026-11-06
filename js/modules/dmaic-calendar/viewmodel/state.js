/**
 * D.Mike — Projektkalender: UI-State.
 *
 * Angezeigter Zeitraum, Phasenfilter und Vorschau der Gesten — je
 * Komponente, nie gespeichert. Ansicht, Achse und Wochentage sind
 * Ansichtsfelder des Models (domain/model.js).
 */
import { defineState, number, date, phase, object, text } from '../../../core/model.js';

export const UiState = defineState({
  viewYear: number({ integer: true }),
  viewMonth: number({ integer: true, min: 0, max: 11 }),
  weekStart: date({ empty: true }),
  phaseFilter: phase({ nullable: true }),
  drawPreview: object({ date: date(), from: number({ integer: true }), to: number({ integer: true }) }, { nullable: true }),
  movePreview: object({ id: text(), date: date(), min: number({ integer: true }) }, { nullable: true }),
  resizePreview: object({ id: text(), start: number({ integer: true }), end: number({ integer: true }) }, { nullable: true }),
});
