/**
 * D.Mike — Modelldaten-Generator: UI-State.
 *
 * `shown`: der Knopf „Daten generieren“ wurde gedrückt; erst dann stehen
 * Kennzahlen und Vorschau da. Flüchtig wie der Ergebnisbereich der Altform.
 */
import { defineState, boolean } from '../../../core/model.js';

export const UiState = defineState({
  shown: boolean({ default: false }),
});
