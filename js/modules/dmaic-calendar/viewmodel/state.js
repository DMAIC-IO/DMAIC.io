/**
 * D.Mike — Projektkalender: UI-State.
 *
 * Angezeigter Zeitraum, Phasenfilter, Vorschau der Gesten und die gelesenen
 * Aufgaben der Aufgabenlisten (viewmodel/todos.js) — je Komponente, nie
 * gespeichert. Ansicht, Achse und Wochentage sind
 * Ansichtsfelder des Models (domain/model.js).
 */
import { defineState, number, date, phase, object, text, list, boolean } from '../../../core/model.js';

export const UiState = defineState({
  viewYear: number({ integer: true }),
  viewMonth: number({ integer: true, min: 0, max: 11 }),
  weekStart: date({ empty: true }),
  phaseFilter: phase({ nullable: true }),
  drawPreview: object({ date: date(), from: number({ integer: true }), to: number({ integer: true }) }, { nullable: true }),
  movePreview: object({ id: text(), date: date(), min: number({ integer: true }) }, { nullable: true }),
  resizePreview: object({ id: text(), start: number({ integer: true }), end: number({ integer: true }) }, { nullable: true }),
  todoReads: list(object({
    instanceId: text(),
    phase: text(),
    items: list(object({
      id: text(), text: text(), due: text(), cal: boolean(),
      time: text({ optional: true }), duration: number({ integer: true, optional: true }),
    })),
  })),
});
