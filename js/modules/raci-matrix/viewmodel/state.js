/**
 * D.Mike — RACI-Matrix: UI-State.
 *
 * Das offene Umbenennen-Feld (Art und id des Eintrags) mit seinem Entwurf und
 * die Vorschau der Geste Umsortieren. Nicht gespeichert.
 */
import { defineState, oneOf, number, object, text } from '../../../core/model.js';

export const UiState = defineState({
  renaming: object({ kind: oneOf(['activity', 'stakeholder']), id: text() }, { nullable: true }),
  renameDraft: text(),
  dropPreview: object({ group: oneOf(['activities']), index: number({ integer: true, min: 0 }) }, { nullable: true }),
});
