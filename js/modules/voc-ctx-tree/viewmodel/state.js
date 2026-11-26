/**
 * D.Mike — VoC → CTx-Baum: UI-State.
 *
 * Der Farbentwurf des Stil-Panels (solange der Farbwähler offen ist) und die
 * Vorschau der Geste Umsortieren (der Knoten, an dessen Stelle der gezogene
 * rückt). Je Komponente, nie gespeichert.
 */
import { defineState, object, text } from '../../../core/model.js';

export const UiState = defineState({
  styleDraft: object({ key: text(), value: text() }, { nullable: true }),
  dropTarget: text({ nullable: true }),
});
