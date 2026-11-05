/**
 * D.Mike — SIPOC: UI-State.
 *
 * Vorschau der Geste. Nicht gespeichert.
 */
import { defineState, oneOf, number, object } from '../../../core/model.js';
import { COL_KEYS } from '../domain/model.js';

export const UiState = defineState({
  dropPreview: object({ group: oneOf(COL_KEYS), index: number({ integer: true, min: 0 }) }, { nullable: true }),
});
