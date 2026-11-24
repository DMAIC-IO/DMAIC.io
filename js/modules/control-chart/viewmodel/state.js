/**
 * D.Mike — Regelkarte für Variablen: UI-State.
 *
 * Klappzustand der Regelliste — je Komponente, nie gespeichert.
 */
import { defineState, boolean } from '../../../core/model.js';

export const UiState = defineState({
  nelsonCollapsed: boolean(),
});
