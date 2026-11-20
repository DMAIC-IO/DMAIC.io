/**
 * D.Mike — TRIZ-Funktionsanalyse: UI-State.
 *
 * Die Auswahl im Funktionsmodell (Komponente oder Funktion) und die Lage des
 * gezogenen Kastens während der Geste. Je Komponente, nie gespeichert.
 */
import { defineState, text, number, object } from '../../../core/model.js';

export const UiState = defineState({
  selectedId: text({ nullable: true }),
  dragPreview: object({ id: text(), x: number(), y: number() }, { nullable: true }),
});
