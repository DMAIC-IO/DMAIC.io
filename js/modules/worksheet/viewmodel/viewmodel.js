/**
 * D.Mike — Arbeitsblatt: Viewmodel (viewmodel/viewmodel.js)
 *
 * Inhalt und Kommandos liegen im Model (domain/model.js, `table()` je Blatt);
 * die Agentenfläche entsteht aus dessen Schema. Rückgängig/Wiederholen ist
 * der Verlauf des Kerns mit Umkehrung (`history: { mode: 'inverse' }`).
 *
 * Viewmodel-Kommandos betreffen die Ansicht, Dateien oder den Verlauf, andere
 * Module erreichen sie nicht:
 * - `undo`, `redo` — einen Schritt des Verlaufs ausführen (`historyStep`:
 *   die Umkehr-Kommandos sammeln selbst, es entsteht kein neuer Schritt);
 *   `false` bei leerem Verlauf oder abgeschlossenem Projekt;
 * - `switchSheet` — welches Blatt gezeigt wird (Ansichtsfeld `activeSheetId`);
 * - `gridView` — Spaltenbreiten und Auswahl, wie das Raster sie meldet;
 * - `exportAs` — eine Datei aus dem aktiven Blatt: CSV wie die Altform
 *   (`sheetCsv`), XLSX und JSON über die Mapper unten;
 * - `openFormulaEditor` — den Formel-Editor zeigen (Werkzeugleiste, F4,
 *   Doppelklick auf eine Formelzelle im Raster);
 * - `suggestChart` — `chart-suggestion` mit den gewählten Spalten öffnen;
 * - `confirmRoles` — die Rollen aus der Bestätigung vor dem Vorschlag setzen,
 *   alle zusammen als ein Schritt im Verlauf.
 *
 * Nach jeder Änderung des Models sendet das Modul `worksheet:dataChanged
 * { instanceId }`, zusammengefasst je Frame (`onCommand`, `changed.js`);
 * Ansichtskommandos senden nicht.
 *
 * Verlauf und Export stehen in der eigenen Werkzeugleiste (`ownToolbar`),
 * nicht noch einmal in der Leiste des Arbeitsbereichs.
 */
import { createModule } from '../../../core/template-module.js';
import { command, text, number, oneOf, list, object, boolean } from '../../../core/model.js';
import { runExport } from '../../../core/exporter.js';
import { downloadFile } from '../../../core/export-utils.js';
import descriptor from '../module.js';
import { WorksheetModel } from '../domain/model.js';
import { GRID_VIEW_SHAPE } from '../domain/sheet.js';
import { showSheet, putGridView } from '../domain/view.js';
import { sheetRows, sheetRecords, sheetCsv, XLSX_SHEET_NAME, EXPORT_FILE_NAME } from '../io/export.js';
import { UiState } from './state.js';
import { sheetsView, activeSheetOf } from './sheets.js';
import { toolbarView } from './toolbar.js';
import { dialogsView } from './dialogs.js';
import { worksheetChanged } from './changed.js';

const optional = { optional: true };

export default createModule({
  descriptor,
  Model: WorksheetModel,
  State: UiState,
  history: { mode: 'inverse' },
  ownToolbar: true,
  onCommand: worksheetChanged,
  commands: {
    undo: command({
      params: {},
      returns: boolean(),
      historyStep: true,
      run() { return this.stepHistory('undo'); },
    }),
    redo: command({
      params: {},
      returns: boolean(),
      historyStep: true,
      run() { return this.stepHistory('redo'); },
    }),
    switchSheet: command({
      params: { id: text() },
      run({ id }) { return showSheet(this.model, id); },
    }),
    gridView: command({
      params: { sheetId: text(), colWidths: GRID_VIEW_SHAPE.colWidths, selection: GRID_VIEW_SHAPE.selection },
      run({ sheetId, colWidths, selection }) { putGridView(this.model, sheetId, { colWidths, selection }); },
    }),
    exportAs: command({
      params: { format: oneOf(['xlsx', 'csv', 'json']) },
      run({ format }) {
        this.state.exportOpen = false;
        if (format === 'csv') {
          // Zeichengleich zur Altform (DataGrid.downloadCSV): BOM, `data.csv`, keine Meldung.
          const csv = sheetCsv(activeSheetOf(this), this._ui.i18n.getLanguage());
          downloadFile(csv, `${EXPORT_FILE_NAME}.csv`, 'text/csv;charset=utf-8');
          return;
        }
        void runExport(this._ui, format);
      },
    }),
    openFormulaEditor: command({
      params: {
        sheetId: text(optional), columnId: text(optional), row: number({ integer: true, min: 0, optional: true }),
      },
      run(args) { this.showFormulaEditor(args); },
    }),
    suggestChart: command({
      params: {},
      run() { this.startChartSuggestion(); },
    }),
    confirmRoles: command({
      params: { sheetId: text(), roles: list(object({ columnId: text(), role: text() })) },
      run({ sheetId, roles }) {
        for (const { columnId, role } of roles) {
          // Eine Rolle, die der Typ nicht erlaubt, bleibt wie sie ist (wie die Altform).
          try {
            this.model.setColumnRole({ sheetId, columnId, role });
          } catch (err) {
            console.warn('[worksheet] confirmRoles: setColumnRole', columnId, err);
          }
        }
      },
    }),
  },
  view: [sheetsView, toolbarView, dialogsView],

  exports: {
    fileName: EXPORT_FILE_NAME,
    tables() { return { [XLSX_SHEET_NAME]: sheetRows(activeSheetOf(this)) }; },
    table() { return sheetRows(activeSheetOf(this)); },
    tree() { return sheetRecords(activeSheetOf(this)); },
  },
});
