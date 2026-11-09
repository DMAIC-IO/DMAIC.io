/**
 * D.Mike — Multi-Vari: UI-State.
 *
 * Vorschau der Geste Umsortieren. Nicht gespeichert.
 */
import { defineState, oneOf, number, object } from '../../../core/model.js';

export const UiState = defineState({
  dropPreview: object({ group: oneOf(['factors']), index: number({ integer: true, min: 0 }) }, { nullable: true }),
});
