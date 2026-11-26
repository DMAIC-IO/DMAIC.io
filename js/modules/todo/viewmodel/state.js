/**
 * D.Mike — Aufgabenliste: UI-State.
 *
 * Ob das Projekt einen Kalender hat (dann erscheint die Kalenderspalte) und
 * die Vorschau der Geste Umsortieren. Nicht gespeichert.
 */
import { defineState, oneOf, number, object, boolean } from '../../../core/model.js';

export const UiState = defineState({
  hasCalendar: boolean(),
  dropPreview: object({ group: oneOf(['todos']), index: number({ integer: true, min: 0 }) }, { nullable: true }),
});
