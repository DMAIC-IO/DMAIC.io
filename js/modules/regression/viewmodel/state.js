/**
 * D.Mike — Regression: UI-State.
 *
 * Nicht gespeichert, wie in der Altform: die getippten Werte der Prognose je
 * Prädiktor-id (Text, Dezimalkomma erlaubt) und die im SS-Kreis
 * ausgeblendeten Einträge (Index in der Liste der Terme samt Residuen).
 */
import { defineState, text, number, list, map } from '../../../core/model.js';

export const UiState = defineState({
  predictInputs: map(text(), text(), { default: {} }),
  ssPieHidden: list(number({ integer: true, min: 0 }), { default: [] }),
});
