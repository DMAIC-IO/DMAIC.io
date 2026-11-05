/**
 * D.Mike — SIPOC: UI-State.
 *
 * Entwürfe der Eingabezeilen und des Bearbeiten-Formulars, Vorschau der
 * Geste. Nicht gespeichert.
 */
import { defineState, text, oneOf, number, record, object } from '../../../core/model.js';
import { COL_KEYS } from '../domain/model.js';

export const UiState = defineState({
  drafts: record(COL_KEYS, text()),
  editDraft: object({ text: text() }),
  dropPreview: object({ group: oneOf(COL_KEYS), index: number({ integer: true, min: 0 }) }, { nullable: true }),
});
