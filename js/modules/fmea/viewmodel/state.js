/**
 * D.Mike — FMEA: UI-State.
 *
 * Ob die Skalen sichtbar sind und ob das Burndown-Fenster offen ist. Nicht
 * gespeichert.
 */
import { defineState, boolean } from '../../../core/model.js';

export const UiState = defineState({
  scaleVisible: boolean(),
  burndownOpen: boolean(),
});
