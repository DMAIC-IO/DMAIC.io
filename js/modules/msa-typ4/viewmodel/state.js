/**
 * D.Mike — MSA Typ 4: UI-State.
 *
 * Ob der Abschnitt „Residuen“ aufgeklappt ist; erst dann hängt das
 * Residuen-Diagramm ein. Nicht gespeichert (wie die Altform).
 */
import { defineState, boolean } from '../../../core/model.js';

export const UiState = defineState({
  residualsOpen: boolean(),
});
