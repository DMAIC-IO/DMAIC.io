/**
 * D.Mike — Zufallsgenerator: UI-State.
 *
 * `target` ist die Wahl im Zielwähler (`''` ohne Wahl, `__create_worksheet__`
 * für ein neues Arbeitsblatt, sonst ein Zielschlüssel). Flüchtig wie der
 * Zielwähler der Altform.
 */
import { defineState, text } from '../../../core/model.js';

export const UiState = defineState({
  target: text({ default: '' }),
});
