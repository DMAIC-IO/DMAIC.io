/**
 * D.Mike — GLM-Regression: UI-State.
 *
 * Nicht gespeichert, wie in der Altform: die getippten Werte der Prognose je
 * Term (Text, Dezimalkomma erlaubt) und ob „Berechnen“ gedrückt wurde.
 */
import { defineState, text, boolean, map } from '../../../core/model.js';

export const UiState = defineState({
  predictInputs: map(text(), text(), { default: {} }),
  predictShown: boolean(),
});
