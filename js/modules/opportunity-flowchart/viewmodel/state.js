/**
 * D.Mike — Opportunity-Flowchart: UI-State.
 *
 * Offenes Einfügemenü, Vorschau der Gesten und die Auswahl im Importdialog.
 * Je Komponente, nie gespeichert.
 */
import { defineState, number, object, text, oneOf, list } from '../../../core/model.js';

export const UiState = defineState({
  insertMenuAt: number({ integer: true, min: 1, nullable: true }),
  chainPreview: object({ id: text(), index: number({ integer: true, min: 0 }), band: oneOf(['va', 'nva']) }, { nullable: true }),
  substepPreview: object({ group: text(), index: number({ integer: true, min: 0 }), id: text() }, { nullable: true }),
  importOptions: list(object({ instanceId: text(), moduleId: oneOf(['process-map', 'sipoc']), label: text() })),
  importPick: text({ nullable: true }),
});
