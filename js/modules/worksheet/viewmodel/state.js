/**
 * D.Mike — Arbeitsblatt: UI-State (viewmodel/state.js)
 *
 * Flüchtiger Zustand der Oberfläche, nicht gespeichert: Inline-Umbenennen
 * eines Reiters, Kontextmenü der Reiter, Exportmenü der Werkzeugleiste,
 * Entwurf des Formel-Editors samt offenem Funktionsmenü und die Zeilen der
 * Rollenbestätigung vor dem Diagrammvorschlag.
 */
import { defineState, text, number, boolean, object, list } from '../../../core/model.js';

const cellTarget = object({
  sheetId: text(), columnId: text(), row: number({ integer: true, min: 0 }),
}, { nullable: true });

const point = () => number({ default: 0 });

export const UiState = defineState({
  /** Reiter, dessen Name gerade inline bearbeitet wird. */
  renamingSheetId: text({ nullable: true }),
  /** Entwurf des Namens beim Inline-Umbenennen. */
  renameDraft: text(),
  /** Offenes Kontextmenü eines Reiters (Blatt und Mausposition). */
  tabMenu: object({ sheetId: text(), x: point(), y: point() }, { nullable: true }),
  /** Exportmenü der Werkzeugleiste offen. */
  exportOpen: boolean(),
  /** Zielzelle des offenen Formel-Editors. */
  formulaTarget: cellTarget,
  /** Text im Formel-Editor. */
  formulaText: text(),
  /** Offenes Funktionsmenü im Formel-Editor (id des Eintrags) und seine Lage. */
  formulaMenu: text({ nullable: true }),
  formulaMenuTop: point(),
  formulaMenuLeft: point(),
  /**
   * Auswahl, die das Raster gerade zeigt (Ereignis `datagrid-selection`), und
   * ihr Blatt: die Statuszeile folgt ihr sofort; das Model (`gridView`)
   * bekommt sie entprellt.
   */
  liveSelectionSheetId: text({ nullable: true }),
  liveSelection: object({
    startCol: number(), startRow: number(), endCol: number(), endRow: number(),
    activeCol: number(), activeRow: number(),
  }, { nullable: true }),
  /** Projekt abgeschlossen (Nur-Lesen), geführt über `project:status-changed`. */
  projectCompleted: boolean(),
  /** Zeilen der Rollenbestätigung vor dem Diagrammvorschlag. */
  roleDraft: list(object({
    columnId: text(), name: text(), type: text(), role: text(),
    options: list(object({ value: text(), label: text() })),
  })),
});
