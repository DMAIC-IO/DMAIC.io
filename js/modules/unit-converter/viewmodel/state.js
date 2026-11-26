/**
 * D.Mike — Einheitenumrechner: UI-State.
 *
 * Der Zeitpunkt der Weltzeituhr (Millisekunden), je Sekunde neu gesetzt.
 * Je Komponente, nie gespeichert.
 */
import { defineState, number } from '../../../core/model.js';

export const UiState = defineState({
  now: number(),
});
