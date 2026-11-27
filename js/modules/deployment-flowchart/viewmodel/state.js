/**
 * D.Mike — Deployment-Flowchart: UI-State.
 *
 * Vorschau der Gesten und die Auswahl im Importdialog. Je Komponente, nie
 * gespeichert. `chainPreview.band` ist eine Bahn-id (Bahnen aus Nutzerdaten).
 */
import { defineState, number, object, text, oneOf, list } from '../../../core/model.js';

export const UiState = defineState({
  chainPreview: object({ id: text(), index: number({ integer: true, min: 0 }), band: text() }, { nullable: true }),
  substepPreview: object({ group: text(), index: number({ integer: true, min: 0 }), id: text() }, { nullable: true }),
  importOptions: list(object({ instanceId: text(), moduleId: oneOf(['process-map', 'sipoc']), label: text() })),
  importPick: text({ nullable: true }),
});
