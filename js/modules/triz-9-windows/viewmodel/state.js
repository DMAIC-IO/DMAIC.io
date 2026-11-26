/**
 * D.Mike — TRIZ 9-Windows: UI-State.
 *
 * Das Fenster, dessen Bild die Großansicht zeigt (`null` ohne Großansicht).
 * Je Komponente, nie gespeichert.
 */
import { defineState, object, number } from '../../../core/model.js';

export const UiState = defineState({
  enlarged: object({ row: number({ integer: true }), col: number({ integer: true }) }, { nullable: true }),
});
