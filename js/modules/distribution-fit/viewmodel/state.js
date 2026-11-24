/**
 * D.Mike — Verteilungstest: UI-State.
 *
 * Klappzustand der Normalitäts-Tiefenanalyse — je Komponente, nie
 * gespeichert; nach dem Neuladen ist sie aufgeklappt.
 */
import { defineState, boolean } from '../../../core/model.js';

export const UiState = defineState({
  nddCollapsed: boolean(),
});
