/**
 * D.Mike — Zielgrößenoptimierung: UI-State.
 *
 * Nicht gespeichert, wie in der Altform: die Achsen der Wirkungsfläche bei
 * mehr als zwei stetigen Faktoren und die Stufe je kategorialem Faktor. Leer
 * heißt: die ersten beiden stetigen Faktoren bzw. die Stufe des Optimums.
 * Jedes Optimieren setzt sie zurück.
 */
import { defineState, text, map } from '../../../core/model.js';

export const UiState = defineState({
  contourXId: text({ nullable: true }),
  contourYId: text({ nullable: true }),
  contourFixings: map(text(), text(), { default: {} }),
});
