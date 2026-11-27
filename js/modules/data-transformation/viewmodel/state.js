/**
 * D.Mike — Datentransformation: UI-State.
 *
 * `target` ist die Wahl im Zielwähler (`''` ohne Wahl, `__create_worksheet__`
 * für ein neues Arbeitsblatt, sonst ein Zielschlüssel). Flüchtig wie der
 * Zielwähler der Altform; sie übersteht neue Läufe der Rechnung.
 */
import { defineState, text } from '../../../core/model.js';

export const UiState = defineState({
  target: text({ default: '' }),
});
