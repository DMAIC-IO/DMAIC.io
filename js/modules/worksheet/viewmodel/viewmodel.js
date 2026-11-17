/**
 * D.Mike — Arbeitsblatt: Viewmodel (viewmodel/viewmodel.js)
 *
 * Inhalt und Kommandos liegen im Model (domain/model.js, `table()` je Blatt);
 * die Agentenfläche entsteht aus dessen Schema. Rückgängig/Wiederholen ist
 * der Verlauf des Kerns mit Umkehrung (`history: { mode: 'inverse' }`).
 *
 * Viewmodel-Kommandos betreffen nur die Ansicht oder Dateien, andere Module
 * erreichen sie nicht:
 * - `switchSheet` — welches Blatt gezeigt wird (Ansichtsfeld `activeSheetId`);
 * - `gridView` — Spaltenbreiten und Auswahl, wie das Raster sie meldet;
 * - `exportAs` — eine Datei aus dem aktiven Blatt (Mapper unten);
 * - `openFormulaEditor` — den Formel-Editor zeigen (Werkzeugleiste, F4,
 *   Doppelklick auf eine Formelzelle im Raster);
 * - `suggestChart` — `chart-suggestion` mit den gewählten Spalten öffnen;
 * - `confirmRoles` — die Rollen aus der Bestätigung vor dem Vorschlag setzen,
 *   alle zusammen als ein Schritt im Verlauf.
 *
 * Nach jeder Änderung des Models sendet das Modul `worksheet:dataChanged
 * { instanceId }`, zusammengefasst je Frame (`onCommand`); Ansichtskommandos
 * senden nicht.
 */
import { createModule } from '../../../core/template-module.js';
import { command, text, number, oneOf, list, object } from '../../../core/model.js';
import { runExport } from '../../../core/exporter.js';
import descriptor from '../module.js';
import { WorksheetModel } from '../domain/model.js';
import { GRID_VIEW_SHAPE } from '../domain/sheet.js';
import { showSheet, putGridView } from '../domain/view.js';
import { sheetRows, sheetRecords, XLSX_SHEET_NAME } from '../io/export.js';
import { UiState } from './state.js';
import { sheetsView, activeSheetOf } from './sheets.js';
import { toolbarView } from './toolbar.js';
import { dialogsView } from './dialogs.js';

/** Kommandos, die nur die Ansicht betreffen: kein `worksheet:dataChanged`. */
const VIEW_ONLY = new Set(['switchSheet', 'gridView', 'exportAs', 'openFormulaEditor', 'suggestChart']);

/** Instanzen mit Änderung im laufenden Frame → ihr Bus. */
const pending = new Map();
let scheduled = false;

/** Die gesammelten Änderungen senden: je Instanz ein Ereignis. */
function flushChanged() {
  scheduled = false;
  const due = [...pending];
  pending.clear();
  for (const [instanceId, eventBus] of due) eventBus?.emit?.('worksheet:dataChanged', { instanceId });
}

/**
 * Nach einem Kommando des Models (auch Rückgängig, auch ein geladener
 * Fremdstand mit `name` null): `worksheet:dataChanged` im nächsten Frame,
 * ohne DOM im nächsten Mikrotask. Mehrere Kommandos eines Frames ergeben ein
 * Ereignis je Instanz.
 * @param {string|null} name Kommando @param {{ instanceId: string, eventBus: any }} ctx
 * @returns {void}
 */
export function worksheetChanged(name, { instanceId, eventBus }) {
  if (name !== null && VIEW_ONLY.has(name)) return;
  pending.set(instanceId, eventBus);
  if (scheduled) return;
  scheduled = true;
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flushChanged);
  else queueMicrotask(flushChanged);
}

const optional = { optional: true };

export default createModule({
  descriptor,
  Model: WorksheetModel,
  State: UiState,
  history: { mode: 'inverse' },
  onCommand: worksheetChanged,
  commands: {
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
          try { this.model.setColumnRole({ sheetId, columnId, role }); } catch { /* Rolle bleibt */ }
        }
      },
    }),
  },
  view: [sheetsView, toolbarView, dialogsView],

  exports: {
    fileName: 'data',
    tables() { return { [XLSX_SHEET_NAME]: sheetRows(activeSheetOf(this)) }; },
    table() { return sheetRows(activeSheetOf(this)); },
    tree() { return sheetRecords(activeSheetOf(this)); },
  },
});
