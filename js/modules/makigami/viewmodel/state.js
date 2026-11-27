/**
 * D.Mike — Makigami: UI-State.
 *
 * Die Vorschau der Gesten Umsortieren: Gruppe (`steps` oder `roles`),
 * Endindex und id des gezogenen Elements. Je Komponente, nie gespeichert.
 */
import { defineState, oneOf, number, object, text } from '../../../core/model.js';

export const UiState = defineState({
  dropPreview: object({
    group: oneOf(['steps', 'roles']),
    index: number({ integer: true, min: 0 }),
    id: text(),
  }, { nullable: true }),
});
