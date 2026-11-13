/**
 * D.Mike — Project charter: UI-State.
 *
 * Auswahl, Verschiebung und Zoom des Organigramms, ob der Nutzer die Ansicht
 * selbst eingestellt hat, das offene Stil-Panel, eingeklappte Positionen,
 * gemessene Knotenhöhen, das Ziel, dessen Löschen auf den zweiten Klick
 * wartet, der Farbentwurf des Stil-Panels und die Vorschau der Gesten.
 * Je Komponente, nie gespeichert.
 */
import { defineState, text, number, boolean, object, list, map } from '../../../core/model.js';

export const UiState = defineState({
  selectedId: text({ nullable: true }),
  pan: object({ x: number(), y: number() }),
  zoom: number({ min: 0.1, max: 3, default: 1 }),
  userAdjusted: boolean(),
  editorOpen: boolean(),
  collapsed: list(text(), { unique: true }),
  heights: map(text(), number({ min: 0 })),
  confirmGoalId: text({ nullable: true }),
  styleDraft: object({ key: text(), value: text() }, { nullable: true }),
  dragPreview: object({
    id: text(),
    parentId: text({ nullable: true }),
    index: number({ integer: true }),
    x: number(),
    y: number(),
  }, { nullable: true }),
  goalDragPreview: object({ id: text(), index: number({ integer: true }) }, { nullable: true }),
});
