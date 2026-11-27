/**
 * D.Mike — Activity-Flowchart: UI-State.
 *
 * Vorschau der Gesten, das offene Einfügemenü (an der Karte hinter dem Verbinder), der Auswahlmodus für den
 * Wiedereinstieg und die Auswahl im Importdialog. Je Komponente, nie
 * gespeichert. `flowPreview.band` ist eine Band-id (`main` oder `no:<id>`).
 */
import { defineState, number, object, text, oneOf, list } from '../../../core/model.js';

export const UiState = defineState({
  flowPreview: object({ id: text(), index: number({ integer: true, min: 0 }), band: text() }, { nullable: true }),
  substepPreview: object({ group: text(), index: number({ integer: true, min: 0 }), id: text() }, { nullable: true }),
  insertMenu: object({ stepId: text() }, { nullable: true }),
  pickBand: text({ nullable: true }),
  importOptions: list(object({ instanceId: text(), moduleId: oneOf(['process-map', 'sipoc']), label: text() })),
  importPick: text({ nullable: true }),
});
