/**
 * D.Mike — MSA Typ 5: UI-State.
 *
 * Filter der Teile-Tabelle. Reine Anzeigevorliebe, nicht gespeichert: ein
 * neu geladenes Projekt zeigt alle Teile.
 */
import { defineState, boolean } from '../../../core/model.js';

export const UiState = defineState({
  onlyDisputed: boolean(),
});
