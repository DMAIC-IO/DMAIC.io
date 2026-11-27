/**
 * D.Mike — Process Map: UI-State.
 *
 * Vorschau der drei Gesten, ob das Projekt einen SIPOC hat (Leerzustand)
 * und die Auswahl im Importdialog. Je Komponente, nie gespeichert.
 */
import { defineState, boolean, number, object, text, list } from '../../../core/model.js';

export const UiState = defineState({
  chainPreview: object({ id: text(), index: number({ integer: true, min: 0 }), band: text({ nullable: true }) }, { nullable: true }),
  substepPreview: object({ group: text(), index: number({ integer: true, min: 0 }), id: text() }, { nullable: true }),
  ioPreview: object({ group: text(), index: number({ integer: true, min: 0 }), id: text() }, { nullable: true }),
  sipocAvailable: boolean(),
  importOptions: list(object({
    instanceId: text(),
    label: text(),
    processCount: number({ integer: true, min: 0 }),
    processPreview: list(text()),
  })),
  importPick: text({ nullable: true }),
});
