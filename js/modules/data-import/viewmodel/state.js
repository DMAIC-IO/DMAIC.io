/**
 * D.Mike — Datenimport: UI-State.
 *
 * `sourceRev` zählt die eingelesenen Quellen; der Lauf `parse` liest ihn,
 * damit eine neue Quelle (Bytes in der Closure des Viewmodels) ihn neu
 * startet. Nicht gespeichert.
 */
import { defineState, number } from '../../../core/model.js';

export const UiState = defineState({
  sourceRev: number({ integer: true, min: 0, default: 0 }),
});
